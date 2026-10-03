-- =============================================================================
-- V2.11.0 - Admin dashboard access: the portal_app_user role and feature
-- permissions
-- The admin dashboard switches to portal_app_user for every signed-in request
-- and checks feature_permissions before every guarded page. No released SQL
-- created the role or seeded a single permission row, so on a database built
-- from these files admin sign-in worked and then every page failed (a database
-- error, or 403).
--
-- ADDITIVE ONLY. Creates the role if it is missing (roles are cluster-wide),
-- lets the role running this switch to it, grants it DML on the tables and use
-- of the sequences, adds one portal_app_user_access policy to each RLS table,
-- and inserts the permission rows that are missing; rows already there are
-- left as they are. Not BYPASSRLS, and the only function right beyond PUBLIC's
-- is portal_user_is_unscoped(): the one-time SQL helper stays service_role
-- only.
--
-- WHO SEES ROWS. The policy lets rows through only while the dashboard user set
-- on the connection is active and has an unscoped role: super_admin, admin or
-- viewer. Partner roles (partner_admin, partner_viewer) get no rows from any
-- RLS table, teacher data included, until policies that apply a partner's
-- access_scopes row exist; "signed in" alone would hand a school-scoped partner
-- every teacher and conversation. An earlier build of this file created that
-- open policy under the same name; running this one replaces it. If the dashboard connects as a
-- different role from the one running this, grant portal_app_user to that
-- role too.
-- Fresh installs get the same from 00_complete-schema.sql, 01_rls-policies.sql
-- and 02_seed-data.sql.
--
-- ALL OR NOTHING. The whole change is one DO block, so it is one statement: if
-- any part fails, nothing is left applied, whether this file is run by psql,
-- the SQL editor or infrastructure/scripts/migrate.js. (A BEGIN/COMMIT pair
-- would not do: migrate.js runs the file inside a database function, where
-- transaction commands are refused.) Safe to run again.
-- =============================================================================

