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
-- of the sequences, adds one portal_app_user_access policy to each RLS table
-- (rows visible only once a signed-in admin is set on the connection), and
-- inserts the permission rows that are missing; rows already there are left as
-- they are. Not BYPASSRLS and no function rights beyond PUBLIC's: exec_sql
-- stays service_role only. If the dashboard connects as a different role from
-- the one running this, grant portal_app_user to that role too.
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

  -- Every RLS table has only its service_role policy, so the role would read
  -- zero rows. Same loop as 01_rls-policies.sql.
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS portal_app_user_access ON public.%I', t.relname);
    EXECUTE format($p$CREATE POLICY portal_app_user_access ON public.%I FOR ALL TO portal_app_user
      USING (NULLIF(current_setting('app.portal_user_id', true), '') IS NOT NULL)
      WITH CHECK (NULLIF(current_setting('app.portal_user_id', true), '') IS NOT NULL)$p$, t.relname);
  END LOOP;

  -- The same rows as 02_seed-data.sql: each feature, for each role the
  -- dashboard signs in. can_access=false rows are explicit denials.
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
  VALUES ('2.11.0', 'Admin dashboard access: portal_app_user role, grants and policies; feature_permissions rows')
  ON CONFLICT (version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
