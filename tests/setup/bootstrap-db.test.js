/**
 * bootstrap-db — one-command fresh-install applies the 3 canonical SQL files in
 * order against an injected SQL executor. Verifies ordering, real-file reads,
 * stop-on-error, and missing-file handling. No live DB (execSql is injected).
 */

const path = require('path');
const { DatabaseBootstrapper } = require('../../infrastructure/scripts/bootstrap-db');

const SCHEMA_DIR = path.resolve(__dirname, '../../infrastructure/supabase');

describe('DatabaseBootstrapper', () => {
  it('applies the 3 canonical files in order (schema → rls → seed)', async () => {
    const applied = [];
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: SCHEMA_DIR,
      execSql: async (_sql, label) => { applied.push(label); },
    });
    const result = await b.bootstrap();
    expect(applied[0]).toMatch(/^00_complete-schema\.sql#1$/);
    expect(applied.some((label) => label.startsWith('01_rls-policies.sql#'))).toBe(true);
    expect(applied.some((label) => label.startsWith('02_seed-data.sql#'))).toBe(true);
    // Whole-file EXECUTE cannot create tables; each statement is its own RPC.
    expect(applied.filter((label) => label.startsWith('00_complete-schema.sql#')).length).toBeGreaterThan(10);
    expect(result.errors).toEqual([]);
    expect(result.applied).toEqual([
      '00_complete-schema.sql',
      '01_rls-policies.sql',
      '02_seed-data.sql',
    ]);
  });

  it('passes real statement text to execSql (non-empty schema)', async () => {
    const chunks = [];
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: SCHEMA_DIR,
      execSql: async (sql, label) => { chunks.push({ sql, label }); },
    });
    await b.bootstrap();
    const schema = chunks.filter((c) => c.label.startsWith('00_complete-schema.sql#'));
    expect(schema.some((c) => /create table if not exists users/i.test(c.sql))).toBe(true);
    expect(schema.reduce((n, c) => n + c.sql.length, 0)).toBeGreaterThan(1000);
    expect(chunks.filter((c) => c.label.startsWith('02_seed-data.sql#')).length).toBeGreaterThan(0);
  });

  it('stops at the first failure — RLS/seed are not applied if schema fails', async () => {
    const applied = [];
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: SCHEMA_DIR,
      execSql: async (_sql, label) => {
        if (label.startsWith('00_complete-schema.sql')) throw new Error('boom');
        applied.push(label);
      },
    });
    const result = await b.bootstrap();
    expect(applied).toEqual([]); // never reached rls/seed
    expect(result.applied).toEqual([]);
    expect(result.errors).toEqual([{ file: '00_complete-schema.sql', error: 'boom' }]);
  });

  it('continues when the optional vector extension cannot be created', async () => {
    const applied = [];
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: SCHEMA_DIR,
      execSql: async (sql, label) => {
        if (/create\s+extension/i.test(sql) && /vector/i.test(sql)) {
          throw new Error('extension "vector" is not available');
        }
        applied.push(label);
      },
    });
    const result = await b.bootstrap();
    expect(result.errors).toEqual([]);
    expect(result.applied).toHaveLength(3);
    expect(applied.some((label) => label.startsWith('00_complete-schema.sql#'))).toBe(true);
  });

  it('errors clearly when a SQL file is missing', async () => {
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: '/nonexistent/dir',
      execSql: async () => {},
    });
    const result = await b.bootstrap();
    expect(result.applied).toEqual([]);
    expect(result.errors[0].file).toBe('00_complete-schema.sql');
    expect(result.errors[0].error).toMatch(/not found/);
  });
});

/**
 * Bootstrap ends by applying every versioned migration and recording each one
 * in schema_versions. Two gaps it closes on a fresh install:
 *   - a migration whose change has not been folded into 00_complete-schema.sql
 *     yet (V2.11.7, the exam-checker session columns) used to reach only
 *     databases that later ran migrate.js;
 *   - nothing recorded the migrations, so the first migrate.js run re-applied
 *     every one of them as "pending".
 */
