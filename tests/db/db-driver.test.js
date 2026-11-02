/**
 * DB_DRIVER selection and the cold-boot env-gate in bot/shared/services/db.
 * Existing Supabase installs (SUPABASE_URL set, no DB_DRIVER) must keep the
 * supabase driver; missing env for the chosen driver must exit 78.
 */

const {
  databaseUrlFor, isDirectPostgres, maxRowsFromEnv, missingDbEnv, postgresPoolConfig, resolveDbDriver,
} = require('../../bot/shared/services/db/pg-adapter/drivers');

describe('databaseUrlFor', () => {
  test('bundled: built from RUMI_DB_* with defaults, password URL-encoded', () => {
    expect(databaseUrlFor({ RUMI_DB_PASSWORD: 'p@ss/w' })).toBe('postgres://postgres:p%40ss%2Fw@127.0.0.1:54329/postgres');
    expect(databaseUrlFor({ RUMI_DB_PASSWORD: 'x', RUMI_DB_HOST: 'db.internal', RUMI_DB_PORT: '6000' }))
      .toBe('postgres://postgres:x@db.internal:6000/postgres');
  });

  test('postgres: DATABASE_URL as given', () => {
    expect(databaseUrlFor({ DATABASE_URL: 'postgres://u:p@h/db' })).toBe('postgres://u:p@h/db');
  });
});

test('isDirectPostgres', () => {
  expect(['bundled', 'postgres', 'supabase'].map(isDirectPostgres)).toEqual([true, true, false]);
});

describe('postgresPoolConfig', () => {
  test('defaults: UTC sessions, 60s statement timeout, 10s connect timeout, 10 connections', () => {
    expect(postgresPoolConfig({ DATABASE_URL: 'postgres://x' })).toEqual({
      connectionString: 'postgres://x',
      max: 10,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
      options: '-c TimeZone=UTC -c statement_timeout=60000',
    });
  });

  test('sslmode=require means "encrypt", as in every other Postgres tool', () => {
    const { parse } = require('pg-connection-string');
    const url = databaseUrlFor({ DATABASE_URL: 'postgres://u:p@db.example.com:5432/x?sslmode=require' });
    expect(url).toBe('postgres://u:p@db.example.com:5432/x?sslmode=require&uselibpqcompat=true');
    expect(parse(url).ssl).toMatchObject({ rejectUnauthorized: false });
    const strict = databaseUrlFor({ DATABASE_URL: 'postgres://h/x?sslmode=verify-full' });
    expect(parse(strict).ssl).not.toMatchObject({ rejectUnauthorized: false });
    expect(databaseUrlFor({ DATABASE_URL: 'postgres://h/x' })).toBe('postgres://h/x');
    expect(databaseUrlFor({ DATABASE_URL: 'postgres://h/x?sslmode=require&uselibpqcompat=true' }))
      .toBe('postgres://h/x?sslmode=require&uselibpqcompat=true');
  });

  test('DB_POOL_MAX and DB_STATEMENT_TIMEOUT_MS override; junk falls back', () => {
    expect(postgresPoolConfig({ DB_POOL_MAX: '4', DB_STATEMENT_TIMEOUT_MS: '0' })).toMatchObject({
      max: 4,
      options: '-c TimeZone=UTC -c statement_timeout=0',
    });
    expect(postgresPoolConfig({ DB_POOL_MAX: 'lots', DB_STATEMENT_TIMEOUT_MS: '-5 ; drop' })).toMatchObject({
      max: 10,
      options: '-c TimeZone=UTC -c statement_timeout=60000',
    });
  });
});

describe('maxRowsFromEnv', () => {
  test.each([[undefined, 1000], ['250', 250], ['0', null], ['x', 1000]])('%p → %p', (value, expected) => {
    expect(maxRowsFromEnv({ DB_MAX_ROWS: value })).toBe(expected);
  });
});

