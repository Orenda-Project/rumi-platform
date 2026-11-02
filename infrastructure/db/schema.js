/**
 * Rumi's tables on a direct Postgres (DB_DRIVER=bundled|postgres), without
 * Supabase's exec_sql detour: SQL goes straight over a pg connection.
 *
 * ensureSchema() is what `npm run db:start`, `rumi start`, `rumi setup` and
 * `npm run bootstrap:db` call:
 *   - no `users` table yet → apply postgres-shim.sql, then the same files and
 *     migrations bootstrap-db.js applies to Supabase (00 → 01 → 02 → V*.sql);
 *   - tables present      → apply only the V*.sql migrations not yet recorded
 *     in schema_versions, as migrate.js does — so a `git pull` that adds a
 *     migration reaches the database on the next start.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { DatabaseBootstrapper } = require('../scripts/bootstrap-db');
const { MigrationRunner } = require('../scripts/migrate');
const { createPgClient } = require('../../bot/shared/services/db/pg-adapter/pg-client');

const SCHEMA_DIR = path.resolve(__dirname, '../supabase');
const MIGRATIONS_DIR = path.join(SCHEMA_DIR, 'migrations');
const SHIM_PATH = path.join(__dirname, 'postgres-shim.sql');
const SENTINEL_TABLE = 'users';

/** Runs SQL over the pool, naming the statement in any error. */
function pgExecSql(pool) {
  return async (sql, label) => {
    try {
      await pool.query(sql);
    } catch (err) {
      throw new Error(`${label}: ${err.message}`);
    }
  };
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} whether Rumi's tables exist
 */
async function hasTables(pool) {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${SENTINEL_TABLE}`]);
  return rows[0].present;
}

async function bootstrap(pool) {
  await pool.query(fs.readFileSync(SHIM_PATH, 'utf8'));
  const bootstrapper = new DatabaseBootstrapper({
    schemaDir: SCHEMA_DIR,
    migrationsDir: MIGRATIONS_DIR,
    execSql: pgExecSql(pool),
  });
  return bootstrapper.bootstrap();
}

async function migrate(pool) {
  const runner = new MigrationRunner({
    migrationsDir: MIGRATIONS_DIR,
    client: createPgClient(pool),
    execSql: pgExecSql(pool),
  });
  return runner.run();
}

/**
 * Create Rumi's tables, or bring them up to date.
 * @param {string} connectionString
 * @returns {Promise<{ action: 'created'|'migrated', ok: boolean, errors: Array<{file: string, error: string}>, applied: string[] }>}
 */
async function ensureSchema(connectionString) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    if (!(await hasTables(pool))) {
      const result = await bootstrap(pool);
      const ok = result.errors.length === 0 && (await hasTables(pool));
      return { action: 'created', ok, errors: result.errors, applied: [...result.applied, ...result.migrations] };
    }
    const result = await migrate(pool);
    return { action: 'migrated', ok: result.errors.length === 0, errors: result.errors, applied: result.applied };
  } finally {
    await pool.end();
  }
}

/**
 * Do Rumi's tables exist? Never throws.
 * @param {string} connectionString
 * @returns {Promise<{ state: 'ready'|'needs-schema'|'unreachable', detail: string }>}
 */
async function inspectSchema(connectionString) {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    return (await hasTables(pool))
      ? { state: 'ready', detail: `the "${SENTINEL_TABLE}" table is already there` }
      : { state: 'needs-schema', detail: 'the database is empty — Rumi will create its tables' };
  } catch (err) {
    return { state: 'unreachable', detail: err.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = { SENTINEL_TABLE, ensureSchema, inspectSchema };
