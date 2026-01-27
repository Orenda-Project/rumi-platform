-- Migration: Partner-Specific RBAC System
-- Purpose: Multi-tenant data isolation for partner organizations
-- Date: January 12, 2026
-- =============================================================================
-- This migration implements a hybrid RBAC + ABAC system for the observability
-- portal, allowing partners to access only their assigned users based on:
-- - Country codes (e.g., +94 Sri Lanka, +92 Pakistan)
-- - School names (exact match, case-insensitive)
-- - Phone number lists (custom selection)
-- - Combined scopes (country + schools)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE NEW TABLES
-- =============================================================================

-- Table: portal_organizations
-- Represents partner organizations (e.g., Sri Lanka Ministry, ABC School District)
CREATE TABLE IF NOT EXISTS portal_organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  default_scope_type VARCHAR(20) CHECK (default_scope_type IN ('all', 'country', 'school', 'phone_list', 'combined')),
  default_scope_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES dashboard_users(id),
  is_active BOOLEAN DEFAULT true
);

COMMENT ON TABLE portal_organizations IS 'Partner organizations for multi-tenant access control';
COMMENT ON COLUMN portal_organizations.default_scope_type IS 'Default scope for users in this organization';
COMMENT ON COLUMN portal_organizations.default_scope_value IS 'JSON containing default scope values';

-- Table: access_scopes
-- Defines what bot users a portal user can see
CREATE TABLE IF NOT EXISTS access_scopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dashboard_user_id UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,

  -- Scope type: 'all', 'country', 'school', 'phone_list', 'combined'
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('all', 'country', 'school', 'phone_list', 'combined')),

  -- Scope value (JSON for flexibility)
  -- Examples:
  --   all: NULL
  --   country: {"country_codes": ["+94", "+92"]}
  --   school: {"school_names": ["ABC School", "XYZ College"]}
  --   phone_list: {"phone_numbers": ["923001234567", "923007654321"]}
  --   combined: {"country_codes": ["+92"], "school_names": ["School A", "School B"]}
  scope_value JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES dashboard_users(id),

  -- Ensure one scope per user (for simplicity; can be extended later)
  CONSTRAINT unique_user_scope UNIQUE (dashboard_user_id)
);

COMMENT ON TABLE access_scopes IS 'Defines data visibility scopes for portal users';
COMMENT ON COLUMN access_scopes.scope_type IS 'Type of filter: all, country, school, phone_list, combined';
COMMENT ON COLUMN access_scopes.scope_value IS 'JSON containing filter values (e.g., country codes, school names)';

-- Table: feature_permissions
-- Controls which features each role can access
CREATE TABLE IF NOT EXISTS feature_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(20) NOT NULL,
  feature_key VARCHAR(50) NOT NULL,
  can_access BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_role_feature UNIQUE (role, feature_key)
);

COMMENT ON TABLE feature_permissions IS 'Feature-level access control matrix';
COMMENT ON COLUMN feature_permissions.role IS 'User role (super_admin, partner_admin, partner_viewer, etc.)';
COMMENT ON COLUMN feature_permissions.feature_key IS 'Feature identifier (dashboard, users, coaching, ama, broadcast, etc.)';

-- =============================================================================
-- 2. CREATE INDEXES
-- =============================================================================

-- Indexes for portal_organizations
CREATE INDEX IF NOT EXISTS idx_portal_orgs_name ON portal_organizations(name);
CREATE INDEX IF NOT EXISTS idx_portal_orgs_active ON portal_organizations(is_active);

-- Indexes for access_scopes
CREATE INDEX IF NOT EXISTS idx_access_scopes_user ON access_scopes(dashboard_user_id);
CREATE INDEX IF NOT EXISTS idx_access_scopes_type ON access_scopes(scope_type);
CREATE INDEX IF NOT EXISTS idx_access_scopes_value ON access_scopes USING GIN(scope_value);

-- Indexes for feature_permissions
CREATE INDEX IF NOT EXISTS idx_feature_permissions_role ON feature_permissions(role);
CREATE INDEX IF NOT EXISTS idx_feature_permissions_feature ON feature_permissions(feature_key);

-- Indexes for RLS performance optimization on users table
CREATE INDEX IF NOT EXISTS idx_users_phone_number_prefix ON users(LEFT(phone_number, 4));
CREATE INDEX IF NOT EXISTS idx_users_school_name_lower ON users(LOWER(school_name));
CREATE INDEX IF NOT EXISTS idx_users_is_test_user ON users(is_test_user) WHERE is_test_user = true;