describe('resolveDbDriver', () => {
  test.each([
    [{}, 'bundled'],
    [{ RUMI_DB_PASSWORD: 'x' }, 'bundled'],
    [{ DATABASE_URL: 'postgres://x' }, 'postgres'],
    [{ DATABASE_URL: 'postgres://x', DB_DRIVER: 'bundled' }, 'bundled'],
    [{ SUPABASE_URL: 'https://p.supabase.co' }, 'supabase'],
    [{ SUPABASE_URL: 'https://p.supabase.co', DATABASE_URL: 'postgres://x' }, 'supabase'],
    [{ SUPABASE_URL: 'https://p.supabase.co', DB_DRIVER: 'postgres' }, 'postgres'],
    [{ DB_DRIVER: ' Supabase ' }, 'supabase'],
  ])('%j → %s', (env, expected) => {
    expect(resolveDbDriver(env)).toBe(expected);
  });

  test('unknown DB_DRIVER throws with the valid values', () => {
    expect(() => resolveDbDriver({ DB_DRIVER: 'mysql' })).toThrow(/bundled \| postgres \| supabase/);
  });
});

describe('missingDbEnv', () => {
  test('bundled needs its generated password', () => {
    expect(missingDbEnv('bundled', {})).toEqual(['RUMI_DB_PASSWORD']);
  });

  test('postgres needs DATABASE_URL', () => {
    expect(missingDbEnv('postgres', {})).toEqual(['DATABASE_URL']);
    expect(missingDbEnv('postgres', { DATABASE_URL: 'postgres://x' })).toEqual([]);
  });

  test('supabase needs URL and service-role key', () => {
    expect(missingDbEnv('supabase', { SUPABASE_URL: 'u' })).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
  });
});

describe('services/db env-gate', () => {
  const KEYS = ['DB_DRIVER', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RUMI_DB_PASSWORD'];
  let savedEnv;
  let exitSpy;
  let stderrSpy;

  beforeEach(() => {
    savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    KEYS.forEach((k) => delete process.env[k]);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    KEYS.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const load = () => {
    let mod;
    jest.isolateModules(() => {
      mod = require('../../bot/shared/services/db');
    });
    return mod;
  };

  test('no database env at all → exits 78 pointing at the built-in database setup', () => {
    expect(load).toThrow('exit 78');
    const out = stderrSpy.mock.calls.join('');
    expect(out).toMatch(/DB_DRIVER=bundled: RUMI_DB_PASSWORD/);
    expect(out).toMatch(/rumi setup/);
  });

  test('DB_DRIVER=postgres without DATABASE_URL → exits 78 naming it', () => {
    process.env.DB_DRIVER = 'postgres';
    expect(load).toThrow('exit 78');
    expect(stderrSpy.mock.calls.join('')).toMatch(/DB_DRIVER=postgres: DATABASE_URL/);
  });

  test('DB_DRIVER=supabase without its keys → exits 78 naming them', () => {
    process.env.DB_DRIVER = 'supabase';
    expect(load).toThrow('exit 78');
    expect(stderrSpy.mock.calls.join('')).toMatch(/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
  });

  test('unknown DB_DRIVER → exits 78', () => {
    process.env.DB_DRIVER = 'mysql';
    expect(load).toThrow('exit 78');
  });

  test('postgres driver loads lazily: from() and rpc() exist, no connection at require', () => {
    process.env.DATABASE_URL = 'postgres://postgres:x@127.0.0.1:1/postgres';
    const db = load();
    expect(typeof db.from).toBe('function');
    expect(typeof db.rpc).toBe('function');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('config/supabase.js re-exports the same client', () => {
    process.env.DATABASE_URL = 'postgres://postgres:x@127.0.0.1:1/postgres';
    let viaConfig;
    let viaDb;
    jest.isolateModules(() => {
      viaConfig = require('../../bot/shared/config/supabase');
      viaDb = require('../../bot/shared/services/db');
    });
    expect(viaConfig).toBe(viaDb);
  });
});
