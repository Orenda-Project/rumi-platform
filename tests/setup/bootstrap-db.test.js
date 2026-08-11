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
