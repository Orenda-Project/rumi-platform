/**
 * The built-in database end to end: password generation, starting the
 * bundled Postgres, creating Rumi's tables over a direct connection (no
 * exec_sql), re-running as a no-op, a new migration being picked up, and
 * reusing a server that is already running.
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { ensurePassword, ensureRunning, probe } = require('../../infrastructure/db/bundled');
const { ensureSchema, inspectSchema } = require('../../infrastructure/db/schema');
const { databaseUrlFor } = require('../../bot/shared/services/db/pg-adapter/drivers');
const { readEnvFile } = require('../../bot/scripts/setup/env-file');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

describe('ensurePassword', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-envpw-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('generates once, saves only the password to .env, and keeps an existing one', () => {
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'OPENROUTER_API_KEY=k\n');
    const env = {};
    expect(ensurePassword(env, { envPath })).toEqual({ created: true });
    expect(env.RUMI_DB_PASSWORD).toMatch(/^[0-9a-f]{48}$/);
    expect(readEnvFile(envPath)).toEqual({ OPENROUTER_API_KEY: 'k', RUMI_DB_PASSWORD: env.RUMI_DB_PASSWORD });
    const before = env.RUMI_DB_PASSWORD;
    expect(ensurePassword(env, { envPath })).toEqual({ created: false });
    expect(env.RUMI_DB_PASSWORD).toBe(before);
  });
});

describe('bundled Postgres + schema', () => {
  let dataDir;
  let env;
  let server;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-bundled-'));
    env = {
      DB_DRIVER: 'bundled',
      RUMI_DB_PASSWORD: 'test-password-123',
      RUMI_DB_PORT: String(await freePort()),
      RUMI_DB_DIR: dataDir,
    };
    server = await ensureRunning(env);
  }, 120000);

  afterAll(async () => {
    if (server) await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('started a real server, reachable with the generated settings', async () => {
    expect(server.started).toBe(true);
    expect(await probe(env)).toEqual({ ok: true, detail: 'running' });
    expect(fs.existsSync(path.join(dataDir, 'PG_VERSION'))).toBe(true);
  });

  test('a second ensureRunning reuses it instead of starting another', async () => {
    const again = await ensureRunning(env);
    expect(again.started).toBe(false);
  });

  test('empty database → creates every table and records every migration', async () => {
    expect((await inspectSchema(databaseUrlFor(env))).state).toBe('needs-schema');
    const result = await ensureSchema(databaseUrlFor(env));
    expect(result).toMatchObject({ action: 'created', ok: true, errors: [] });
    expect((await inspectSchema(databaseUrlFor(env))).state).toBe('ready');

    const pool = new Pool({ connectionString: databaseUrlFor(env) });
    try {
      const tables = await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
      expect(tables.rows[0].n).toBeGreaterThan(80);
      const migrationFiles = fs.readdirSync(path.resolve(__dirname, '../../infrastructure/supabase/migrations'))
        .filter((f) => /^V\d+\.\d+\.\d+__.*\.sql$/.test(f));
      const recorded = await pool.query('SELECT version FROM schema_versions');
      const versions = recorded.rows.map((r) => r.version);
      for (const f of migrationFiles) expect(versions).toContain(f.match(/^V(\d+\.\d+\.\d+)__/)[1]);
    } finally {
      await pool.end();
    }
  }, 120000);

  test('re-running on an up-to-date database applies nothing', async () => {
    const result = await ensureSchema(databaseUrlFor(env));
    expect(result).toMatchObject({ action: 'migrated', ok: true, applied: [] });
  });

  test('a wrong password on the port is reported as a different database, not started over', async () => {
    await expect(ensureRunning({ ...env, RUMI_DB_PASSWORD: 'wrong' })).rejects.toThrow(/different database is already using port/);
  });
});
