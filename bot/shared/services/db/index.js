/**
 * Database client — also the bot's cold-boot env-gate.
 *
 * Exports one object with the supabase-js database surface (`from()`,
 * `rpc()`), whichever driver is selected (see pg-adapter/drivers.js):
 *   DB_DRIVER=bundled|postgres → ./postgres (pg Pool, via the pg adapter)
 *   DB_DRIVER=supabase         → ./supabase (supabase-js)
 *
 * The database is touched at the top of every handler and worker, so when
 * the selected driver's env vars are missing we exit here with an
 * action-oriented message rather than a stack trace later. Exit code 78
 * (EX_CONFIG per sysexits.h) tells supervisors and CI this is a configuration
 * error, not a code crash.
 */

require('dotenv').config();
const { isDirectPostgres, missingDbEnv, resolveDbDriver } = require('./pg-adapter/drivers');

const NEXT_STEP = {
  bundled: '  2. Set up the built-in database:            rumi setup  (or npm run db:start)',
  postgres: '  2. Set DATABASE_URL to your Postgres connection string.',
  supabase: '  2. Fill in the REQUIRED block (see SETUP.md §2 — Supabase).',
};

function abortBoot(lines) {
  const message = [
    '',
    '┌─ Rumi bot — boot aborted ──────────────────────────────────────────────',
    ...lines.map((l) => `│ ${l}`),
    '└────────────────────────────────────────────────────────────────────────',
    '',
  ].join('\n');
  process.stderr.write(message);
  process.exit(78); // sysexits.h EX_CONFIG — "configuration error"
}

let driver;
try {
  driver = resolveDbDriver();
} catch (err) {
  abortBoot([err.message]);
}

const missing = missingDbEnv(driver);
if (missing.length > 0) {
  abortBoot([
    `Missing REQUIRED env var(s) for DB_DRIVER=${driver}: ${missing.join(', ')}`,
    '',
    'Next steps:',
    "  1. If you haven't yet, copy the template:   cp .env.template .env",
    NEXT_STEP[driver],
    '  3. Confirm everything is set:               npm run doctor',
    '',
    '`npm run doctor` prints a presence-checked matrix of every key the bot',
    'understands, with a `where to get it` link per missing key. It exits',
    'cleanly and shows exactly what still needs to be filled in.',
  ]);
}

module.exports = isDirectPostgres(driver) ? require('./postgres') : require('./supabase');