DO $$
DECLARE
  t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_user') THEN
    CREATE ROLE portal_app_user NOLOGIN;
  END IF;

  -- SET ROLE needs membership unless the session user is a superuser (a hosted
  -- database's owner role usually is not).
  GRANT portal_app_user TO CURRENT_USER;

  GRANT USAGE ON SCHEMA public TO portal_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO portal_app_user;

  -- The one check every portal_app_user policy makes (same as
  -- 00_complete-schema.sql). SECURITY DEFINER because it reads dashboard_users,
  -- which has RLS and this same policy; it runs as the schema's owner with a
  -- fixed search_path. No arguments: it answers only about the dashboard user
  -- set on this connection. Compared as text, so a malformed setting answers
  -- false rather than raising an error.
  CREATE OR REPLACE FUNCTION public.portal_user_is_unscoped()
   RETURNS boolean
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = pg_catalog, public
  AS $function$
    SELECT EXISTS (
      SELECT 1
      FROM public.dashboard_users du
      WHERE du.id::text = NULLIF(current_setting('app.portal_user_id', true), '')
        AND du.is_active IS TRUE
        AND du.role IN ('super_admin', 'admin', 'viewer')
    )
  $function$;

  -- Only the dashboard's role may call it. Supabase grants new functions to its
  -- API roles by default, so those are revoked by name where they exist.
  REVOKE ALL ON FUNCTION public.portal_user_is_unscoped() FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.portal_user_is_unscoped() FROM anon, authenticated;
  END IF;
  GRANT EXECUTE ON FUNCTION public.portal_user_is_unscoped() TO portal_app_user;

  -- Every RLS table has only its service_role policy, so the role would read
  -- zero rows. Same loop as 01_rls-policies.sql: rows only for the unscoped
  -- roles, the check run once per query rather than once per row. Dropping by
  -- name replaces the open policy an earlier build of this file created.
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS portal_app_user_access ON public.%I', t.relname);
    EXECUTE format($p$CREATE POLICY portal_app_user_access ON public.%I FOR ALL TO portal_app_user
      USING ((SELECT public.portal_user_is_unscoped()))
      WITH CHECK ((SELECT public.portal_user_is_unscoped()))$p$, t.relname);
  END LOOP;

  -- The same rows as 02_seed-data.sql: each feature, for each role the
  -- dashboard signs in. can_access=false rows are explicit denials. The
  -- partner rows open pages, not data: until scoped policies exist those pages
  -- show only what the scoped materialized views give them.
  INSERT INTO feature_permissions (role, feature_key, can_access)
  VALUES
    -- super_admin: every feature.
    ('super_admin', 'dashboard', true),
    ('super_admin', 'users', true),
    ('super_admin', 'coaching', true),
    ('super_admin', 'videos', true),
    ('super_admin', 'retention', true),
    ('super_admin', 'funnel', true),
    ('super_admin', 'ama', true),
    ('super_admin', 'forge', true),
    ('super_admin', 'release_notes', true),
    ('super_admin', 'broadcast', true),
    ('super_admin', 'api_health', true),
    ('super_admin', 'ab_testing', true),
    ('super_admin', 'schema', true),
    ('super_admin', 'settings', true),
    ('super_admin', 'wordcloud', true),
    ('super_admin', 'sessions', true),
    ('super_admin', 'user_management', true),
    ('super_admin', 'invites', true),
    -- admin (legacy full-access role): every feature but invites.
    ('admin', 'dashboard', true),
    ('admin', 'users', true),
    ('admin', 'coaching', true),
    ('admin', 'videos', true),
    ('admin', 'retention', true),
    ('admin', 'funnel', true),
    ('admin', 'ama', true),
    ('admin', 'forge', true),
    ('admin', 'release_notes', true),
    ('admin', 'broadcast', true),
    ('admin', 'api_health', true),
    ('admin', 'ab_testing', true),
    ('admin', 'schema', true),
    ('admin', 'settings', true),
    ('admin', 'wordcloud', true),
    ('admin', 'sessions', true),
    ('admin', 'user_management', true),
    ('admin', 'invites', false),
    -- viewer (legacy internal role): read-only use of most features; no broadcast, settings or invites.
    ('viewer', 'dashboard', true),
    ('viewer', 'users', true),
    ('viewer', 'coaching', true),
    ('viewer', 'videos', true),
    ('viewer', 'retention', true),
    ('viewer', 'funnel', true),
    ('viewer', 'ama', true),
    ('viewer', 'forge', true),
    ('viewer', 'release_notes', true),
    ('viewer', 'broadcast', false),
    ('viewer', 'api_health', true),
    ('viewer', 'ab_testing', true),
    ('viewer', 'schema', true),
    ('viewer', 'settings', false),
    ('viewer', 'wordcloud', true),
    ('viewer', 'sessions', true),
    ('viewer', 'user_management', true),
    ('viewer', 'invites', false),
    -- partner_admin: the core reporting pages for the users in their scope.
    ('partner_admin', 'dashboard', true),
    ('partner_admin', 'users', true),
    ('partner_admin', 'coaching', true),
    ('partner_admin', 'videos', true),
    ('partner_admin', 'retention', true),
    ('partner_admin', 'funnel', true),
    ('partner_admin', 'ama', false),
    ('partner_admin', 'forge', true),
    ('partner_admin', 'release_notes', true),
    ('partner_admin', 'broadcast', false),
    ('partner_admin', 'api_health', false),
    ('partner_admin', 'ab_testing', false),
    ('partner_admin', 'schema', false),
    ('partner_admin', 'settings', false),
    ('partner_admin', 'wordcloud', false),
    ('partner_admin', 'sessions', false),
    ('partner_admin', 'user_management', false),
    ('partner_admin', 'invites', false),
    -- partner_viewer: the same pages as partner_admin (writes are refused by role checks).
    ('partner_viewer', 'dashboard', true),
    ('partner_viewer', 'users', true),
    ('partner_viewer', 'coaching', true),
    ('partner_viewer', 'videos', true),
    ('partner_viewer', 'retention', true),
    ('partner_viewer', 'funnel', true),
    ('partner_viewer', 'ama', false),
    ('partner_viewer', 'forge', true),
    ('partner_viewer', 'release_notes', true),
    ('partner_viewer', 'broadcast', false),
    ('partner_viewer', 'api_health', false),
    ('partner_viewer', 'ab_testing', false),
    ('partner_viewer', 'schema', false),
    ('partner_viewer', 'settings', false),
    ('partner_viewer', 'wordcloud', false),
    ('partner_viewer', 'sessions', false),
    ('partner_viewer', 'user_management', false),
    ('partner_viewer', 'invites', false)
  ON CONFLICT DO NOTHING;

  -- Recorded inside the block, so the version is never marked applied unless
  -- everything above was.
  INSERT INTO schema_versions (version, description)
  VALUES ('2.11.0', 'Admin dashboard access: portal_app_user role, grants and unscoped-role policies; feature_permissions rows')
  ON CONFLICT (version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