describe('DatabaseBootstrapper — migrations after the seed', () => {
  const fs = require('fs');
  const MIGRATIONS = fs.readdirSync(path.join(SCHEMA_DIR, 'migrations')).filter((f) => /^V\d+\.\d+\.\d+__.*\.sql$/.test(f));
  const version = (f) => f.match(/^V(\d+\.\d+\.\d+)__/)[1];

  function run(execSql) {
    const calls = [];
    const b = new DatabaseBootstrapper({
      supabaseUrl: 'x', supabaseKey: 'y', schemaDir: SCHEMA_DIR,
      execSql: async (sql, label) => { calls.push({ sql, label }); if (execSql) await execSql(sql, label); },
    });
    return b.bootstrap().then((result) => ({ result, calls }));
  }

  it('applies every migration after the seed, in version order (2.9.0 before 2.11.0)', async () => {
    const { result, calls } = await run();
    const order = result.migrations;
    expect(order).toHaveLength(MIGRATIONS.length);
    expect(order.indexOf('V2.9.0__lesson_quiz.sql')).toBeLessThan(order.indexOf('V2.11.0__portal_access.sql'));
    expect(order[order.length - 1]).toBe('V2.11.7__exam_session_columns.sql');

    const labels = calls.map((c) => c.label);
    const lastSeed = labels.map((l) => l.startsWith('02_seed-data.sql#')).lastIndexOf(true);
    const firstMigration = labels.findIndex((l) => l.startsWith('migrations/'));
    expect(firstMigration).toBeGreaterThan(lastSeed);
    expect(result.errors).toEqual([]);
    expect(result.applied).toEqual(['00_complete-schema.sql', '01_rls-policies.sql', '02_seed-data.sql']);
  });

  it('gives a fresh install the exam-checker session columns', async () => {
    const { calls } = await run();
    const migrationSql = calls.filter((c) => c.label.startsWith('migrations/V2.11.7__')).map((c) => c.sql).join('\n');
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS annotated_images JSONB/);
  });

  it('records each migration in schema_versions, so migrate.js finds nothing pending afterwards', async () => {
    const { calls } = await run();
    const esc = (s) => s.replace(/\./g, '\\.');
    for (const f of MIGRATIONS) {
      const record = calls.find((c) => c.label === `migrations/${f}#record`);
      expect(record).toBeDefined();
      expect(record.sql).toMatch(new RegExp(
        `INSERT INTO schema_versions \\(version, description\\)\\s*VALUES \\('${esc(version(f))}', '${esc(f)} \\(sha256 [0-9a-f]{64}\\)'\\)\\s*ON CONFLICT \\(version\\) DO NOTHING`
      ));
    }
  });

  it('runs no migration when the schema did not apply', async () => {
    const { result, calls } = await run(async (_sql, label) => {
      if (label.startsWith('01_rls-policies.sql')) throw new Error('rls boom');
    });
    expect(calls.some((c) => c.label.startsWith('migrations/'))).toBe(false);
    expect(result.migrations).toEqual([]);
    expect(result.errors).toEqual([{ file: '01_rls-policies.sql', error: 'rls boom' }]);
  });

  it('stops at a failing migration: it is not recorded and the later ones do not run', async () => {
    const { result, calls } = await run(async (_sql, label) => {
      if (label.startsWith('migrations/V2.6.0__')) throw new Error('migration boom');
    });
    const failed = 'V2.6.0__observe_coach_assistant.sql';
    expect(result.errors).toEqual([{ file: `migrations/${failed}`, error: 'migration boom' }]);
    expect(calls.some((c) => c.label === `migrations/${failed}#record`)).toBe(false);
    expect(calls.some((c) => c.label.startsWith('migrations/V2.7.0__'))).toBe(false);
    expect(result.migrations).not.toContain(failed);
  });
});
