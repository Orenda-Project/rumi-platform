/**
 * The one-time SQL a brand-new Supabase project needs before bootstrap can
 * create tables. Must be pasted in the SQL editor as the postgres role.
 *
 * SECURITY DEFINER + OWNER postgres are not optional:
 *   - service_role cannot CREATE in public (42501) without SECURITY DEFINER
 *   - service_role cannot CREATE EXTENSION without OWNER postgres
 * search_path must include 'extensions' because uuid-ossp lives there.
 * GRANT + NOTIFY make PostgREST see the function after the schema cache clears.
 */

const EXEC_SQL_DEFINITION = [
  'create or replace function public.exec_sql(query text)',
  'returns void',
  'language plpgsql',
  'security definer',
  'set search_path = public, extensions',
  'as $$ begin execute query; end; $$;',
  '',
  'alter function public.exec_sql(text) owner to postgres;',
  'grant execute on function public.exec_sql(text) to service_role;',
  "notify pgrst, 'reload schema';",
];

const EXEC_SQL_SQL = EXEC_SQL_DEFINITION.join('\n');

function describeExecSqlFailure(status, errorText) {
  const body = String(errorText || '');
  const missing = status === 404 || /could not find the function|exec_sql/i.test(body);
  if (missing) {
    return (
      'the one-time `exec_sql` helper is missing in this database.\n'
      + 'Run this ONCE in the Supabase SQL Editor, then re-run `npm run bootstrap:db`:\n\n'
      + EXEC_SQL_SQL
    );
  }
  if (status === 403 || /42501|permission denied for schema public/i.test(body)) {
    return (
      'exec_sql ran, but as a role that cannot create tables in `public`.\n'
      + 'Replace the helper with this SECURITY DEFINER version in the SQL Editor, then re-run `npm run bootstrap:db`:\n\n'
      + EXEC_SQL_SQL
    );
  }
  return null;
}

module.exports = { EXEC_SQL_DEFINITION, EXEC_SQL_SQL, describeExecSqlFailure };
