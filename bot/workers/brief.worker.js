/**
 * Morning Brief Worker — one-shot, cron-run (Railway Cron / crontab).
 *
 * Schedule it once a morning. Each run:
 *   1. decides what today is, in BRIEF_TZ:
 *        - the weekly brief on BRIEF_WEEKLY_DOW (default 5 = Friday)
 *        - the daily brief on BRIEF_DAILY_DOWS (default 1,2,3,4 = Mon–Thu)
 *        - otherwise an off-day: log and exit 0
 *   2. renders it — `python3 brief/cli.py render --kind <kind>` from the
 *      repo root (BRIEF_PYTHON overrides the interpreter), which writes the
 *      panels + manifest to <BRIEF_OUT_DIR>/latest/<kind>/
 *   3. delivers it through bot/scripts/brief/send-brief.js to BRIEF_RECIPIENTS
 *
 * The weekday is evaluated with Intl in the configured zone, not the
 * process zone — a cron host in UTC serving a team five hours east would
 * otherwise send Friday's weekly brief on what is already their Saturday.
 *
 * Both the renderer spawn and the sender are injectable so this file is
 * testable without Python or a channel driver; `rumi brief` reuses the same
 * render step so a hand-run and the cron never diverge.
 */

const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Anchored to the repo, not the working directory — a cron entry rarely
// cds anywhere in particular. Tolerant of dotenv being absent (bot deps not
// installed yet): `rumi brief` reaches this file too, and process.env is
// still a valid, if bare, configuration — the same stance bin/rumi.js takes.
try {
  require('dotenv').config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
} catch {
  // Not installed — run on whatever the environment already carries.
}

const DEFAULT_DAILY_DOWS = '1,2,3,4';
const DEFAULT_WEEKLY_DOW = '5';
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Day of week (0 = Sunday) of `date` in `timeZone`; falls back to UTC for an unknown zone. */
function weekdayIn(date, timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', weekday: 'short' });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
  }
  return WEEKDAYS[formatter.format(date)];
}

/** "1, 2,x,3" → Set{1,2,3}; junk is dropped rather than thrown on. */
function parseDows(raw, fallback) {
  const source = raw === undefined || raw === null ? fallback : raw;
  return new Set(
    String(source)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^[0-6]$/.test(t))
      .map(Number),
  );
}

/**
 * Which brief today is: 'weekly', 'daily', or null for an off-day.
 * Weekly wins if a day is listed for both.
 */
function decideKind(date = new Date(), env = process.env) {
  const dow = weekdayIn(date, env.BRIEF_TZ);
  if (parseDows(env.BRIEF_WEEKLY_DOW, DEFAULT_WEEKLY_DOW).has(dow)) return 'weekly';
  if (parseDows(env.BRIEF_DAILY_DOWS, DEFAULT_DAILY_DOWS).has(dow)) return 'daily';
  return null;
}

/** The renderer invocation — kept as data so `rumi brief` and the tests see the exact command. */
function renderCommand(kind, env = process.env) {
  return {
    cmd: env.BRIEF_PYTHON || 'python3',
    args: ['brief/cli.py', 'render', '--kind', kind],
    cwd: REPO_ROOT,
  };
}

/** Spawns the command with inherited stdio + env; resolves with its exit code. */
function defaultRunner(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code === null ? 1 : code)));
  });
}

async function renderBrief(kind, { env = process.env, runner = defaultRunner, log = console.log } = {}) {
  const { cmd, args, cwd } = renderCommand(kind, env);
  log(`Rendering the ${kind} brief: ${cmd} ${args.join(' ')}`);
  return runner(cmd, args, { cwd, env });
}

/**
 * The cron entry. Returns the exit code; the `require.main` guard below is
 * what actually exits.
 */
async function main({
  now = new Date(),
  env = process.env,
  runner = defaultRunner,
  send,
  log = console.log,
} = {}) {
  const sendBriefModule = require('../scripts/brief/send-brief');
  const deliver = send || sendBriefModule.sendBrief;

  log('============================================');
  log(`Morning Brief worker started: ${now.toISOString()} (BRIEF_TZ=${env.BRIEF_TZ || 'UTC'})`);

  const kind = decideKind(now, env);
  if (!kind) {
    log('off-day, skipping');
    return 0;
  }

  const code = await renderBrief(kind, { env, runner, log });
  if (code !== 0) {
    log(`Render failed with exit code ${code} — nothing sent.`);
    return 1;
  }

  const manifestDir = sendBriefModule.defaultManifestDir(kind, env);
  const recipients = sendBriefModule.resolveRecipients(env);
  if (recipients.length === 0) {
    log(`Rendered to ${manifestDir}. No recipients — set BRIEF_RECIPIENTS to deliver it.`);
    return 0;
  }

  const result = await deliver({ manifestDir, recipients, log, env });
  const exitCode = sendBriefModule.exitCodeFor(result);
  log(`Done: sent ${result.sent.length}, skipped ${result.skipped.length}, failed ${result.failed.length}`);
  log('============================================');
  return exitCode;
}

// Gated — requiring this file as a library (tests, `rumi brief`) does NOT
// render or send anything. The cron runs it directly.
if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('Morning Brief worker error:', error);
      process.exit(1);
    });
}

module.exports = {
  REPO_ROOT,
  weekdayIn,
  parseDows,
  decideKind,
  renderCommand,
  defaultRunner,
  renderBrief,
  main,
};