-- =============================================================================
-- 3. MODIFY EXISTING TABLES
-- =============================================================================

-- Update dashboard_users table to support new roles and organization reference
ALTER TABLE dashboard_users DROP CONSTRAINT IF EXISTS dashboard_users_role_check;
ALTER TABLE dashboard_users
  ADD CONSTRAINT dashboard_users_role_check
  CHECK (role IN ('super_admin', 'partner_admin', 'partner_viewer', 'viewer', 'admin'));

ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES portal_organizations(id),
  ADD COLUMN IF NOT EXISTS invited_for_organization VARCHAR(255),
  ADD COLUMN IF NOT EXISTS access_scope_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_dashboard_users_org ON dashboard_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_role ON dashboard_users(role);

COMMENT ON COLUMN dashboard_users.role IS 'User role: super_admin, partner_admin, partner_viewer, viewer (legacy), admin (legacy)';
COMMENT ON COLUMN dashboard_users.organization_id IS 'Partner organization this user belongs to';
COMMENT ON COLUMN dashboard_users.access_scope_summary IS 'Human-readable description of access scope for display';

-- Enhance dashboard_audit_log for better tracking
ALTER TABLE dashboard_audit_log
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES portal_organizations(id),
  ADD COLUMN IF NOT EXISTS affected_user_id UUID,
  ADD COLUMN IF NOT EXISTS query_filters JSONB,
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON dashboard_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON dashboard_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_affected_user ON dashboard_audit_log(affected_user_id);

COMMENT ON COLUMN dashboard_audit_log.affected_user_id IS 'Which bot user (from users table) was viewed/modified';
COMMENT ON COLUMN dashboard_audit_log.query_filters IS 'Applied filters for data access logging';

-- =============================================================================
-- 4. CREATE HELPER FUNCTIONS FOR RLS
-- =============================================================================

