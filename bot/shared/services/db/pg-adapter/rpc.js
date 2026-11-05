/**
 * Builds the SQL call for supabase.rpc(name, args), matching PostgREST:
 * named arguments, the overload whose argument names fit, and the result
 * shape decided by the function's return type —
 *   setof <row type> / returns table → rows (array of objects)
 *   setof <scalar>        → array of values
 *   returns <table row type> → one row (object)
 *   returns void          → null
 *   anything else         → the bare scalar value
 */

const { AdapterError } = require('./errors');
const { qualifiedTable, quoteIdent, toParam } = require('./sql-compiler');

function argParam(value, type) {
  if (value === undefined) return null;
  if (type === 'json' || type === 'jsonb') return JSON.stringify(value);
  if (type.endsWith('[]')) return value;
  return toParam(value);
}

function pickOverload(overloads, argNames) {
  return overloads.find((fn) => {
    const names = fn.args.map((a) => a.name);
    const allKnown = argNames.every((n) => names.includes(n));
    const requiredGiven = fn.args.slice(0, fn.requiredArgCount).every((a) => argNames.includes(a.name));
    return allKnown && requiredGiven;
  });
}

/**
 * @param {object} schema from schema-cache
 * @param {string} name
 * @param {object} args
 * @param {import('./sql-compiler').Params} params
 * @returns {{ kind: 'rows'|'values'|'scalar'|'void', sql: string, isSingleRow: boolean }}
 */
function rpcCallSql(schema, name, args = {}, params) {
  // Undefined arguments are left out, as supabase-js's JSON body drops them,
  // so the function's own default applies.
  const argNames = Object.keys(args || {}).filter((n) => args[n] !== undefined);
  const overloads = schema.functions.get(name) || [];
  const fn = pickOverload(overloads, argNames);
  if (!fn) {
    throw new AdapterError(
      'PGRST202',
      `Could not find the function public.${name}(${argNames.join(', ')}) in the schema cache`
    );
  }

  const typeOf = new Map(fn.args.map((a) => [a.name, a.type]));
  const callArgs = argNames.map((n) => {
    const type = typeOf.get(n);
    return `${quoteIdent(n)} := ${params.add(argParam(args[n], type))}::${type}`;
  });
  const sql = `${qualifiedTable(name)}(${callArgs.join(', ')})`;

  if (fn.returnsVoid) return { kind: 'void', sql, isSingleRow: false };
  if (fn.returnsRow) return { kind: 'rows', sql, isSingleRow: !fn.returnsSet };
  if (fn.returnsSet) return { kind: 'values', sql, isSingleRow: false };
  return { kind: 'scalar', sql, isSingleRow: false };
}

module.exports = { rpcCallSql };
