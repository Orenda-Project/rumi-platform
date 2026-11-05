#!/usr/bin/env node
/**
 * `node infrastructure/db/apply.js` — create Rumi's tables, or apply new
 * migrations, on a direct Postgres (DB_DRIVER=bundled|postgres). The built-in
 * database is started for the run if it is not already up.
 *
 * What `npm run bootstrap:db` and `node infrastructure/scripts/migrate.js` run
 * for those drivers. They launch it as a separate process rather than
 * requiring it, because this side reuses their bootstrapper and runner.
 */

const { loadRepoEnv } = require('../scripts/repo-env');
const { databaseUrlFor, resolveDbDriver } = require('../../bot/shared/services/db/pg-adapter/drivers');
const { startBundledDatabase } = require('./start');
const { ensureSchema } = require('./schema');

async function main() {
  loadRepoEnv();
  const driver = resolveDbDriver(process.env);
  if (driver === 'bundled') {
    const db = await startBundledDatabase(process.env);
    await db.stop();
  } else if (driver === 'postgres') {
    const result = await ensureSchema(databaseUrlFor(process.env));
    if (!result.ok) throw new Error(result.errors.map((e) => `${e.file}: ${e.error}`).join('; '));
    console.log(result.action === 'created'
      ? '[db] Created Rumi\'s tables.'
      : `[db] Applied ${result.applied.length} new migration(s).`);
  } else {
    throw new Error(`DB_DRIVER is "${driver}" — this script is for the built-in database or DATABASE_URL; run "npm run bootstrap:db" for Supabase.`);
  }
  console.log('[db] Done. Rumi\'s tables are in place.');
}

main().catch((err) => {
  console.error(`[db] ${err.message}`);
  process.exit(1);
});
