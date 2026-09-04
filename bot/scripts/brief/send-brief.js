#!/usr/bin/env node
/**
 * send-brief — deliver a rendered Morning Brief to the team.
 *
 * The Python renderer (brief/cli.py) writes a set of chart PNGs plus a
 * manifest.json into `<BRIEF_OUT_DIR>/latest/<kind>/`. This script reads
 * that manifest and posts it, in order, through the bot's messaging router:
 *
 *   1. the cover panel, captioned with the manifest's `lead`
 *   2. every remaining panel, each with its own caption
 *   3. the `closer` as a text message (plus a "Live: <url>" line when the
 *      brief has a live page)
 *
 * Recipients are whatever the deployment's drivers understand — a bare
 * WhatsApp number or group JID, "slack:channel:C…", "discord:channel:…" —
 * so the same brief lands on whichever channel the team actually reads.
 *
 * Idempotent by design: a cron that fires twice, or an operator re-running
 * after a partial failure, must not double-post. `sent.json` beside the
 * manifest records which targets have received THIS brief (by kind + day);
 * those are skipped unless --force. A target that only partly sent is not
 * recorded, so a re-run retries it. One target failing never stops the
 * others; the exit code is non-zero only when every target failed.
 *
 * Usage:
 *   node bot/scripts/brief/send-brief.js [--kind daily|weekly] [--dir <manifest dir>]
 *                                        [--to <targets>] [--dry-run] [--force]
 *
 * The messaging router is required lazily and can be injected (tests, or
 * the worker) — loading it pulls in the channel drivers, which a --dry-run
 * has no need for.
 *
 * @module send-brief
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const KINDS = ['daily', 'weekly'];
const SENT_LOG = 'sent.json';
const CAPTION_PREVIEW = 60;

/**
 * Where the renderer left the latest brief of this kind — anchored to the
 * repo root, never the working directory, so cron and a hand-run `rumi
 * brief` agree on the location.
 */
function defaultManifestDir(kind = 'daily', env = process.env) {
  const out = env.BRIEF_OUT_DIR || 'brief/out';
  return path.resolve(REPO_ROOT, out, 'latest', kind);
}

/** Reads and sanity-checks manifest.json from a render directory. */
function loadManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    throw new Error(`No manifest.json in ${dir} — render a brief first (rumi brief).`);
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!Array.isArray(manifest.panels) || manifest.panels.length === 0) {
    throw new Error(`${file} lists no panels — nothing to send.`);
  }
  return manifest;
}

