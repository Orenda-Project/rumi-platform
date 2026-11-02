/**
 * The dashboard's database client (supabase-js surface: from/rpc), selected
 * the same way as the bot's (lib/pg-adapter/drivers.js):
 *   DB_DRIVER=bundled|postgres → pg Pool via lib/pg-adapter
 *   DB_DRIVER=supabase         → supabase-js with the service-role key
 *
 * Unlike the bot, a missing config does not exit: it exports null and the
 * features that need the database are limited.
 */

require('dotenv').config();
require('../lib/root-env').loadBundledDbEnv();
const {
  isDirectPostgres, maxRowsFromEnv, missingDbEnv, postgresPoolConfig, resolveDbDriver,
} = require('../lib/pg-adapter/drivers');

function createPostgresClient() {
  const { Pool } = require('pg');
  const { createPgClient } = require('../lib/pg-adapter/pg-client');
  // A pool of its own: the RBAC pool in ./database switches roles per request.
  const pool = new Pool(postgresPoolConfig());
  pool.on('error', (err) => {
    console.error('[DB] Postgres pool idle connection error:', err.message);
  });
  return createPgClient(pool, { maxRows: maxRowsFromEnv() });
}

function createSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createDbClient() {
  let driver;
  try {
    driver = resolveDbDriver();
  } catch (err) {
    console.warn(`⚠️  Warning: ${err.message} Dashboard features requiring database access will be limited.`);
    return null;
  }
  const missing = missingDbEnv(driver);
  if (missing.length > 0) {
    console.warn(`⚠️  Warning: DB_DRIVER=${driver} is missing ${missing.join(', ')}. Dashboard features requiring database access will be limited.`);
    return null;
  }
  return isDirectPostgres(driver) ? createPostgresClient() : createSupabaseClient();
}

module.exports = createDbClient();
