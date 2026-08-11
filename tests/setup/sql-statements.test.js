/**
 * SQL statement splitter — exec_sql can only run one command per RPC.
 */

const fs = require('fs');
const path = require('path');
const { splitSqlStatements, isOptionalStatement } = require('../../infrastructure/scripts/sql-statements');
const { describeExecSqlFailure, EXEC_SQL_SQL } = require('../../infrastructure/scripts/exec-sql-helper');

const SCHEMA = path.resolve(__dirname, '../../infrastructure/supabase/00_complete-schema.sql');

describe('splitSqlStatements', () => {
  it('keeps dollar-quoted function bodies as one statement', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.foo()
      RETURNS void
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM 1;
      END;
      $function$;
      NOTIFY pgrst, 'reload schema';
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/create or replace function public\.foo/i);
    expect(statements[0]).toMatch(/\$function\$/);
    expect(statements[1]).toMatch(/notify pgrst/i);
  });

  it('does not split on semicolons inside strings', () => {
    const statements = splitSqlStatements("INSERT INTO t (note) VALUES ('a; b'); SELECT 1;");
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'a; b'");
  });

  it('splits the real schema into many statements including users', () => {
    const sql = fs.readFileSync(SCHEMA, 'utf-8');
    const statements = splitSqlStatements(sql);
    expect(statements.length).toBeGreaterThan(50);
    expect(statements.some((s) => /create table if not exists users\b/i.test(s))).toBe(true);
    expect(statements.some((s) => /create or replace function/i.test(s) && /\$function\$/i.test(s))).toBe(true);
    expect(statements[statements.length - 1]).toMatch(/notify pgrst/i);
  });
});

describe('describeExecSqlFailure', () => {
  it('tells the user to paste SECURITY DEFINER when public CREATE is denied', () => {
    const hint = describeExecSqlFailure(403, '{"code":"42501","message":"permission denied for schema public"}');
    expect(hint).toMatch(/SECURITY DEFINER/i);
    expect(hint).toContain(EXEC_SQL_SQL);
  });

  it('tells the user to create the helper when PostgREST has never seen it', () => {
    const hint = describeExecSqlFailure(404, 'Could not find the function public.exec_sql');
    expect(hint).toMatch(/helper is missing/i);
    expect(hint).toContain(EXEC_SQL_SQL);
  });
});

describe('isOptionalStatement', () => {
  it('marks only the vector extension as optional', () => {
    expect(isOptionalStatement('CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA public')).toBe(true);
    expect(isOptionalStatement('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public')).toBe(false);
    expect(isOptionalStatement('CREATE TABLE IF NOT EXISTS users (id uuid)')).toBe(false);
  });
});
