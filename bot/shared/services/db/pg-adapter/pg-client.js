/**
 * createPgClient(pool) → an object with the supabase-js database surface
 * (`from()` and `rpc()`), backed by a `pg` Pool instead of PostgREST.
 */

const { PgQueryBuilder } = require('./query-builder');
const { createSchemaCache } = require('./schema-cache');

const SCHEMA_MISS_CODES = new Set(['PGRST200', 'PGRST202']);

/**
 * Run a builder; if it failed because the schema cache predates a migration
 * (unknown relationship or function), reload the cache once and retry.
 */
function withSchemaRetry(deps, makeBuilder) {
  const builder = makeBuilder();
  const execute = builder.execute.bind(builder);
  builder.execute = async () => {
    const result = await execute();
    if (!result.error || !SCHEMA_MISS_CODES.has(result.error.code)) return result;
    await deps.schemaCache.reload().catch(() => {});
    return execute();
  };
  return builder;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ maxRows?: number|null }} [options] maxRows caps reads like
 *   PostgREST's max-rows (hosted Supabase: 1000); null/0 = no cap
 */
function createPgClient(pool, { maxRows = null } = {}) {
  const deps = { pool, schemaCache: createSchemaCache(pool), maxRows };
  return {
    from(table) {
      return withSchemaRetry(deps, () => new PgQueryBuilder(deps, { table }));
    },
    rpc(name, args = {}, { count = null, head = false } = {}) {
      return withSchemaRetry(deps, () => {
        const builder = new PgQueryBuilder(deps, { rpc: { name, args } });
        builder.countMode = count;
        builder.isHead = head;
        return builder;
      });
    },
  };
}

module.exports = { createPgClient };
