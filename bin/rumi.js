#!/usr/bin/env node
/**
 * rumi — one command for everything an operator does outside the bot itself.
 *
 *   rumi setup       connect Rumi to your accounts (start here)
 *   rumi status       is Rumi running, and what is switched on
 *   rumi doctor       check every connection in detail
 *   rumi pair         link (or re-link) WhatsApp
 *   rumi graduate     move to an official WhatsApp Business number
 *   rumi brief        render this morning's programme-health brief (--send delivers it)
 *
 * Repo-local by design (`bin/rumi.js`, not a published package): a Rumi
 * deployment is a clone or a fork, so there is no single global install to
 * distribute. install.sh offers to `npm link` it so a bare `rumi` works;
 * otherwise `node bin/rumi.js <command>` is equivalent.
 *
 * Command bodies live in bot/scripts/setup/ and are required lazily — starting
 * a wizard should not pay for loading the doctor's probes, and `rumi --help`
 * should not load anything at all.
 *
 * @module rumi
 */

// A `rumi` command is a conversation with a person, so its output must stay
// human-readable. bot/shared/utils/structured-logger.js replaces console.* with
// JSON logging for the server, and any module that reaches it (the WhatsApp
// connection does) would take this command's output with it — a QR code and a
// wizard, rendered as log records. Set before the first require, since the
// override happens at import time.
process.env.RUMI_CLI = '1';

const path = require('path');

const SCRIPTS_DIR = path.resolve(__dirname, '../bot/scripts/setup');
// dotenv is a dependency of bot/package.json, not the repo root's — and this
// file lives at the repo root, so a bare require('dotenv') fails to resolve
// here. It used to fail *silently* (swallowed by a try/catch), so .env never
// loaded and a fully-configured deployment reported every variable missing.
// Resolve it from bot/node_modules, the same place every bot/scripts/setup
// module already loads it from successfully.
const BOT_DIR = path.resolve(SCRIPTS_DIR, '..', '..');

const REPO_ROOT = path.resolve(BOT_DIR, '..');

function loadEnv() {
  try {
    // Anchored to the repo, not the working directory. Run from bot/, a bare
    // config() looked for bot/.env, loaded nothing, and every command reported
    // a fully-configured deployment as "not configured".
    require(path.join(BOT_DIR, 'node_modules', 'dotenv'))
      .config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
  } catch {
    // Not installed yet (someone running `rumi` before install.sh finished) —
    // the commands below all read process.env, which is still valid, just bare.
  }
}

const ui = () => require(path.join(SCRIPTS_DIR, 'ui'));

const COMMANDS = {
  start: {
    summary: 'Start Rumi (the bot itself)',
    run: () => new Promise((resolve) => {
      // Runs from the repo root so .env and the WhatsApp session resolve the
      // same way whatever directory you called `rumi` from — the reason this
      // command exists rather than `cd bot && npm start`.
      const child = require('child_process').spawn(
        process.execPath, [path.join(BOT_DIR, 'whatsapp-bot.js')],
        {
          cwd: REPO_ROOT,
          stdio: 'inherit',
          // The bot is a server and wants its structured JSON logging; RUMI_CLI
          // is this launcher's business, not the child's.
          env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'RUMI_CLI')),
        },
      );
      // Forward signals to the bot. `stdio: 'inherit'` means an interactive
      // Ctrl+C reaches the whole process group anyway, but `kill <rumi-pid>`
      // — from a script, a supervisor, or a stop command — only signals this
      // launcher, which would leave the bot orphaned and still holding the
      // WhatsApp session lock. The next `rumi start` then refuses to attach,
      // correctly but confusingly, blaming a pid nobody can see.
      const forward = (signal) => () => { if (child.exitCode === null) child.kill(signal); };
      const onInt = forward('SIGINT');
      const onTerm = forward('SIGTERM');
      process.on('SIGINT', onInt);
      process.on('SIGTERM', onTerm);

      child.on('exit', (code, signal) => {
        process.off('SIGINT', onInt);
        process.off('SIGTERM', onTerm);
        process.exitCode = signal ? 1 : (code || 0);
        resolve();
      });
    }),
  },
  setup: {
    summary: 'Connect Rumi to your accounts — start here',
    run: () => require(path.join(SCRIPTS_DIR, 'interactive-setup')).main(),
  },
  status: {
    summary: 'Is Rumi running, and what is switched on',
    run: () => require(path.join(SCRIPTS_DIR, 'status')).main(),
  },
  doctor: {
    summary: 'Check every connection in detail',
    run: async () => {
      const { runDoctor, formatReport } = require(path.join(SCRIPTS_DIR, 'doctor'));
      loadEnv();
      const result = await runDoctor({});
      console.log(formatReport(result));
      process.exitCode = result.ok ? 0 : 1;
    },
  },
  pair: {
    summary: 'Link (or re-link) WhatsApp',
    run: () => require(path.join(SCRIPTS_DIR, 'baileys-pair')).main(),
  },
  graduate: {
    summary: 'Move to an official WhatsApp Business number',
    run: () => require(path.join(SCRIPTS_DIR, 'graduate')).main(),
  },
  brief: {
    summary: "Render this morning's brief (add --send to deliver it)",
    run: () => runBrief(process.argv.slice(3)),
  },
};

