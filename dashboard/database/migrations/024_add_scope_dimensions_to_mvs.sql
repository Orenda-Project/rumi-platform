-- Migration 024: Add scope dimensions to materialized views for partner filtering
--
-- Purpose: Enable fast partner-scoped queries without bypassing RLS
-- Strategy: Add country_code, school_name_lower, is_test_user as indexed columns
-- Performance target: 500ms (RLS) → 5-30ms (filtered MV)
--
-- @bead bd-045
-- @author Claude Code
-- @date January 24, 2026
--
-- NOTE: Run GRANT statements via Supabase Dashboard SQL Editor after this migration

-- ============================================
-- STEP 1: Recreate mv_users_activity with scope dimensions
-- ============================================

-- Drop existing view (already dropped, but safe to repeat)
DROP MATERIALIZED VIEW IF EXISTS mv_users_activity CASCADE;

CREATE MATERIALIZED VIEW mv_users_activity AS
SELECT
  u.id,
  u.phone_number,

  -- SCOPE DIMENSION COLUMNS (for partner filtering)
  LEFT(u.phone_number, 2) AS country_code,              -- '92', '94', '1', etc.
  LOWER(COALESCE(u.school_name, '')) AS school_name_lower, -- Lowercase for matching
  COALESCE(u.is_test_user, false) AS is_test_user,      -- Exclude from partner views

  -- USER FIELDS (no role column - doesn't exist in users table)
  u.name,
  u.first_name,
  u.last_name,
  u.preferred_language,
  u.registration_completed,
  u.registration_state,
  u.registration_started_at,
  u.registration_completed_at,
  u.registration_state_updated_at,
  u.created_at,

  -- COMPUTED ACTIVITY FIELDS
  MAX(c.created_at) AS last_activity,
  COUNT(c.id) AS total_messages,
  COUNT(c.id) FILTER (WHERE c.role = 'user') AS user_messages,
  COUNT(c.id) FILTER (WHERE c.message_type = 'voice') AS voice_messages,

  -- METADATA
  NOW() AS last_refreshed

FROM users u
LEFT JOIN conversations c ON c.user_id = u.id
GROUP BY u.id;

-- INDEXES for partner filtering
-- Primary key for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_users_activity_id
  ON mv_users_activity (id);

-- Country scope index (most common partner filter)
-- Partial index excluding test users for efficiency
CREATE INDEX idx_mv_users_activity_country
  ON mv_users_activity (country_code)
  WHERE is_test_user = false;

-- School scope index
CREATE INDEX idx_mv_users_activity_school
  ON mv_users_activity (school_name_lower)
  WHERE is_test_user = false AND school_name_lower != '';

-- Phone number index for phone_list scope
CREATE INDEX idx_mv_users_activity_phone
  ON mv_users_activity (phone_number);

-- Activity ordering index
CREATE INDEX idx_mv_users_activity_last_activity
  ON mv_users_activity (last_activity DESC NULLS LAST);

-- Created date index
CREATE INDEX idx_mv_users_activity_created
  ON mv_users_activity (created_at DESC);

-- ============================================
-- STEP 2: Recreate mv_dashboard_stats_by_country
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats_by_country CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_stats_by_country AS
WITH user_stats AS (
  SELECT
    LEFT(u.phone_number, 2) AS country_code,
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE registration_completed = true) AS registered_users,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS new_users_today,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_week
  FROM users u
  WHERE COALESCE(u.is_test_user, false) = false
  GROUP BY LEFT(u.phone_number, 2)
),
message_stats AS (
  SELECT
    LEFT(u.phone_number, 2) AS country_code,
    COUNT(c.id) AS total_messages,
    COUNT(c.id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '1 day') AS messages_today,
    COUNT(DISTINCT c.user_id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '1 day') AS dau,
    COUNT(DISTINCT c.user_id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days') AS wau
  FROM users u
  LEFT JOIN conversations c ON c.user_id = u.id
  WHERE COALESCE(u.is_test_user, false) = false
  GROUP BY LEFT(u.phone_number, 2)
),
feature_stats AS (
  SELECT
    LEFT(u.phone_number, 2) AS country_code,
    COUNT(DISTINCT lp.id) AS lesson_plans,
    COUNT(DISTINCT cs.id) AS coaching_sessions,
    COUNT(DISTINCT ra.id) AS reading_assessments,
    COUNT(DISTINCT vr.id) AS video_requests
  FROM users u
  LEFT JOIN lesson_plan_requests lp ON lp.user_id = u.id
  LEFT JOIN coaching_sessions cs ON cs.user_id = u.id
  LEFT JOIN reading_assessments ra ON ra.user_id = u.id
  LEFT JOIN video_requests vr ON vr.user_id = u.id
  WHERE COALESCE(u.is_test_user, false) = false
  GROUP BY LEFT(u.phone_number, 2)
)
SELECT
  us.country_code,
  us.total_users,
  us.registered_users,
  us.new_users_today,
  us.new_users_week,
  COALESCE(ms.total_messages, 0) AS total_messages,
  COALESCE(ms.messages_today, 0) AS messages_today,
  COALESCE(ms.dau, 0) AS daily_active_users,
  COALESCE(ms.wau, 0) AS weekly_active_users,
  COALESCE(fs.lesson_plans, 0) AS total_lesson_plans,
  COALESCE(fs.coaching_sessions, 0) AS total_coaching_sessions,
  COALESCE(fs.reading_assessments, 0) AS total_reading_assessments,
  COALESCE(fs.video_requests, 0) AS total_video_requests,
  NOW() AS last_refreshed
FROM user_stats us
LEFT JOIN message_stats ms ON ms.country_code = us.country_code
LEFT JOIN feature_stats fs ON fs.country_code = us.country_code;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_dashboard_stats_by_country_pk
  ON mv_dashboard_stats_by_country (country_code);

-- ============================================
-- STEP 3: Recreate mv_view_refresh_status
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS mv_view_refresh_status CASCADE;

CREATE MATERIALIZED VIEW mv_view_refresh_status AS
SELECT 'mv_dashboard_stats' AS view_name,
       (SELECT last_refreshed FROM mv_dashboard_stats LIMIT 1) AS last_refresh,
       (SELECT COUNT(*) FROM mv_dashboard_stats) AS row_count
UNION ALL
SELECT 'mv_users_activity' AS view_name,
       (SELECT last_refreshed FROM mv_users_activity LIMIT 1) AS last_refresh,
       (SELECT COUNT(*) FROM mv_users_activity) AS row_count
UNION ALL
SELECT 'mv_retention_cohorts' AS view_name,
       (SELECT last_refreshed FROM mv_retention_cohorts LIMIT 1) AS last_refresh,
       (SELECT COUNT(*) FROM mv_retention_cohorts) AS row_count
UNION ALL
SELECT 'mv_dashboard_stats_by_country' AS view_name,
       (SELECT last_refreshed FROM mv_dashboard_stats_by_country LIMIT 1) AS last_refresh,
       (SELECT COUNT(*) FROM mv_dashboard_stats_by_country) AS row_count;

CREATE UNIQUE INDEX idx_mv_view_refresh_status_pk
  ON mv_view_refresh_status (view_name);

-- ============================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================

-- Check new columns exist
SELECT
  id,
  phone_number,
  country_code,
  school_name_lower,
  is_test_user,
  total_messages,
  last_activity
FROM mv_users_activity
LIMIT 5;

-- Check country distribution
SELECT
  country_code,
  COUNT(*) as user_count
FROM mv_users_activity
WHERE is_test_user = false
GROUP BY country_code
ORDER BY user_count DESC
LIMIT 10;

-- Check country stats view
SELECT * FROM mv_dashboard_stats_by_country
ORDER BY total_users DESC;
