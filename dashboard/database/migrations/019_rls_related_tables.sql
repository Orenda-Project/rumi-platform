-- Migration 019: Apply RLS to related tables (coaching_sessions, video_requests, lesson_plan_requests, reading_assessments)
-- Created: 2026-01-12

-- Enable RLS on all related tables
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE lesson_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plan_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE reading_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assessments FORCE ROW LEVEL SECURITY;

-- Grant SELECT to portal_app_user role
GRANT SELECT ON coaching_sessions TO portal_app_user;
GRANT SELECT ON video_requests TO portal_app_user;
GRANT SELECT ON lesson_plan_requests TO portal_app_user;
GRANT SELECT ON reading_assessments TO portal_app_user;

-- RLS Policy for coaching_sessions
CREATE POLICY portal_user_access ON coaching_sessions
FOR SELECT
TO portal_app_user
USING (
  NULLIF(current_setting('app.portal_user_id', true), '')::uuid IS NOT NULL
  AND (
    -- Super admins, admins, and viewers see all
    EXISTS (
      SELECT 1 FROM dashboard_users du
      WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
        AND du.role IN ('super_admin', 'admin', 'viewer')
    )
    OR
    -- Partners see based on their access scope
    EXISTS (
      SELECT 1
      FROM dashboard_users du
      JOIN access_scopes acs ON du.id = acs.dashboard_user_id
      JOIN users u ON coaching_sessions.user_id = u.id
      WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
        AND (
          -- Scope type: all
          acs.scope_type = 'all'
          OR
          -- Scope type: country (match phone prefix, exclude test users)
          (
            acs.scope_type = 'country'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
              WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          -- Scope type: school (match school_id)
          (
            acs.scope_type = 'school'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
              WHERE lower(u.school_name) = lower(school_name)
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          -- Scope type: phone_list (match phone number exactly)
          (
            acs.scope_type = 'phone_list'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
              WHERE u.phone_number = phone
            )
          )
          OR
          -- Scope type: combined (any of the above)
          (
            acs.scope_type = 'combined'
            AND (
              -- Match country codes
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
                WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              -- Match school IDs
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
                WHERE lower(u.school_name) = lower(school_name)
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              -- Match phone numbers
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
                WHERE u.phone_number = phone
              )
            )
          )
        )
    )
  )
);

-- RLS Policy for video_requests (same pattern)
CREATE POLICY portal_user_access ON video_requests
FOR SELECT
TO portal_app_user
USING (
  NULLIF(current_setting('app.portal_user_id', true), '')::uuid IS NOT NULL
  AND (
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
      JOIN users u ON video_requests.user_id = u.id
      WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
        AND (
          acs.scope_type = 'all'
          OR
          (
            acs.scope_type = 'country'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
              WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'school'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
              WHERE lower(u.school_name) = lower(school_name)
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'phone_list'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
              WHERE u.phone_number = phone
            )
          )
          OR
          (
            acs.scope_type = 'combined'
            AND (
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
                WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
                WHERE lower(u.school_name) = lower(school_name)
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
                WHERE u.phone_number = phone
              )
            )
          )
        )
    )
  )
);

-- RLS Policy for lesson_plan_requests (same pattern)
CREATE POLICY portal_user_access ON lesson_plan_requests
FOR SELECT
TO portal_app_user
USING (
  NULLIF(current_setting('app.portal_user_id', true), '')::uuid IS NOT NULL
  AND (
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
      JOIN users u ON lesson_plan_requests.user_id = u.id
      WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
        AND (
          acs.scope_type = 'all'
          OR
          (
            acs.scope_type = 'country'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
              WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'school'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
              WHERE lower(u.school_name) = lower(school_name)
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'phone_list'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
              WHERE u.phone_number = phone
            )
          )
          OR
          (
            acs.scope_type = 'combined'
            AND (
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
                WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
                WHERE lower(u.school_name) = lower(school_name)
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
                WHERE u.phone_number = phone
              )
            )
          )
        )
    )
  )
);

-- RLS Policy for reading_assessments (same pattern)
CREATE POLICY portal_user_access ON reading_assessments
FOR SELECT
TO portal_app_user
USING (
  NULLIF(current_setting('app.portal_user_id', true), '')::uuid IS NOT NULL
  AND (
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
      JOIN users u ON reading_assessments.user_id = u.id
      WHERE du.id = NULLIF(current_setting('app.portal_user_id', true), '')::uuid
        AND (
          acs.scope_type = 'all'
          OR
          (
            acs.scope_type = 'country'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
              WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'school'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
              WHERE lower(u.school_name) = lower(school_name)
            )
            AND (u.is_test_user = false OR u.is_test_user IS NULL)
          )
          OR
          (
            acs.scope_type = 'phone_list'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
              WHERE u.phone_number = phone
            )
          )
          OR
          (
            acs.scope_type = 'combined'
            AND (
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'country_codes') AS code
                WHERE u.phone_number LIKE REPLACE(code, '+', '') || '%'
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'school_names') AS school_name
                WHERE lower(u.school_name) = lower(school_name)
                  AND (u.is_test_user = false OR u.is_test_user IS NULL)
              )
              OR
              EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(acs.scope_value->'phone_numbers') AS phone
                WHERE u.phone_number = phone
              )
            )
          )
        )
    )
  )
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 019 complete: RLS enabled on coaching_sessions, video_requests, lesson_plan_requests, reading_assessments';
END $$;
