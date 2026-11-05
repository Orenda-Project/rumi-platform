/**
 * What the adapter needs to know about the `public` schema, read once from
 * the Postgres catalog: foreign keys (to resolve embeds), primary keys (the
 * default upsert conflict target) and function signatures (for .rpc()).
 *
 * Mirrors PostgREST's schema cache. Cached per pool; reload() refreshes it
 * after a migration adds a table, FK or function at runtime.
 */

const FKS_SQL = `
  SELECT c.conname AS name,
         src.relname AS src_table,
         tgt.relname AS tgt_table,
         ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS src_cols,
         ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS tgt_cols
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
   WHERE c.contype = 'f' AND n.nspname = 'public'`;

// Primary keys and full (non-partial) unique indexes.
const KEYS_SQL = `
  SELECT t.relname AS table_name,
         i.indisprimary AS is_primary,
         ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum ORDER BY k.ord) AS cols
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE i.indisunique AND i.indpred IS NULL AND n.nspname = 'public'`;

const FUNCTIONS_SQL = `
  SELECT p.proname AS name,
         p.proretset AS returns_set,
         format_type(p.prorettype, NULL) AS return_type,
         rt.typtype AS return_kind,
         p.pronargs AS nargs,
         p.pronargdefaults AS nargdefaults,
         COALESCE(p.proargnames, '{}') AS arg_names,
         COALESCE(p.proargmodes::text[], '{}') AS arg_modes,
         ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) WITH ORDINALITY u(t, ord) ORDER BY ord) AS in_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type rt ON rt.oid = p.prorettype
   WHERE n.nspname = 'public' AND p.prokind = 'f'`;

const IN_MODES = new Set(['i', 'b', 'v']);

function toFunctionInfo(row) {
  const inNames = row.arg_modes.length === 0
    ? row.arg_names.slice(0, row.nargs)
    : row.arg_names.filter((_, i) => IN_MODES.has(row.arg_modes[i]));
  const args = row.in_types.map((type, i) => ({ name: inNames[i] || null, type }));
  return {
    name: row.name,
    returnsSet: row.returns_set,
    returnType: row.return_type,
    // c = composite (a table row type), p = pseudo (record / void)
    returnsRow: row.return_kind === 'c' || (row.return_kind === 'p' && row.return_type === 'record'),
    returnsVoid: row.return_type === 'void',
    args,
    requiredArgCount: row.nargs - row.nargdefaults,
  };
}

async function loadSchema(pool) {
  const [fks, keys, fns] = await Promise.all([
    pool.query(FKS_SQL),
    pool.query(KEYS_SQL),
    pool.query(FUNCTIONS_SQL),
  ]);
  const functions = new Map();
  for (const row of fns.rows) {
    const info = toFunctionInfo(row);
    functions.set(info.name, [...(functions.get(info.name) || []), info]);
  }
  return {
    foreignKeys: fks.rows.map((r) => ({
      name: r.name,
      srcTable: r.src_table,
      srcCols: r.src_cols,
      tgtTable: r.tgt_table,
      tgtCols: r.tgt_cols,
    })),
    primaryKeys: new Map(keys.rows.filter((r) => r.is_primary).map((r) => [r.table_name, r.cols])),
    uniqueKeys: keys.rows.reduce(
      (map, r) => map.set(r.table_name, [...(map.get(r.table_name) || []), r.cols]),
      new Map()
    ),
    functions,
  };
}

/**
 * True when `cols` exactly cover a primary key or unique index of `table`.
 * @param {object} schema
 * @param {string} table
 * @param {string[]} cols
 */
function isUniqueColumnSet(schema, table, cols) {
  const wanted = [...cols].sort().join(',');
  return (schema.uniqueKeys.get(table) || []).some((key) => [...key].sort().join(',') === wanted);
}

/**
 * @param {import('pg').Pool} pool
 * @returns {{ get: () => Promise<object>, reload: () => Promise<object> }}
 */
function createSchemaCache(pool) {
  let pending = null;
  const reload = () => {
    pending = loadSchema(pool).catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  };
  return {
    get: () => pending || reload(),
    reload,
  };
}

module.exports = { createSchemaCache, isUniqueColumnSet };
