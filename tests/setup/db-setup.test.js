/**
 * db-setup.js — telling apart the three states a Supabase project can be in.
 *
 * This distinction is the whole reason the module exists. "No tables yet" and
 * "no tables and no way to create them" look identical from the outside but need
 * opposite instructions, and conflating them is what produces the classic
 * self-serve dead end: a 404 from an RPC nobody mentioned, on a project the user
 * just created correctly.
 */

const dbSetup = require('../../bot/scripts/setup/db-setup');

const ENV = { SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };

/** A fetch stand-in that answers by URL. */
function fakeFetch(routes) {
  return jest.fn(async (url) => {
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) return response;
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

const respond = (status, body = '') => ({
  status, ok: status >= 200 && status < 300, text: async () => body,
});

describe('inspectDatabase', () => {
  it('reports ready when the schema is already applied', async () => {
    const result = await dbSetup.inspectDatabase(ENV, fakeFetch({ '/rest/v1/users': respond(200, '[]') }));
    expect(result.state).toBe('ready');
  });

  it('reports needs-schema when the tables are missing but the SQL helper is there', async () => {
    const result = await dbSetup.inspectDatabase(ENV, fakeFetch({
      '/rest/v1/users': respond(404, 'PGRST205'),
      '/rpc/exec_sql': respond(200),
    }));
    expect(result.state).toBe('needs-schema');
  });

  it('reports needs-helper when the helper is missing too — the manual step', async () => {
    const result = await dbSetup.inspectDatabase(ENV, fakeFetch({
      '/rest/v1/users': respond(404, 'PGRST205'),
      '/rpc/exec_sql': respond(404, 'Could not find the function public.exec_sql'),
    }));
    expect(result.state).toBe('needs-helper');
  });

  it('reports unreachable — not "no tables" — when the key is rejected', async () => {
    // A wrong key answers 401 for every table. Calling that "no schema yet"
    // would send the user to create tables they may already have.
    const result = await dbSetup.inspectDatabase(ENV, fakeFetch({ '/rest/v1/users': respond(401) }));
    expect(result.state).toBe('unreachable');
    expect(result.detail).toMatch(/rejected/);
  });

  it('reports unreachable with the network error when the host does not answer', async () => {
    const failing = jest.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    const result = await dbSetup.inspectDatabase(ENV, failing);
    expect(result.state).toBe('unreachable');
    expect(result.detail).toMatch(/ENOTFOUND/);
  });
});

describe('hasExecSql', () => {
  it('probes with a harmless statement — existing and working are different claims', async () => {
    const fetchImpl = fakeFetch({ '/rpc/exec_sql': respond(200) });
    const result = await dbSetup.hasExecSql(ENV, fetchImpl);

    expect(result.present).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ query: 'select 1' });
  });

  it('reports absent with the status when it is not callable', async () => {
    const result = await dbSetup.hasExecSql(ENV, fakeFetch({ '/rpc/exec_sql': respond(404, 'not found') }));
    expect(result).toMatchObject({ present: false });
    expect(result.detail).toMatch(/404/);
  });
});

describe('sqlEditorUrl', () => {
  it('lands on the right page of the right project', () => {
    // Handing over a precise link is the difference between a two-minute step
    // and hunting through a dashboard.
    expect(dbSetup.sqlEditorUrl('https://abcdefgh.supabase.co'))
      .toBe('https://supabase.com/dashboard/project/abcdefgh/sql/new');
  });

  it('returns null for a self-hosted project, where no such page exists', () => {
    expect(dbSetup.sqlEditorUrl('http://localhost:54321')).toBeNull();
    expect(dbSetup.sqlEditorUrl('')).toBeNull();
  });
});

describe('the one-time helper definition', () => {
  it('is the function every schema and migration script here runs SQL through', () => {
    const sql = dbSetup.EXEC_SQL_DEFINITION.join(' ');
    expect(sql).toMatch(/create or replace function exec_sql\(query text\)/i);
    expect(sql).toMatch(/execute query/i);
  });
});
