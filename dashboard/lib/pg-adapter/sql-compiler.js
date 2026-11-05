/**
 * Turns parsed PostgREST pieces (filters, select trees, orders) into SQL
 * fragments. Every value becomes a bound parameter ($n); every name has
 * already passed postgrest-syntax's identifier check and is double-quoted.
 *
 * Results are built as JSON inside Postgres (row_to_json / json_agg), the
 * same way PostgREST does it, so timestamps, numerics and jsonb come back in
 * exactly the format supabase-js callers already handle.
 */

const { parseColumnRef, parseList, PostgrestSyntaxError } = require('./postgrest-syntax');
const { AdapterError } = require('./errors');
const { isUniqueColumnSet } = require('./schema-cache');

/** Collects bound parameters; add() returns the $n placeholder. */
class Params {
  constructor() {
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Hands out unique table aliases (t0, t1, …) for nested subqueries. */
class AliasCounter {
  constructor() {
    this.next = 1;
  }

  take() {
    const alias = `t${this.next}`;
    this.next += 1;
    return alias;
  }
}

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const qualifiedTable = (table) => `"public".${quoteIdent(table)}`;

/**
 * SQL for a parsed column ref, e.g. t0."meta"->>'sent_at'.
 * @param {{name: string, path: Array<{op: string, key: string|number}>, cast: string|null}} ref
 * @param {string} tableAlias
 */
function columnSql(ref, tableAlias) {
  const base = `${tableAlias}.${quoteIdent(ref.name)}`;
  const withPath = ref.path.reduce(
    (sql, seg) => `${sql}${seg.op}${typeof seg.key === 'number' ? seg.key : `'${seg.key}'`}`,
    base
  );
  return ref.cast ? `(${withPath})::${ref.cast}` : withPath;
}

/** Name PostgREST gives an unaliased column: the last JSON key, else the column. */
function defaultColumnName(ref) {
  if (ref.path.length === 0) return ref.name;
  const last = ref.path[ref.path.length - 1].key;
  return typeof last === 'number' ? ref.name : last;
}

/** Non-null JS objects (not arrays, not Dates) are sent as JSON. */
function toParam(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    return JSON.stringify(value);
  }
  return value;
}

// Maps, not object literals: a lookup of 'constructor' must miss.
const COMPARISON_SQL = new Map([['eq', '='], ['neq', '<>'], ['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<=']]);
const IS_SQL = new Map([['null', 'NULL'], ['true', 'TRUE'], ['false', 'FALSE'], ['unknown', 'UNKNOWN']]);

function isSql(column, value) {
  const keyword = IS_SQL.get(String(value).toLowerCase());
  if (!keyword) throw new PostgrestSyntaxError(`"is" only accepts null, true, false or unknown (got "${value}")`);
  return `${column} IS ${keyword}`;
}

function containsSql(column, operator, value, params) {
  if (Array.isArray(value)) return `${column} ${operator} ${params.add(value)}`;
  if (value !== null && typeof value === 'object') return `${column} ${operator} ${params.add(JSON.stringify(value))}::jsonb`;
  return `${column} ${operator} ${params.add(value)}`;
}

/**
 * One filter → SQL boolean expression.
 * @param {{column: string, op: string, value: any, negate: boolean}} filter
 */
function filterSql(filter, tableAlias, params) {
  const column = columnSql(parseColumnRef(filter.column), tableAlias);
  const { op, value } = filter;
  let sql;
  if (COMPARISON_SQL.has(op)) sql = `${column} ${COMPARISON_SQL.get(op)} ${params.add(toParam(value))}`;
  else if (op === 'like' || op === 'ilike') {
    sql = `${column} ${op === 'like' ? 'LIKE' : 'ILIKE'} ${params.add(String(value).replace(/\*/g, '%'))}`;
  } else if (op === 'is') sql = isSql(column, value);
  else if (op === 'in') {
    const list = Array.isArray(value) ? value : parseList(value);
    sql = `${column} = ANY(${params.add(list.map(toParam))})`;
  } else if (op === 'cs') sql = containsSql(column, '@>', value, params);
  else if (op === 'cd') sql = containsSql(column, '<@', value, params);
  else throw new PostgrestSyntaxError(`Unsupported operator "${op}"`);
  return filter.negate ? `NOT (${sql})` : sql;
}

/** A parsed .or() / and() tree node → SQL. */
function logicSql(node, tableAlias, params) {
  if (node.type === 'filter') return filterSql(node, tableAlias, params);
  const joiner = node.op === 'and' ? ' AND ' : ' OR ';
  const inner = `(${node.children.map((c) => logicSql(c, tableAlias, params)).join(joiner)})`;
  return node.negate ? `NOT ${inner}` : inner;
}

/**
 * Find the FK linking parentTable to an embedded relation, PostgREST-style.
 *   holdsFk: true  — the parent holds the FK, so the embed is one row
 *   holdsFk: false — the embedded table holds the FK: many rows, unless its
 *                    FK columns are unique (a 1:1 table), then one row
 *   isObject       — whether the embed renders as an object (else an array)
 */
function resolveRelationship(schema, parentTable, relation, hint) {
  const candidates = [];
  for (const fk of schema.foreignKeys) {
    if (fk.srcTable === parentTable && fk.tgtTable === relation) {
      candidates.push({ holdsFk: true, isObject: true, fk });
    }
    if (fk.srcTable === relation && fk.tgtTable === parentTable) {
      candidates.push({ holdsFk: false, isObject: isUniqueColumnSet(schema, relation, fk.srcCols), fk });
    }
  }
  const matches = hint
    ? candidates.filter(({ fk }) => fk.name === hint || (fk.srcCols.length === 1 && fk.srcCols[0] === hint))
    : candidates;

  if (matches.length === 0) {
    throw new AdapterError(
      'PGRST200',
      `Could not find a relationship between '${parentTable}' and '${relation}' in the schema cache`,
      hint ? `Searched for a foreign key named or on column '${hint}'` : null
    );
  }
  if (matches.length > 1) {
    throw new AdapterError(
      'PGRST201',
      `Could not embed because more than one relationship was found for '${parentTable}' and '${relation}'`,
      matches.map(({ fk }) => fk.name).join(', ')
    );
  }
  return matches[0];
}

function joinCondition(rel, parentAlias, childAlias) {
  const { fk, holdsFk } = rel;
  const [childCols, parentCols] = holdsFk ? [fk.tgtCols, fk.srcCols] : [fk.srcCols, fk.tgtCols];
  return childCols
    .map((col, i) => `${childAlias}.${quoteIdent(col)} = ${parentAlias}.${quoteIdent(parentCols[i])}`)
    .join(' AND ');
}

/**
 * Compile a select tree for one table level.
 * @returns {{ items: string[], innerConditions: string[] }}
 *   items — select-list entries; innerConditions — EXISTS clauses from
 *   !inner embeds that the caller must add to this level's WHERE.
 */
function selectTreeSql(ctx, nodes, table, tableAlias) {
  const items = [];
  const innerConditions = [];
  for (const node of nodes) {
    if (node.type === 'star') {
      items.push(`${tableAlias}.*`);
    } else if (node.type === 'column') {
      const name = node.alias || defaultColumnName(node);
      items.push(`${columnSql(node, tableAlias)} AS ${quoteIdent(name)}`);
    } else {
      const embed = embedSql(ctx, node, table, tableAlias); // eslint-disable-line no-use-before-define
      items.push(embed.item);
      if (embed.innerCondition) innerConditions.push(embed.innerCondition);
    }
  }
  return { items, innerConditions };
}

function embedSql(ctx, node, parentTable, parentAlias) {
  const rel = resolveRelationship(ctx.schema, parentTable, node.relation, node.hint);
  const childAlias = ctx.aliases.take();
  const join = joinCondition(rel, parentAlias, childAlias);
  const child = selectTreeSql(ctx, node.children, node.relation, childAlias);
  const where = [join, ...child.innerConditions].join(' AND ');
  const from = `${qualifiedTable(node.relation)} AS ${childAlias}`;
  const key = quoteIdent(node.alias || node.relation);

  const item = rel.isObject
    ? `(SELECT row_to_json(_e) FROM (SELECT ${child.items.join(', ')} FROM ${from} WHERE ${where} LIMIT 1) _e) AS ${key}`
    : `COALESCE((SELECT json_agg(_e) FROM (SELECT ${child.items.join(', ')} FROM ${from} WHERE ${where}) _e), '[]'::json) AS ${key}`;

  const innerAlias = ctx.aliases.take();
  const innerCondition = node.isInner
    ? `EXISTS (SELECT 1 FROM ${qualifiedTable(node.relation)} AS ${innerAlias} WHERE ${joinCondition(rel, parentAlias, innerAlias)})`
    : null;
  return { item, innerCondition };
}

/** ORDER BY clause from [{ column, ascending, nullsFirst }]. */
function orderSql(orders, tableAlias) {
  if (orders.length === 0) return '';
  const parts = orders.map(({ column, ascending, nullsFirst }) => {
    const nulls = nullsFirst === undefined ? '' : nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
    return `${columnSql(parseColumnRef(column), tableAlias)} ${ascending ? 'ASC' : 'DESC'}${nulls}`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

function limitSql(limit, offset) {
  return `${limit === null ? '' : ` LIMIT ${limit}`}${offset ? ` OFFSET ${offset}` : ''}`;
}

module.exports = {
  AliasCounter,
  Params,
  columnSql,
  limitSql,
  logicSql,
  orderSql,
  qualifiedTable,
  quoteIdent,
  selectTreeSql,
  toParam,
};
