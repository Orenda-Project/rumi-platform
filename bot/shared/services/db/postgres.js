/**
 * Direct-Postgres driver (DB_DRIVER=bundled or postgres): the supabase-js
 * database surface (from/rpc) over a `pg` Pool. The pool is created on first
 * use, not at require.
 */

const { Pool } = require('pg');
const { createPgClient } = require('./pg-adapter/pg-client');
const { maxRowsFromEnv, postgresPoolConfig, resolveDbDriver } = require('./pg-adapter/drivers');
const { logToFile } = require('../../utils/logger');

let pool = null;
let client = null;

function getClient() {
  if (client) return client;
  pool = new Pool(postgresPoolConfig());
  // Without a listener, an idle connection dropped by the server would crash
  // the process.
  pool.on('error', (err) => {
    logToFile('Postgres pool: idle connection error', { level: 'error', error: err.message });
  });
  client = createPgClient(pool, { maxRows: maxRowsFromEnv() });
  warnIfBuiltInDatabaseIsDown(pool);
  return client;
}

/**
 * Started with `npm start` / `node bot/whatsapp-bot.js` rather than
 * `rumi start`, the built-in database is not running and every query fails
 * with a bare ECONNREFUSED. Say once, plainly, what to run instead.
 */
function warnIfBuiltInDatabaseIsDown(activePool) {
  if (resolveDbDriver() !== 'bundled') return;
  activePool.query('SELECT 1').catch((err) => {
    if (err.code !== 'ECONNREFUSED') return;
    logToFile(
      'The built-in database is not running. Start Rumi with `rumi start` (it starts the database first), '
      + 'or run `npm run db:start` in another terminal.',
      { level: 'error' }
    );
  });
}

module.exports = {
  from: (table) => getClient().from(table),
  rpc: (name, args, options) => getClient().rpc(name, args, options),
  /** Close the pool (graceful shutdown, tests). Not part of supabase-js. */
  end: async () => {
    if (!pool) return;
    const closing = pool;
    pool = null;
    client = null;
    await closing.end();
  },
};
