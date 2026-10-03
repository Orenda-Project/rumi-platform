/**
 * In-memory stand-in for the supabase-js query builder, for the observe suite.
 *
 * The database is the network boundary, so this is what gets faked — the
 * observe code itself runs for real against it. It understands the subset of
 * PostgREST the observe modules use: select (with `table(cols)` /
 * `table!inner(cols)` joins on <table>_id or user_id, `alias:col->path` JSON
 * projections), eq/neq/in/is/not/gte/
 * lte/lt/gt/ilike/or-free filters (JSON paths like `col->a->>b` too), order, limit, single/maybeSingle, insert,
 * update, upsert, delete, `.select()` after a write, and `select(cols, { count: 'exact', head })`
 * (the matching-row count, before any limit; `head` returns no rows).
 *
 * Usage:
 *   const mockDb = createFakeSupabase({ users: [...], coaching_sessions: [...] });
 *   jest.mock('../../bot/shared/config/supabase', () => mockDb.client);  // jest wants the mock prefix
 *   mockDb.tables.coaching_sessions  // inspect writes
 */

let idCounter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

// Join name → [foreign key on the row, table to read]
const JOINS = {
  users: ['user_id', 'users'],
  schools: ['school_id', 'schools'],
  coaching_sessions: ['session_id', 'coaching_sessions'],
};

// A PostgREST JSON path ("analysis_data->observer_debrief->>audio_id"): `->`
// steps into JSON, a final `->>` reads the value as text.
function readCol(row, c) {
  if (!String(c).includes('->')) return row[c];
  const parts = String(c).split(/->>?/);
  let v = row[parts[0]];
  for (const p of parts.slice(1)) v = v === null || v === undefined ? undefined : v[p];
  if (/->>[^>]*$/.test(c) && v !== null && v !== undefined && typeof v === 'object') v = JSON.stringify(v);
  return v === undefined ? null : v;
}

function parseInList(v) {
  return String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

function createFakeSupabase(seed = {}, { strictSingle = false } = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const calls = [];

  function table(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function builder(name) {
    const state = { op: 'select', filters: [], orders: [], limit: null, single: null, payload: null, returning: false, cols: '*', onConflict: null };

    const matches = (row) => state.filters.every((f) => f(row));

    function project(row) {
      const out = { ...row };
      const re = /(\w+)(?:!inner)?\(([^)]*)\)/g;
      let m;
      while ((m = re.exec(state.cols))) {
        const join = JOINS[m[1]];
        if (!join) continue;
        const [fk, tname] = join;
        const target = table(tname).find((r) => r.id === row[fk]);
        out[m[1]] = target ? { ...target } : null;
      }
      // alias:column->json->path  (e.g. observer_debrief:analysis_data->observer_debrief)
      const aliasRe = /(\w+):(\w+(?:->>?\w+)+)/g;
      while ((m = aliasRe.exec(state.cols))) out[m[1]] = readCol(row, m[2]);
      return out;
    }

    function innerOk(row) {
      const re = /(\w+)!inner\(/g;
      let m;
      while ((m = re.exec(state.cols))) {
        const join = JOINS[m[1]];
        if (join && !table(join[1]).some((r) => r.id === row[join[0]])) return false;
      }
      return true;
    }

    function run() {
      calls.push({ table: name, op: state.op, payload: state.payload });
      const rows = table(name);
      let result;
      if (state.op === 'insert' || state.op === 'upsert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        result = list.map((p) => {
          if (state.op === 'upsert' && state.onConflict) {
            const keys = state.onConflict.split(',').map((k) => k.trim());
            const existing = rows.find((r) => keys.every((k) => r[k] === p[k]));
            if (existing) { Object.assign(existing, p); return existing; }
          }
          const row = { id: newId(), created_at: new Date().toISOString(), ...p };
          rows.push(row);
          return row;
        });
      } else if (state.op === 'update') {
        result = rows.filter(matches);
        result.forEach((r) => Object.assign(r, state.payload));
      } else if (state.op === 'delete') {
        result = rows.filter(matches);
        tables[name] = rows.filter((r) => !matches(r));
      } else {
        result = rows.filter(matches).filter(innerOk);
        for (const { col, asc } of state.orders.slice().reverse()) {
          result = result.slice().sort((a, b) => {
            if (a[col] === b[col]) return 0;
            if (a[col] === undefined || a[col] === null) return 1;
            if (b[col] === undefined || b[col] === null) return -1;
            return (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        state.matched = result.length;
        if (state.limit !== null) result = result.slice(state.offset || 0, (state.offset || 0) + state.limit);
      }
      if (state.op === 'select' && state.count) {
        return { data: state.head ? null : result.map(project), count: state.matched, error: null };
      }
      const data = (state.op === 'select' || state.returning) ? result.map(project) : null;
      if (state.single) {
        if (!data || data.length === 0) {
          return state.single === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'no rows' } };
        }
        // PostgREST refuses .single()/.maybeSingle() on more than one row; opt in to see what code does then.
        if (strictSingle && data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: data[0], error: null };
      }
      return { data, error: null };
    }

    const api = {
      select(cols = '*', opts = {}) {
        if (state.op === 'select') { state.cols = cols; state.count = opts.count || null; state.head = !!opts.head; }
        else { state.returning = true; state.cols = cols; }
        return api;
      },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      upsert(p, opts = {}) { state.op = 'upsert'; state.payload = p; state.onConflict = opts.onConflict || null; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(c, v) { state.filters.push((r) => readCol(r, c) === v); return api; },
      neq(c, v) { state.filters.push((r) => readCol(r, c) !== v); return api; },
      gt(c, v) { state.filters.push((r) => r[c] > v); return api; },
      gte(c, v) { state.filters.push((r) => r[c] >= v); return api; },
      lt(c, v) { state.filters.push((r) => r[c] < v); return api; },
      lte(c, v) { state.filters.push((r) => r[c] <= v); return api; },
      in(c, vs) { state.filters.push((r) => vs.includes(readCol(r, c))); return api; },
      is(c, v) { state.filters.push((r) => (v === null ? readCol(r, c) === null || readCol(r, c) === undefined : readCol(r, c) === v)); return api; },
      ilike(c, v) {
        const re = new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
        state.filters.push((r) => re.test(String(r[c] || '')));
        return api;
      },
      not(c, op, v) {
        if (op === 'in') { const list = parseInList(v); state.filters.push((r) => !list.includes(String(readCol(r, c)))); }
        else if (op === 'is') state.filters.push((r) => !(v === null ? readCol(r, c) === null || readCol(r, c) === undefined : readCol(r, c) === v));
        else if (op === 'eq') state.filters.push((r) => readCol(r, c) !== v);
        return api;
      },
      order(col, opts = {}) { state.orders.push({ col, asc: opts.ascending !== false }); return api; },
      limit(n) { state.limit = n; return api; },
      range(a, b) { state.offset = a; state.limit = b - a + 1; return api; },
      single() { state.single = 'one'; return api; },
      maybeSingle() { state.single = 'maybe'; return api; },
      // Runs at call time (as before) but returns a real promise, so a chained
      // `.then(cb)` resolves to cb's value like supabase-js does.
      then(resolve, reject) {
        let p;
        try { p = Promise.resolve(run()); } catch (e) { p = Promise.reject(e); }
        return p.then(resolve, reject);
      },
    };
    return api;
  }

  const client = { from: (name) => builder(name), rpc: async () => ({ data: null, error: null }) };
  return { client, tables, calls, table };
}

module.exports = { createFakeSupabase };
