/**
 * db-setup.js — the database half of `rumi setup`.
 *
 * Creating Rumi's tables is the one setup step that cannot be fully automated,
 * and the reason is worth stating plainly: Supabase exposes no API for running
 * arbitrary SQL, so the schema is applied through an `exec_sql` function which
 * itself has to be created by hand once, in the SQL editor. Every guide that
 * skips this detail sends the reader to an opaque 404.
 *
 * So this module's job is to know exactly which of the three states a database
 * is in — already set up, missing the helper, or ready to receive the schema —
 * and let the wizard say the one true sentence for that state.
 *
 * @module db-setup
 */

const path = require('path');
const { EXEC_SQL_DEFINITION } = require('../../../infrastructure/scripts/exec-sql-helper');

const SCHEMA_DIR = path.resolve(__dirname, '../../../infrastructure/supabase');

/**
 * A table from the top of 00_complete-schema.sql, used as the "has the schema
 * been applied?" sentinel. PostgREST answers 404/PGRST205 for a table it has
 * never seen, which is a cleaner signal than counting rows.
 */
const SENTINEL_TABLE = 'users';

function headersFor(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Which of the three states is this database in?
 *
 * @param {{SUPABASE_URL: string, SUPABASE_SERVICE_ROLE_KEY: string}} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{state: 'ready'|'needs-helper'|'needs-schema'|'unreachable', detail: string}>}
 */
async function inspectDatabase(env, fetchImpl = fetch) {
  let schemaApplied;
  try {
    const res = await fetchImpl(
      `${env.SUPABASE_URL}/rest/v1/${SENTINEL_TABLE}?select=id&limit=1`,
      { headers: headersFor(env) },
    );
    if (res.status === 401 || res.status === 403) {
      return { state: 'unreachable', detail: `the key was rejected (HTTP ${res.status})` };
    }
    schemaApplied = res.ok;
  } catch (err) {
    return { state: 'unreachable', detail: err.message };
  }

  if (schemaApplied) return { state: 'ready', detail: `the "${SENTINEL_TABLE}" table is already there` };

  // No schema yet — so can we apply it, or does the helper have to come first?
  const helper = await hasExecSql(env, fetchImpl);
  return helper.present
    ? { state: 'needs-schema', detail: 'no tables yet, but the SQL helper is in place' }
    : { state: 'needs-helper', detail: helper.detail };
}

/**
 * Is the `exec_sql` helper callable? Probed with a harmless statement, because
 * "the function exists" and "the function works" are different claims and only
 * the second one matters.
 *
 * @returns {Promise<{present: boolean, detail: string}>}
 */
async function hasExecSql(env, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: headersFor(env),
      body: JSON.stringify({ query: 'select 1' }),
    });
    if (res.ok) return { present: true, detail: 'exec_sql answered' };
    const body = await res.text().catch(() => '');
    return { present: false, detail: `exec_sql is missing (HTTP ${res.status})`, raw: body };
  } catch (err) {
    return { present: false, detail: err.message };
  }
}

/**
 * The Supabase SQL-editor URL for a project, derived from its API URL — so the
 * wizard can hand over a link that lands on the right page of the right
 * project instead of "go and find the SQL editor". Returns null for anything
 * that isn't a hosted supabase.co project (self-hosted, local).
 *
 * @param {string} supabaseUrl
 * @returns {string|null}
 */
function sqlEditorUrl(supabaseUrl) {
  const match = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(String(supabaseUrl || ''));
  return match ? `https://supabase.com/dashboard/project/${match[1]}/sql/new` : null;
}

/**
 * PostgREST caches the schema. After someone pastes `exec_sql`, the function
 * can exist in Postgres for several seconds before `/rpc/exec_sql` answers.
 * Polling here is what stops setup from skipping the tables on that race.
 *
 * @param {{SUPABASE_URL: string, SUPABASE_SERVICE_ROLE_KEY: string}} env
 * @param {typeof fetch} [fetchImpl]
 * @param {{attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void>}} [opts]
 */
async function waitForExecSql(env, fetchImpl = fetch, opts = {}) {
  const attempts = opts.attempts == null ? 8 : opts.attempts;
  const delayMs = opts.delayMs == null ? 2000 : opts.delayMs;
  const sleep = opts.sleep || ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
  let last = { present: false, detail: 'not checked' };
  for (let i = 0; i < attempts; i++) {
    last = await hasExecSql(env, fetchImpl);
    if (last.present) return last;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return last;
}

/**
 * Applies schema → RLS → seed via the existing bootstrapper, which is
 * idempotent, so re-running on a half-applied database is safe.
 *
 * "Applied the SQL files" is not "the bot can see `users`". We re-inspect
 * after bootstrap so a silent no-op (or a first-statement-only EXECUTE)
 * cannot look like success.
 *
 * @param {object} env
 * @returns {Promise<{ok: boolean, applied: string[], errors: Array<{file: string, error: string}>}>}
 */
async function applySchema(env) {
  const { DatabaseBootstrapper } = require('../../../infrastructure/scripts/bootstrap-db');
  const bootstrapper = new DatabaseBootstrapper({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    schemaDir: SCHEMA_DIR,
  });
  const result = await bootstrapper.bootstrap();
  if (result.errors.length > 0) return { ok: false, ...result };

  const status = await inspectDatabase(env);
  if (status.state !== 'ready') {
    return {
      ok: false,
      ...result,
      errors: [{
        file: SENTINEL_TABLE,
        error: `SQL ran but the "${SENTINEL_TABLE}" table is still missing (${status.detail})`,
      }],
    };
  }
  return { ok: true, ...result };
}

module.exports = {
  EXEC_SQL_DEFINITION, SENTINEL_TABLE, SCHEMA_DIR,
  inspectDatabase, hasExecSql, waitForExecSql, sqlEditorUrl, applySchema,
};