/** `rumi brief` flags: --weekly picks the weekly brief; --send delivers; --dry-run rehearses the send. */
function parseBriefFlags(argv) {
  const flags = { kind: 'daily', send: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--weekly') flags.kind = 'weekly';
    else if (arg === '--send') flags.send = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else throw new Error(`Unknown option for rumi brief: ${arg}`);
  }
  return flags;
}

/**
 * `rumi brief` — the same render step the cron worker runs
 * (bot/workers/brief.worker.js), so a hand-run and the scheduled run can
 * never diverge; then, only with --send, the same delivery step. The
 * renderer runner and the sender are injectable for the tests.
 */
async function runBrief(argv, deps = {}) {
  loadEnv();
  const env = deps.env || process.env;
  const log = deps.log || console.log;
  const u = ui();
  const flags = parseBriefFlags(argv);
  // Both live under bot/ (the worker is a cron entry, the sender a script);
  // required lazily like every other command body so `rumi --help` loads nothing.
  const worker = require(path.join(BOT_DIR, 'workers', 'brief.worker'));
  const sender = require(path.join(BOT_DIR, 'scripts', 'brief', 'send-brief'));

  const code = await worker.renderBrief(flags.kind, { env, runner: deps.runner, log });
  if (code !== 0) {
    log(u.fail(`The ${flags.kind} brief did not render (exit code ${code}). See the renderer's output above.`));
    process.exitCode = 1;
    return;
  }

  const manifestDir = sender.defaultManifestDir(flags.kind, env);
  let panelNote = '';
  try {
    panelNote = ` (${sender.loadManifest(manifestDir).panels.length} panels)`;
  } catch {
    // The renderer said it succeeded; the PNGs are still where it put them.
  }
  log(u.ok(`Rendered the ${flags.kind} brief to ${manifestDir}${panelNote}`));

  if (!flags.send) {
    log(u.aside('Add --send to deliver it to BRIEF_RECIPIENTS, or --send --dry-run to see what would go out.'));
    return;
  }

  const recipients = sender.resolveRecipients(env);
  if (recipients.length === 0) {
    log(u.warn('No recipients — set BRIEF_RECIPIENTS in .env (comma-separated targets) to deliver it.'));
    return;
  }
  const deliver = deps.send || sender.sendBrief;
  const result = await deliver({ manifestDir, recipients, dryRun: flags.dryRun, log, env });
  process.exitCode = sender.exitCodeFor(result);
}

const OPTIONS = [
  ['--reconfigure', 'setup: ask about everything again, including what already works'],
  ['--to=<channel>', 'graduate: which channel to move to (defaults to meta)'],
  ['--weekly', 'brief: render the weekly brief instead of the daily one'],
  ['--send', 'brief: deliver the rendered brief to BRIEF_RECIPIENTS'],
  ['--dry-run', 'brief: with --send, print what would go out and send nothing'],
];

function printUsage() {
  const u = ui();
  console.log(u.logo('An AI teaching companion that lives in WhatsApp'));
  console.log(`  ${u.bold('Usage')}`);
  console.log(`    rumi <command>`);
  console.log('');
  console.log(`  ${u.bold('Commands')}`);
  console.log(u.table(
    Object.entries(COMMANDS).map(([name, cmd]) => [name, u.dim(cmd.summary)]),
    { labelRole: 'brandHi', indent: 4 },
  ));
  console.log('');
  console.log(`  ${u.bold('Options')}`);
  console.log(u.table(
    OPTIONS.map(([flag, description]) => [flag, u.dim(description)]),
    { labelRole: 'accent', indent: 4 },
  ));
  console.log('');
  console.log(u.aside('New here? Run `rumi setup` — it takes about fifteen minutes and explains each step as it goes.'));
  console.log('');
}

function printVersion() {
  const { version } = require('../package.json');
  console.log(`rumi ${version}`);
}

async function main() {
  const [, , command] = process.argv;

  if (command === '--version' || command === '-v') {
    printVersion();
    return;
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.log(ui().fail(`Unknown command: "${command}"`));
    console.log('');
    printUsage();
    process.exitCode = 1;
    return;
  }

  await handler.run();
}

if (require.main === module) {
  // Exit explicitly once the command is done. A probe that leaves a socket open
  // (Redis, WhatsApp) would otherwise hold the event loop and the command would
  // appear to hang after printing its result.
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((err) => {
      console.error(ui().fail(`rumi ${process.argv[2] || ''}: ${err.message}`));
      process.exit(1);
    });
}

module.exports = { main, COMMANDS, printUsage, parseBriefFlags, runBrief };
