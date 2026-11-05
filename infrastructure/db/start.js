#!/usr/bin/env node
/**
 * `npm run db:start` — run Rumi's built-in database (DB_DRIVER=bundled).
 *
 * First run: generates a password (saved to .env), creates the data folder
 * (.rumi-db/, or RUMI_DB_DIR) and Rumi's tables. Every run: starts Postgres,
 * applies any new migrations, and keeps running until Ctrl+C. If the database
 * is already running it is left as it is and this exits once tables are
 * up to date.
 *
 * `rumi start` does the same automatically before starting the bot, so this
 * is only needed to run the database on its own (a separate terminal, a
 * service manager, a Railway database service).
 */

const { loadRepoEnv } = require('../scripts/repo-env');
const { databaseUrlFor, bundledDbSettings, resolveDbDriver } = require('../../bot/shared/services/db/pg-adapter/drivers');
const { dataDir, ensurePassword, ensureRunning } = require('./bundled');
const { ensureSchema } = require('./schema');

/**
 * Start (or find) the bundled database and make sure its tables are current.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {Promise<{ started: boolean, stop: () => Promise<void> }>}
 */
async function startBundledDatabase(env = process.env, { log = console.log } = {}) {
  const { created } = ensurePassword(env);
  if (created) log('[db] Created a password for the built-in database and saved it to .env.');

  const { port } = bundledDbSettings(env);
  const running = await ensureRunning(env, { onOutput: (line) => log(`[db] ${line}`) });
  log(running.started
    ? `[db] Built-in database started on port ${port} (data in ${dataDir(env)}).`
    : `[db] Built-in database already running on port ${port}.`);

  const schema = await ensureSchema(databaseUrlFor(env));
  if (!schema.ok) {
    await running.stop();
    const first = schema.errors[0] || { file: 'schema', error: 'tables are still missing' };
    throw new Error(`Could not set up Rumi's tables — ${first.file}: ${first.error}`);
  }
  if (schema.action === 'created') log('[db] Created Rumi\'s tables.');
  else if (schema.applied.length > 0) log(`[db] Applied ${schema.applied.length} new migration(s).`);
  return running;
}

async function main() {
  loadRepoEnv();
  const driver = resolveDbDriver(process.env);
  if (driver !== 'bundled') {
    console.error(`[db] DB_DRIVER is "${driver}", so Rumi uses that database — the built-in one is not needed.`);
    console.error('[db] To switch to the built-in database, set DB_DRIVER=bundled in .env.');
    process.exit(1);
  }

  const running = await startBundledDatabase(process.env);
  if (!running.started) return;

  console.log('[db] Ready. Press Ctrl+C to stop the database.');
  const shutdown = () => running.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { startBundledDatabase };

if (require.main === module) {
  main().catch((err) => {
    console.error(`[db] ${err.message}`);
    process.exit(1);
  });
}
