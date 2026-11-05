/**
 * SUPABASE_DB_SSL: the dashboard and portal talk to Postgres directly, and the
 * pool always asked for SSL, so against the laptop-local stack (plain
 * Postgres, no SSL) every dashboard and portal request failed with "The
 * server does not support SSL connections". Hosted Supabase keeps SSL.
 */

describe('dashboard Postgres pool SSL', () => {
  const SAVED = { ...process.env };
  afterEach(() => { process.env = { ...SAVED }; jest.resetModules(); });

  function poolConfig(env) {
    jest.resetModules();
    Object.assign(process.env, env);
    const configs = [];
    jest.doMock('pg', () => ({ Pool: jest.fn(function Pool(cfg) { configs.push(cfg); this.on = jest.fn(); }) }), { virtual: true });
    jest.doMock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
    jest.useFakeTimers();
    require('../../dashboard/config/database');
    jest.useRealTimers();
    return configs[0];
  }

  it('keeps SSL by default (hosted Supabase)', () => {
    delete process.env.SUPABASE_DB_SSL;
    expect(poolConfig({}).ssl).toEqual({ rejectUnauthorized: false });
  });

  it('turns SSL off with SUPABASE_DB_SSL=off (the local stack)', () => {
    expect(poolConfig({ SUPABASE_DB_SSL: 'off' }).ssl).toBe(false);
  });
});

describe('dashboard picks up the built-in database settings from the repo-root .env', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { loadBundledDbEnv } = require('../../dashboard/lib/root-env');

  it('copies only RUMI_DB_*, and never over a value already set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-rootenv-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, 'RUMI_DB_PASSWORD="abc"\nRUMI_DB_PORT=6000\nSUPABASE_URL=https://x.supabase.co\nDB_DRIVER=bundled\n');
    const env = { RUMI_DB_PORT: '7000' };
    loadBundledDbEnv(env, file);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(env).toEqual({ RUMI_DB_PASSWORD: 'abc', RUMI_DB_PORT: '7000' });
  });

  it('does nothing without a repo-root .env (a standalone dashboard)', () => {
    const env = {};
    loadBundledDbEnv(env, '/nonexistent/.env');
    expect(env).toEqual({});
  });
});
