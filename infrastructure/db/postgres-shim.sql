-- =============================================================================
-- What Rumi's schema needs from a plain Postgres (DB_DRIVER=bundled|postgres)
-- =============================================================================
-- infrastructure/supabase/ was written for Supabase. Applied to any other
-- Postgres it needs only:
--   * auth.role() and auth.uid() — the RLS policies in 01_rls-policies.sql
--     call auth.role(). The app connects as the tables' owner, so the
--     policies never block it; the functions only have to exist.
--   * a `vector` type for the one optional pgvector column, when pgvector
--     is not installed (the bundled Postgres does not ship it): a real[]
--     domain stands in, so the column exists but similarity search does not.
--
-- Everything is created only if missing, so this is safe to run more than
-- once and leaves a database that already has these (a Supabase project
-- reached through DATABASE_URL) untouched. Applied by infrastructure/db/schema.js
-- before 00/01/02. The PostgREST local stack uses ../local/supabase-shim.sql.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF to_regprocedure('auth.role()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $body$
        SELECT coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
        )::text
      $body$
    $fn$;
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $body$
        SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
      $body$
    $fn$;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'vector'
  ) THEN
    CREATE DOMAIN public.vector AS real[];
  END IF;
END
$$;