-- Function to set portal user context for RLS policies
CREATE OR REPLACE FUNCTION set_portal_user_context(p_portal_user_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.portal_user_id', p_portal_user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_portal_user_context IS 'Sets session variable for RLS policies to identify portal user';

GRANT EXECUTE ON FUNCTION set_portal_user_context TO service_role;

-- =============================================================================
-- 5. ENABLE ROW-LEVEL SECURITY ON TABLES
-- =============================================================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on related tables (coaching, videos, etc.)
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assessments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 6. CREATE RLS POLICIES
-- =============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS portal_user_access ON users;
DROP POLICY IF EXISTS portal_coaching_access ON coaching_sessions;
DROP POLICY IF EXISTS portal_video_access ON video_requests;
DROP POLICY IF EXISTS portal_lesson_plan_access ON lesson_plan_requests;
DROP POLICY IF EXISTS portal_reading_access ON reading_assessments;

-- RLS Policy for users table
CREATE POLICY portal_user_access ON users
FOR SELECT
TO service_role
USING (
  -- Super admin or legacy admin/viewer: see all
  EXISTS (
    SELECT 1 FROM dashboard_users du
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND du.role IN ('super_admin', 'admin', 'viewer')
  )
  OR
  -- Partner users: check their scope
  EXISTS (
    SELECT 1
    FROM dashboard_users du
    JOIN access_scopes acs ON du.id = acs.dashboard_user_id
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND (
        -- Scope: All (for special cases)
        acs.scope_type = 'all'
        OR
        -- Scope: Country (phone number prefix match)
        (
          acs.scope_type = 'country'
          AND users.phone_number SIMILAR TO '(' ||
              (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code)
          || ')%'
          AND (users.is_test_user = false OR users.is_test_user IS NULL)
        )
        OR
        -- Scope: School (exact match, case-insensitive)
        (
          acs.scope_type = 'school'
          AND LOWER(users.school_name) = ANY(
            SELECT LOWER(school::text)
            FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school
          )
          AND (users.is_test_user = false OR users.is_test_user IS NULL)
        )
        OR
        -- Scope: Phone list (exact match)
        (
          acs.scope_type = 'phone_list'
          AND users.phone_number = ANY(
            SELECT phone::text
            FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
          )
          AND (users.is_test_user = false OR users.is_test_user IS NULL)
        )
        OR
        -- Scope: Combined (country + school) - MUST match BOTH
        (
          acs.scope_type = 'combined'
          AND (
            -- Must match country code
            users.phone_number SIMILAR TO '(' ||
              (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code)
            || ')%'
          )
          AND (
            -- AND must match one of the schools
            LOWER(users.school_name) = ANY(
              SELECT LOWER(school::text)
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school
            )
          )
          AND (users.is_test_user = false OR users.is_test_user IS NULL)
        )
      )
  )
);

COMMENT ON POLICY portal_user_access ON users IS 'RLS policy to filter users based on portal user access scope';

-- RLS Policy for coaching_sessions (inherits from users scope)
CREATE POLICY portal_coaching_access ON coaching_sessions
FOR SELECT
TO service_role
USING (
  -- Super admin or legacy admin/viewer: see all
  EXISTS (
    SELECT 1 FROM dashboard_users du
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND du.role IN ('super_admin', 'admin', 'viewer')
  )
  OR
  -- Partner users: can only see coaching sessions for users in their scope
  EXISTS (
    SELECT 1
    FROM dashboard_users du
    JOIN access_scopes acs ON du.id = acs.dashboard_user_id
    JOIN users u ON u.id = coaching_sessions.user_id
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND (
        acs.scope_type = 'all'
        OR
        (
          acs.scope_type = 'country'
          AND u.phone_number SIMILAR TO '(' ||
              (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code)
          || ')%'
          AND (u.is_test_user = false OR u.is_test_user IS NULL)
        )
        OR
        (
          acs.scope_type = 'school'
          AND LOWER(u.school_name) = ANY(
            SELECT LOWER(school::text)
            FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school
          )
          AND (u.is_test_user = false OR u.is_test_user IS NULL)
        )
        OR
        (
          acs.scope_type = 'phone_list'
          AND u.phone_number = ANY(
            SELECT phone::text
            FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
          )
          AND (u.is_test_user = false OR u.is_test_user IS NULL)
        )
        OR
        (
          acs.scope_type = 'combined'
          AND (
            u.phone_number SIMILAR TO '(' ||
              (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code)
            || ')%'
          )
          AND (
            LOWER(u.school_name) = ANY(
              SELECT LOWER(school::text)
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school
            )
          )
          AND (u.is_test_user = false OR u.is_test_user IS NULL)
        )
      )
  )
);

-- RLS Policy for video_requests
CREATE POLICY portal_video_access ON video_requests
FOR SELECT
TO service_role
USING (
  EXISTS (
    SELECT 1 FROM dashboard_users du
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND du.role IN ('super_admin', 'admin', 'viewer')
  )
  OR
  EXISTS (
    SELECT 1
    FROM dashboard_users du
    JOIN access_scopes acs ON du.id = acs.dashboard_user_id
    JOIN users u ON u.id = video_requests.user_id
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND (
        acs.scope_type = 'all'
        OR
        (acs.scope_type = 'country' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'school' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'phone_list' AND u.phone_number = ANY(SELECT phone::text FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'combined' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
      )
  )
);

-- RLS Policy for lesson_plan_requests
CREATE POLICY portal_lesson_plan_access ON lesson_plan_requests
FOR SELECT
TO service_role
USING (
  EXISTS (
    SELECT 1 FROM dashboard_users du
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND du.role IN ('super_admin', 'admin', 'viewer')
  )
  OR
  EXISTS (
    SELECT 1
    FROM dashboard_users du
    JOIN access_scopes acs ON du.id = acs.dashboard_user_id
    JOIN users u ON u.id = lesson_plan_requests.user_id
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND (
        acs.scope_type = 'all'
        OR
        (acs.scope_type = 'country' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'school' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'phone_list' AND u.phone_number = ANY(SELECT phone::text FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'combined' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
      )
  )
);

-- RLS Policy for reading_assessments
CREATE POLICY portal_reading_access ON reading_assessments
FOR SELECT
TO service_role
USING (
  EXISTS (
    SELECT 1 FROM dashboard_users du
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND du.role IN ('super_admin', 'admin', 'viewer')
  )
  OR
  EXISTS (
    SELECT 1
    FROM dashboard_users du
    JOIN access_scopes acs ON du.id = acs.dashboard_user_id
    JOIN users u ON u.id = reading_assessments.user_id
    WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
      AND (
        acs.scope_type = 'all'
        OR
        (acs.scope_type = 'country' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'school' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'phone_list' AND u.phone_number = ANY(SELECT phone::text FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone) AND (u.is_test_user = false OR u.is_test_user IS NULL))
        OR
        (acs.scope_type = 'combined' AND u.phone_number SIMILAR TO '(' || (SELECT string_agg(code, '|') FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code) || ')%' AND LOWER(u.school_name) = ANY(SELECT LOWER(school::text) FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school) AND (u.is_test_user = false OR u.is_test_user IS NULL))
      )
  )
);

-- =============================================================================
-- 7. SEED DATA - Feature Permissions Matrix
-- =============================================================================

-- Insert feature permissions (based on final decisions from planning doc)
INSERT INTO feature_permissions (role, feature_key, can_access) VALUES
-- Super admin: Everything
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

-- Partner admin: Core features + The Forge
('partner_admin', 'dashboard', true),
('partner_admin', 'users', true),
('partner_admin', 'coaching', true),
('partner_admin', 'videos', true),
('partner_admin', 'retention', true),
('partner_admin', 'funnel', true),
('partner_admin', 'forge', true),
('partner_admin', 'release_notes', true),
-- DENIED features:
('partner_admin', 'ama', false),
('partner_admin', 'broadcast', false),
('partner_admin', 'api_health', false),
('partner_admin', 'ab_testing', false),
('partner_admin', 'schema', false),
('partner_admin', 'settings', false),
('partner_admin', 'wordcloud', false),
('partner_admin', 'sessions', false),

-- Partner viewer: Same as partner_admin (read-only enforced via role checks)
('partner_viewer', 'dashboard', true),
('partner_viewer', 'users', true),
('partner_viewer', 'coaching', true),
('partner_viewer', 'videos', true),
('partner_viewer', 'retention', true),
('partner_viewer', 'funnel', true),
('partner_viewer', 'forge', true),
('partner_viewer', 'release_notes', true),
-- DENIED features:
('partner_viewer', 'ama', false),
('partner_viewer', 'broadcast', false),
('partner_viewer', 'api_health', false),
('partner_viewer', 'ab_testing', false),
('partner_viewer', 'schema', false),
('partner_viewer', 'settings', false),
('partner_viewer', 'wordcloud', false),
('partner_viewer', 'sessions', false),

-- Legacy roles (backward compatibility)
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
('viewer', 'sessions', true)
ON CONFLICT (role, feature_key) DO NOTHING;

-- =============================================================================
-- 8. MIGRATE EXISTING DATA
-- =============================================================================

-- Create default organization for existing users
INSERT INTO portal_organizations (name, description, default_scope_type, default_scope_value, is_active)
VALUES (
  'Rumi Global',
  'Default organization for existing portal users (full access)',
  'all',
  NULL,
  true
)
ON CONFLICT (name) DO NOTHING;

-- Get the ID of the global org for next steps
DO $$
DECLARE
  global_org_id UUID;
BEGIN
  SELECT id INTO global_org_id FROM portal_organizations WHERE name = 'Rumi Global';

  -- Convert 'admin' role to 'super_admin'
  UPDATE dashboard_users
  SET role = 'super_admin',
      organization_id = global_org_id,
      access_scope_summary = 'All users (global access)'
  WHERE role = 'admin';

  -- Assign 'viewer' users to global org
  UPDATE dashboard_users
  SET organization_id = global_org_id,
      access_scope_summary = 'All users (global access)'
  WHERE role = 'viewer';

  -- Create 'all' access scopes for existing users
  INSERT INTO access_scopes (dashboard_user_id, scope_type, scope_value, created_at)
  SELECT id, 'all', NULL, NOW()
  FROM dashboard_users
  WHERE role IN ('super_admin', 'viewer')
  ON CONFLICT (dashboard_user_id) DO NOTHING;
END $$;

-- =============================================================================
-- 9. GRANT PERMISSIONS
-- =============================================================================

GRANT ALL ON portal_organizations TO service_role;
GRANT ALL ON access_scopes TO service_role;
GRANT ALL ON feature_permissions TO service_role;

COMMIT;

-- =============================================================================
-- 10. VERIFICATION QUERIES (Run after migration)
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('portal_organizations', 'access_scopes', 'feature_permissions');
--
-- SELECT role, COUNT(*) FROM dashboard_users GROUP BY role;
-- SELECT scope_type, COUNT(*) FROM access_scopes GROUP BY scope_type;
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('users', 'coaching_sessions', 'video_requests')
--   AND schemaname = 'public';
