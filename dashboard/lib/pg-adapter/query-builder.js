/**
 * A supabase-js-compatible query builder that runs SQL directly over a `pg`
 * Pool instead of going through PostgREST over HTTP.
 *
 * Only the surface Rumi uses is implemented (see tests/db/pg-client.test.js).
 * Like supabase-js, filter/modifier methods mutate the builder and return
 * `this`, so both `q = q.eq(...)` and a bare `q.eq(...)` work; and awaiting it
 * never throws — failures come back as { data: null, error }.
 */

const { parseLogicTree, parseSelect, assertIdent } = require('./postgrest-syntax');
const {
  AliasCounter, Params, limitSql, logicSql, orderSql, qualifiedTable, quoteIdent, selectTreeSql,
} = require('./sql-compiler');
const { AdapterError, statusText, toPostgrestError } = require('./errors');
const { rpcCallSql } = require('./rpc');

const WRITE_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);

/**
 * Column names of a write payload. Keys whose value is undefined are left
 * out: supabase-js JSON-encodes the body, which drops them, so the column
 * keeps its default (insert) or current value (update) instead of NULL.
 */
function assertRowKeys(rows) {
  const columns = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new AdapterError('PGRST102', 'Every row must be a JSON object');
    }
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined && !columns.includes(key)) columns.push(assertIdent(key, 'column'));
    }
  }
  return columns;
}

function assertNonNegativeInt(value, what) {
  if (!Number.isInteger(value) || value < 0) throw new AdapterError('PGRST103', `${what} must be a non-negative integer`);
  return value;
}

class PgQueryBuilder {
  /**
   * @param {{ pool: import('pg').Pool, schemaCache: object }} deps
   * @param {{ table?: string, rpc?: { name: string, args: object } }} source
   */
  constructor(deps, source) {
    this.deps = deps;
    this.source = source;
    this.method = source.rpc ? 'rpc' : null;
    this.columns = '*';
    this.isReturning = Boolean(source.rpc);
    this.countMode = null;
    this.isHead = false;
    this.values = null;
    this.writeOptions = {};
    this.conditions = [];
    this.orders = [];
    this.limitCount = null;
    this.offsetCount = 0;
    this.resultMode = 'many';
  }

  // ── statement methods ──────────────────────────────────────────────

  select(columns = '*', { count = null, head = false } = {}) {
    this.columns = columns;
    if (this.method === null) {
      this.method = 'select';
      this.countMode = count;
      this.isHead = head;
    } else {
      this.isReturning = true;
    }
    return this;
  }

  insert(values, { count = null } = {}) {
    return this.write('insert', values, { count });
  }

  upsert(values, { onConflict, ignoreDuplicates = false, count = null } = {}) {
    return this.write('upsert', values, { onConflict, ignoreDuplicates, count });
  }

  update(values, { count = null } = {}) {
    return this.write('update', values, { count });
  }

  delete({ count = null } = {}) {
    return this.write('delete', null, { count });
  }

  write(method, values, options) {
    this.method = method;
    this.values = values;
    this.writeOptions = options;
    this.countMode = options.count;
    return this;
  }

  // ── filters ────────────────────────────────────────────────────────

  addFilter(column, op, value, negate = false) {
    this.conditions.push({ type: 'filter', column, op, value, negate });
    return this;
  }

  eq(column, value) { return this.addFilter(column, 'eq', value); }

  neq(column, value) { return this.addFilter(column, 'neq', value); }

  gt(column, value) { return this.addFilter(column, 'gt', value); }

  gte(column, value) { return this.addFilter(column, 'gte', value); }

  lt(column, value) { return this.addFilter(column, 'lt', value); }

  lte(column, value) { return this.addFilter(column, 'lte', value); }

  like(column, pattern) { return this.addFilter(column, 'like', pattern); }

  ilike(column, pattern) { return this.addFilter(column, 'ilike', pattern); }

  is(column, value) { return this.addFilter(column, 'is', value); }

  in(column, values) { return this.addFilter(column, 'in', values); }

  contains(column, value) { return this.addFilter(column, 'cs', value); }

  containedBy(column, value) { return this.addFilter(column, 'cd', value); }

  not(column, operator, value) { return this.addFilter(column, operator, value, true); }

  filter(column, operator, value) {
    const negate = operator.startsWith('not.');
    return this.addFilter(column, negate ? operator.slice(4) : operator, value, negate);
  }

