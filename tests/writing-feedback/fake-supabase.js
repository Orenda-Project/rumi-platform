/**
 * An in-memory stand-in for `bot/shared/config/supabase`, scoped to the query
 * shapes writing-feedback.service.js actually issues:
 *
 *   .from(t).insert(row).select().single()
 *   .from(t).select('*').eq('user_id', id).not('status','in',…).order().limit(1).single()
 *   .from(t).update(patch).eq('id', id)                      ← awaited directly
 *   .from(t).select('*').eq('id', id).single()
 *
 * Deliberately NOT a generic Supabase emulator: it stores real rows so the
 * state-machine tests assert real transitions (and real persisted columns)
 * rather than assert-on-mock-calls, which would pass even if the state machine
 * wrote nonsense.
 */

function createFakeSupabase(initialRows = []) {
  const rows = initialRows.map((r) => ({ ...r }));
  let idCounter = 0;

  function nextId() {
    idCounter += 1;
    return `00000000-0000-0000-0000-00000000000${idCounter}`;
  }

  function builder(table) {
    const ctx = {
      table,
      filters: [],
      notFilters: [],
      orderDesc: true,
      limit: null,
      pendingInsert: null,
    };

    const matches = (row) =>
      ctx.filters.every(([col, val]) => row[col] === val)
      && ctx.notFilters.every(([col, list]) => !list.includes(row[col]));

    const select = () => fluent;

    const resolveUpdate = () => Promise.resolve({ error: null, data: null });

    const fluent = {
      select,
      insert(payload) {
        const row = {
          id: nextId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...payload,
        };
        rows.push(row);
        ctx.pendingInsert = row;
        return fluent;
      },
      update(patch) {
        ctx.pendingUpdate = patch;
        return {
          eq(col, val) {
            const target = rows.find((r) => r[col] === val);
            if (target) Object.assign(target, patch);
            return resolveUpdate();
          },
        };
      },
      eq(col, val) {
        ctx.filters.push([col, val]);
        return fluent;
      },
      not(col, op, valueList) {
        // Only the `('a','b')` in-list form the service uses.
        const list = String(valueList).replace(/[()"']/g, '').split(',').map((s) => s.trim());
        ctx.notFilters.push([col, list]);
        return fluent;
      },
      order() {
        return fluent;
      },
      limit(n) {
        ctx.limit = n;
        return fluent;
      },
      single() {
        if (ctx.pendingInsert) {
          return Promise.resolve({ data: { ...ctx.pendingInsert }, error: null });
        }
        const found = rows.filter(matches);
        if (found.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'No rows found' } });
        }
        return Promise.resolve({ data: { ...found[found.length - 1] }, error: null });
      },
    };

    return fluent;
  }

  return {
    from: (table) => builder(table),
    __rows: () => rows.map((r) => ({ ...r })),
    // Write straight to the stored row, bypassing the service — the only way
    // to age a row past the session timeout, since updateSession() always
    // stamps updated_at itself.
    __patch: (id, patch) => {
      const target = rows.find((r) => r.id === id);
      if (target) Object.assign(target, patch);
      return target;
    },
    __reset: () => { rows.length = 0; idCounter = 0; },
  };
}

/** A no-op Redis double: every writing-feedback Redis path is best-effort. */
function createFakeRedis() {
  const store = new Map();
  return {
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async setex(key, _ttl, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    async set(key, value) { store.set(key, value); },
    async setNX() { return true; },
    __store: store,
  };
}

module.exports = { createFakeSupabase, createFakeRedis };