/** BRIEF_RECIPIENTS, comma-separated, whitespace-tolerant; empty → []. */
function resolveRecipients(env = process.env) {
  return String(env.BRIEF_RECIPIENTS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function readSentLog(dir) {
  const file = path.join(dir, SENT_LOG);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writeSentLog(dir, log) {
  fs.writeFileSync(path.join(dir, SENT_LOG), `${JSON.stringify(log, null, 2)}\n`);
}

function alreadySent(sentLog, target, manifest) {
  const entry = sentLog[target];
  return Boolean(entry && entry.kind === manifest.kind && entry.day === manifest.day);
}

/** The ordered list of posts one recipient receives. */
function buildPosts(manifest, dir, env = process.env) {
  const posts = manifest.panels.map((panel, i) => ({
    type: 'image',
    file: path.resolve(dir, panel.file),
    caption: i === 0 ? (manifest.lead || panel.caption || '') : (panel.caption || ''),
  }));
  const liveUrl = manifest.live_url || env.BRIEF_LIVE_URL || null;
  let text = manifest.closer || '';
  if (liveUrl) text = `${text}\n\nLive: ${liveUrl}`.trim();
  if (text) posts.push({ type: 'text', text });
  return posts;
}

function preview(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > CAPTION_PREVIEW ? `${s.slice(0, CAPTION_PREVIEW)}…` : s;
}

async function deliver(messaging, target, posts) {
  for (const post of posts) {
    const ok = post.type === 'image'
      ? await messaging.sendImage(target, post.file, post.caption)
      : await messaging.sendMessage(target, post.text);
    if (!ok) {
      throw new Error(`${post.type === 'image' ? path.basename(post.file) : 'closer'} was not delivered`);
    }
  }
}

/**
 * Sends the brief in `manifestDir` to every recipient.
 *
 * @param {object} opts
 * @param {string} opts.manifestDir
 * @param {string[]} opts.recipients
 * @param {object} [opts.messaging]  the messaging router (injected in tests)
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.force]
 * @param {Function} [opts.log]
 * @param {object} [opts.env]
 * @returns {Promise<{kind: string, day: string, sent: string[], skipped: string[], failed: Array<{target: string, reason: string}>, dryRun: boolean}>}
 */
async function sendBrief({
  manifestDir,
  recipients,
  messaging,
  dryRun = false,
  force = false,
  log = console.log,
  env = process.env,
}) {
  const manifest = loadManifest(manifestDir);
  const posts = buildPosts(manifest, manifestDir, env);
  const result = { kind: manifest.kind, day: manifest.day, sent: [], skipped: [], failed: [], dryRun };

  log(`Brief: ${manifest.kind} for ${manifest.day} (${manifest.dateline || 'no dateline'}) — ${manifest.panels.length} panels, ${recipients.length} target(s)`);

  if (dryRun) {
    log('Dry run — nothing will be sent.');
    posts.forEach((post, i) => {
      if (post.type === 'image') log(`  ${i + 1}. image ${path.basename(post.file)} — ${preview(post.caption)}`);
      else log(`  ${i + 1}. text — ${preview(post.text)}`);
    });
    log(`  targets: ${recipients.join(', ') || '(none)'}`);
    return result;
  }

  const router = messaging || require('../../shared/services/messaging');
  const sentLog = readSentLog(manifestDir);

  for (const target of recipients) {
    if (!force && alreadySent(sentLog, target, manifest)) {
      log(`  ${target}: already sent this ${manifest.kind} brief for ${manifest.day} — skipping (use --force to resend)`);
      result.skipped.push(target);
      continue;
    }
    try {
      await deliver(router, target, posts);
      sentLog[target] = { sent_at: new Date().toISOString(), kind: manifest.kind, day: manifest.day };
      writeSentLog(manifestDir, sentLog);
      result.sent.push(target);
      log(`  ${target}: sent ${posts.length} posts`);
    } catch (error) {
      result.failed.push({ target, reason: error.message });
      log(`  ${target}: failed — ${error.message}`);
    }
  }

  return result;
}

/** Non-zero only when every target failed; a skip or a success anywhere keeps it at 0. */
function exitCodeFor(result) {
  const attempted = result.sent.length + result.skipped.length + result.failed.length;
  return attempted > 0 && result.failed.length === attempted ? 1 : 0;
}

function parseArgs(argv) {
  const opts = { kind: 'daily', dir: null, to: null, dryRun: false, force: false };
  const takeValue = (i, flag) => {
    const [name, inline] = flag.split('=');
    if (inline !== undefined) return { value: inline, next: i };
    return { value: argv[i + 1], next: i + 1 };
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const name = arg.split('=')[0];
    if (name === '--kind') { ({ value: opts.kind, next: i } = takeValue(i, arg)); }
    else if (name === '--dir') { ({ value: opts.dir, next: i } = takeValue(i, arg)); }
    else if (name === '--to') { ({ value: opts.to, next: i } = takeValue(i, arg)); }
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!KINDS.includes(opts.kind)) {
    throw new Error(`--kind must be one of ${KINDS.join(' | ')} (got "${opts.kind}")`);
  }
  return opts;
}

/**
 * CLI entry. Returns the exit code rather than exiting, so the worker and
 * `rumi brief` can reuse it.
 */
async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const log = deps.log || console.log;
  const opts = parseArgs(argv);
  const manifestDir = opts.dir ? path.resolve(opts.dir) : defaultManifestDir(opts.kind, env);
  const recipients = opts.to !== null
    ? resolveRecipients({ BRIEF_RECIPIENTS: opts.to })
    : resolveRecipients(env);

  if (recipients.length === 0) {
    log('No recipients — set BRIEF_RECIPIENTS in .env (comma-separated targets) or pass --to.');
    return 0;
  }

  const result = await sendBrief({
    manifestDir,
    recipients,
    messaging: deps.messaging,
    dryRun: opts.dryRun,
    force: opts.force,
    log,
    env,
  });
  return exitCodeFor(result);
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`send-brief: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  REPO_ROOT,
  defaultManifestDir,
  loadManifest,
  resolveRecipients,
  buildPosts,
  sendBrief,
  exitCodeFor,
  parseArgs,
  main,
};