  match(query) {
    Object.entries(query).forEach(([column, value]) => this.eq(column, value));
    return this;
  }

  or(filters) {
    this.conditions.push({ type: 'logic', text: filters });
    return this;
  }

  // ── modifiers ──────────────────────────────────────────────────────

  order(column, { ascending = true, nullsFirst, foreignTable, referencedTable } = {}) {
    if (foreignTable || referencedTable) {
      this.deferredError = new AdapterError('PGRST100', 'Ordering an embedded resource is not supported by the Postgres driver');
    }
    this.orders.push({ column, ascending, nullsFirst });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  range(from, to) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.resultMode = 'single';
    return this;
  }

  maybeSingle() {
    this.resultMode = 'maybeSingle';
    return this;
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  // ── compilation ────────────────────────────────────────────────────

  whereSql(params) {
    return this.conditions.map((cond) => {
      if (cond.type === 'filter') return logicSql(cond, 't0', params);
      const tree = parseLogicTree(cond.text);
      return logicSql({ type: 'group', op: 'or', negate: false, children: tree }, 't0', params);
    });
  }

  /**
   * The caller's limit, capped at maxRows for reads — PostgREST's max-rows,
   * which hosted Supabase sets to 1000 by default. Counts are not capped.
   */
  effectiveLimit() {
    const requested = this.limitCount === null ? null : assertNonNegativeInt(this.limitCount, 'limit');
    const cap = this.method === 'select' || this.method === 'rpc' ? this.deps.maxRows : null;
    if (!cap) return requested;
    return requested === null ? cap : Math.min(requested, cap);
  }

  /** SELECT … that turns rows of `fromSql` (aliased t0) into { count, data }. */
  projectionSql(schema, fromSql, params, extraWhere = []) {
    const table = this.source.table || null;
    const ctx = { schema, aliases: new AliasCounter() };
    const tree = parseSelect(this.columns);
    if (!table && tree.some((n) => n.type === 'embed')) {
      throw new AdapterError('PGRST100', 'Embedding is only supported on tables');
    }
    const { items, innerConditions } = selectTreeSql(ctx, tree, table, 't0');
    const where = [...extraWhere, ...innerConditions];
    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    const limit = limitSql(this.effectiveLimit(), assertNonNegativeInt(this.offsetCount, 'offset'));
    const rows = `SELECT ${items.join(', ')} FROM ${fromSql}${whereSql}${orderSql(this.orders, 't0')}${limit}`;
    const dataSql = this.isHead || !this.isReturning
      ? 'NULL::json'
      : `(SELECT COALESCE(json_agg(_r), '[]'::json) FROM (${rows}) _r)`;
    const countSql = this.countMode ? `(SELECT count(*) FROM ${fromSql}${whereSql})` : 'NULL::bigint';
    return `SELECT ${countSql} AS count, ${dataSql} AS data`;
  }

  readSql(schema, params) {
    this.isReturning = true;
    const from = `${qualifiedTable(assertIdent(this.source.table, 'table'))} AS t0`;
    return this.projectionSql(schema, from, params, this.whereSql(params));
  }

  writeSql(schema, params) {
    const table = assertIdent(this.source.table, 'table');
    const target = qualifiedTable(table);
    const where = this.whereSql(params);
    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    let statement;

    if (this.method === 'delete') {
      statement = `DELETE FROM ${target} AS t0${whereSql} RETURNING t0.*`;
    } else if (this.method === 'update') {
      const columns = assertRowKeys([this.values]);
      if (columns.length === 0) throw new AdapterError('PGRST102', 'Update payload has no columns');
      const sets = columns.map((c) => `${quoteIdent(c)} = _b.${quoteIdent(c)}`).join(', ');
      const record = `json_populate_record(NULL::${target}, ${params.add(JSON.stringify(this.values))}::json)`;
      statement = `UPDATE ${target} AS t0 SET ${sets} FROM (SELECT * FROM ${record}) AS _b${whereSql} RETURNING t0.*`;
    } else {
      statement = this.insertSql(schema, table, target, params);
    }
    return `WITH _w AS (${statement}) ${this.projectionSql(schema, '_w AS t0', params)}`;
  }

  insertSql(schema, table, target, params) {
    const rows = Array.isArray(this.values) ? this.values : [this.values];
    const columns = assertRowKeys(rows);
    if (columns.length === 0) {
      if (rows.length !== 1) throw new AdapterError('PGRST102', 'Cannot bulk insert rows with no columns');
      return `INSERT INTO ${target} AS t0 DEFAULT VALUES RETURNING t0.*`;
    }
    const cols = columns.map(quoteIdent).join(', ');
    const source = `json_populate_recordset(NULL::${target}, ${params.add(JSON.stringify(rows))}::json)`;
    let sql = `INSERT INTO ${target} AS t0 (${cols}) SELECT ${cols} FROM ${source}`;

    if (this.method === 'upsert') {
      const { onConflict, ignoreDuplicates } = this.writeOptions;
      const conflictCols = onConflict
        ? onConflict.split(',').map((c) => assertIdent(c.trim(), 'onConflict column'))
        : schema.primaryKeys.get(table);
      if (!conflictCols) throw new AdapterError('PGRST100', `Table '${table}' has no primary key; pass onConflict`);
      const updates = columns.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ');
      sql += ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')})`;
      sql += ignoreDuplicates ? ' DO NOTHING' : ` DO UPDATE SET ${updates}`;
    }
    return `${sql} RETURNING t0.*`;
  }

  async compile() {
    if (this.deferredError) throw this.deferredError;
    const schema = await this.deps.schemaCache.get();
    const params = new Params();
    if (this.method === 'rpc') {
      const call = rpcCallSql(schema, this.source.rpc.name, this.source.rpc.args, params);
      if (call.kind === 'rows') {
        const from = `${call.sql} AS t0`;
        return { text: this.projectionSql(schema, from, params, this.whereSql(params)), values: params.values, call };
      }
      const DATA_SQL = {
        void: `(SELECT NULL::json FROM ${call.sql} AS _v)`,
        values: `(SELECT COALESCE(json_agg(_v), '[]'::json) FROM ${call.sql} AS _v)`,
        scalar: `to_json(${call.sql})`,
      };
      const data = DATA_SQL[call.kind];
      return { text: `SELECT NULL::bigint AS count, ${data} AS data`, values: params.values, call };
    }
    const text = WRITE_METHODS.has(this.method) ? this.writeSql(schema, params) : this.readSql(schema, params);
    return { text, values: params.values, call: null };
  }

  // ── execution ──────────────────────────────────────────────────────

  successStatus() {
    if (this.method === 'insert' || this.method === 'upsert') return 201;
    if ((this.method === 'update' || this.method === 'delete') && !this.isReturning) return 204;
    return 200;
  }

  shapeResult(row, call) {
    let data = row.data;
    if (call && call.kind === 'void') data = null;
    if (call && call.kind === 'rows' && call.isSingleRow) data = Array.isArray(data) ? data[0] ?? null : data;
    const count = row.count === null ? null : Number(row.count);

    if (this.resultMode !== 'many' && Array.isArray(data)) {
      if (data.length > 1 || (data.length === 0 && this.resultMode === 'single')) {
        throw new AdapterError(
          'PGRST116',
          'JSON object requested, multiple (or no) rows returned',
          `The result contains ${data.length} rows`
        );
      }
      data = data[0] ?? null;
    }
    const status = this.successStatus();
    return { data, error: null, count, status, statusText: statusText(status) };
  }

  /**
   * A write with .single()/.maybeSingle() runs in a transaction and is rolled
   * back when the row count is wrong, as PostgREST does; everything else is a
   * single autocommit statement.
   */
  async run(text, values, call) {
    const isCheckedWrite = WRITE_METHODS.has(this.method) && this.resultMode !== 'many';
    if (!isCheckedWrite) {
      const { rows } = await this.deps.pool.query(text, values);
      return this.shapeResult(rows[0], call);
    }
    const conn = await this.deps.pool.connect();
    try {
      await conn.query('BEGIN');
      const { rows } = await conn.query(text, values);
      const result = this.shapeResult(rows[0], call);
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  async execute() {
    try {
      if (this.method === null) this.select();
      const { text, values, call } = await this.compile();
      return await this.run(text, values, call);
    } catch (err) {
      const { error, status } = toPostgrestError(err);
      return { data: null, error, count: null, status, statusText: statusText(status) };
    }
  }
}

module.exports = { PgQueryBuilder };
