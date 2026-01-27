-- Migration 022: Create Dashboard Materialized Views for Performance Optimization
--
-- PURPOSE: Reduce dashboard load time from 500-800ms to <50ms
-- STRATEGY: Pre-compute expensive aggregations, refresh every 5 minutes
--
-- BEFORE: 17 parallel queries, 317ms retention calculation, 99ms user activity
-- AFTER: Single view reads, ~10ms per view
--
-- References:
-- - https://sngeth.com/rails/performance/postgresql/2025/10/03/materialized-views-performance-case-study/
-- - https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html
--
-- Author: Claude Code
-- Date: January 23, 2026
-- Bead: bd-044

-- ============================================================================
-- VIEW 1: mv_dashboard_stats
-- Consolidates 17 dashboard queries into one pre-computed row
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
WITH date_ranges AS (
  SELECT
    NOW() AS now,
    NOW() - INTERVAL '1 day' AS one_day_ago,
    NOW() - INTERVAL '7 days' AS seven_days_ago,
    DATE_TRUNC('day', NOW()) AS today_start
),
user_stats AS (
  SELECT
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE registration_completed_at IS NOT NULL) AS registered_users
  FROM users
),
message_stats AS (
  SELECT
    COUNT(*) AS total_messages,
    COUNT(*) FILTER (WHERE role = 'user' AND message_type = 'voice') AS voice_received,
    COUNT(*) FILTER (WHERE role = 'assistant' AND message_type = 'voice') AS voice_sent
  FROM conversations
),
active_users AS (
  SELECT
    d.one_day_ago,
    d.seven_days_ago,
    (SELECT COUNT(DISTINCT user_id) FROM conversations WHERE role = 'user' AND created_at >= d.one_day_ago) AS dau,
    (SELECT COUNT(DISTINCT user_id) FROM conversations WHERE role = 'user' AND created_at >= d.seven_days_ago) AS wau
  FROM date_ranges d
),
session_stats AS (
  SELECT
    d.today_start,
    d.seven_days_ago,
    COUNT(*) AS total_sessions,
    COUNT(*) FILTER (WHERE started_at >= d.today_start) AS sessions_today,
    COUNT(*) FILTER (WHERE started_at >= d.seven_days_ago) AS sessions_this_week,
    ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::numeric, 1) AS avg_session_length,
    ROUND(AVG(COALESCE(message_count, 0))::numeric, 1) AS avg_messages_per_session
  FROM chat_sessions, date_ranges d
  WHERE ended_at IS NOT NULL
  GROUP BY d.today_start, d.seven_days_ago
),
feature_stats AS (
  SELECT
    (SELECT COUNT(*) FROM lesson_plans) AS total_lesson_plans,
    (SELECT COUNT(*) FROM lesson_plans WHERE gamma_url IS NOT NULL) AS total_presentations,
    (SELECT COUNT(*) FROM coaching_sessions WHERE status = 'completed') AS total_coaching_sessions,
    (SELECT COUNT(*) FROM video_requests WHERE status = 'completed') AS total_videos_generated,
    (SELECT COUNT(*) FROM reading_assessments WHERE status = 'completed') AS total_reading_assessments
),
funnel_stats AS (
  SELECT
    -- Registration rate: registered / total users * 100
    CASE WHEN u.total_users > 0
      THEN ROUND(100.0 * u.registered_users / u.total_users, 1)
      ELSE 0
    END AS registration_rate,
    -- Feature discovery: users who used any feature / total users * 100
    CASE WHEN u.total_users > 0
      THEN ROUND(100.0 * (
        SELECT COUNT(DISTINCT user_id) FROM (
          SELECT user_id FROM lesson_plans
          UNION SELECT user_id FROM coaching_sessions
          UNION SELECT user_id FROM reading_assessments
        ) feature_users
      ) / u.total_users, 1)
      ELSE 0
    END AS feature_discovery_rate
  FROM user_stats u
)
SELECT
  u.total_users,
  m.total_messages,
  m.voice_received AS voice_notes_received,
  a.dau AS daily_active_users,
  a.wau AS weekly_active_users,
  COALESCE(s.total_sessions, 0) AS total_sessions,
  COALESCE(s.sessions_today, 0) AS sessions_today,
  COALESCE(s.sessions_this_week, 0) AS sessions_this_week,
  COALESCE(s.avg_session_length, 0) AS avg_session_length,
  COALESCE(s.avg_messages_per_session, 0) AS avg_messages_per_session,
  f.total_lesson_plans,
  f.total_presentations,
  f.total_coaching_sessions,
  f.total_videos_generated,
  f.total_reading_assessments,
  fn.registration_rate,
  fn.feature_discovery_rate,
  NOW() AS last_refreshed
FROM user_stats u
CROSS JOIN message_stats m
CROSS JOIN active_users a
LEFT JOIN session_stats s ON true
CROSS JOIN feature_stats f
CROSS JOIN funnel_stats fn;

-- Unique index required for CONCURRENTLY refresh (single row, use constant)
CREATE UNIQUE INDEX idx_mv_dashboard_stats_unique ON mv_dashboard_stats ((1));

-- ============================================================================
-- VIEW 2: mv_users_activity
-- Pre-computes last_activity for each user (replaces 99ms LEFT JOIN query)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_users_activity CASCADE;

CREATE MATERIALIZED VIEW mv_users_activity AS
SELECT
  u.id,
  u.phone_number,
  u.name,
  u.first_name,
  u.last_name,
  u.registration_completed,
  u.registration_state,
  u.registration_started_at,
  u.registration_completed_at,
  u.registration_state_updated_at,
  u.created_at,
  MAX(c.created_at) AS last_activity,
  COUNT(c.id) AS total_messages,
  NOW() AS last_refreshed
FROM users u
LEFT JOIN conversations c ON c.user_id = u.id
GROUP BY u.id
ORDER BY last_activity DESC NULLS LAST, u.created_at DESC;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_users_activity_unique ON mv_users_activity (id);

-- Performance indexes
CREATE INDEX idx_mv_users_activity_last_activity ON mv_users_activity (last_activity DESC NULLS LAST);

-- ============================================================================
-- VIEW 3: mv_retention_cohorts
-- Pre-computes retention cohorts (replaces 317ms calculate_retention function)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_retention_cohorts CASCADE;

CREATE MATERIALIZED VIEW mv_retention_cohorts AS
WITH cohorts AS (
  -- Define weekly cohorts using created_at (ALL users from last 12 weeks)
  SELECT
    u.id AS user_id,
    DATE_TRUNC('week', u.created_at)::DATE AS cohort_week,
    u.created_at AS user_start_date
  FROM users u
  WHERE u.created_at IS NOT NULL
    AND u.created_at >= NOW() - INTERVAL '12 weeks'
),
-- OPTIMIZATION: Only get activity within retention window (not ALL conversations)
activity_timeline AS (
  SELECT
    user_id,
    created_at AS activity_date,
    'coaching' AS activity_type,
    'overall' AS feature_type
  FROM coaching_sessions
  WHERE status = 'completed'
    AND created_at >= NOW() - INTERVAL '16 weeks' -- 12 weeks cohorts + 4 weeks buffer

  UNION ALL

  SELECT
    user_id,
    created_at AS activity_date,
    'lesson_plan' AS activity_type,
    'overall' AS feature_type
  FROM lesson_plans
  WHERE created_at >= NOW() - INTERVAL '16 weeks'

  UNION ALL

  SELECT
    user_id,
    created_at AS activity_date,
    'reading_assessment' AS activity_type,
    'overall' AS feature_type
  FROM reading_assessments
  WHERE status = 'completed'
    AND created_at >= NOW() - INTERVAL '16 weeks'

  UNION ALL

  -- CRITICAL: Limit conversations to retention window (THIS WAS THE 317ms KILLER)
  SELECT
    user_id,
    created_at AS activity_date,
    'conversation' AS activity_type,
    'overall' AS feature_type
  FROM conversations
  WHERE created_at >= NOW() - INTERVAL '16 weeks'
),
retention_buckets AS (
  SELECT
    c.cohort_week,
    c.user_id,
    'overall' AS feature_type,

    -- Day 0 (registration day) activity
    BOOL_OR(CASE
      WHEN a.activity_date::DATE = c.user_start_date::DATE
      THEN true ELSE false
    END) AS active_day0,

    -- Week 1 (days 1-7) activity
    BOOL_OR(CASE
      WHEN a.activity_date >= c.user_start_date + INTERVAL '1 day'
        AND a.activity_date < c.user_start_date + INTERVAL '8 days'
      THEN true ELSE false
    END) AS active_week1,

    -- Week 2 (days 8-14) activity
    BOOL_OR(CASE
      WHEN a.activity_date >= c.user_start_date + INTERVAL '8 days'
        AND a.activity_date < c.user_start_date + INTERVAL '15 days'
      THEN true ELSE false
    END) AS active_week2,

    -- Week 3 (days 15-21) activity
    BOOL_OR(CASE
      WHEN a.activity_date >= c.user_start_date + INTERVAL '15 days'
        AND a.activity_date < c.user_start_date + INTERVAL '22 days'
      THEN true ELSE false
    END) AS active_week3,

    -- Week 4 (days 22-28) activity
    BOOL_OR(CASE
      WHEN a.activity_date >= c.user_start_date + INTERVAL '22 days'
        AND a.activity_date < c.user_start_date + INTERVAL '29 days'
      THEN true ELSE false
    END) AS active_week4

  FROM cohorts c
  LEFT JOIN activity_timeline a ON c.user_id = a.user_id
  GROUP BY c.cohort_week, c.user_id
)
SELECT
  rb.cohort_week,
  rb.feature_type,
  COUNT(DISTINCT rb.user_id) AS cohort_size,

  -- Day 0 activation percentage
  ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_day0) / NULLIF(COUNT(DISTINCT rb.user_id), 0), 1) AS day0_activation_pct,

  -- Week 1 retention
  COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) AS week1_users,
  ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) / NULLIF(COUNT(DISTINCT rb.user_id), 0), 1) AS week1_pct,

  -- Week 2 retention
  COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) AS week2_users,
  ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) / NULLIF(COUNT(DISTINCT rb.user_id), 0), 1) AS week2_pct,

  -- Week 3 retention
  COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) AS week3_users,
  ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) / NULLIF(COUNT(DISTINCT rb.user_id), 0), 1) AS week3_pct,

  -- Week 4 retention
  COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) AS week4_users,
  ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) / NULLIF(COUNT(DISTINCT rb.user_id), 0), 1) AS week4_pct,

  -- Maturity flags
  (CURRENT_DATE >= rb.cohort_week + INTERVAL '14 days') AS has_week2_data,
  (CURRENT_DATE >= rb.cohort_week + INTERVAL '21 days') AS has_week3_data,
  (CURRENT_DATE >= rb.cohort_week + INTERVAL '28 days') AS has_week4_data,

  NOW() AS last_refreshed

FROM retention_buckets rb
GROUP BY rb.cohort_week, rb.feature_type
ORDER BY rb.cohort_week DESC;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_retention_cohorts_unique ON mv_retention_cohorts (cohort_week, feature_type);

-- Performance index
CREATE INDEX idx_mv_retention_cohorts_feature ON mv_retention_cohorts (feature_type);

-- ============================================================================
-- VIEW 4: mv_view_refresh_status (Meta-view for monitoring)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_view_refresh_status CASCADE;

CREATE MATERIALIZED VIEW mv_view_refresh_status AS
SELECT
  'mv_dashboard_stats' AS view_name,
  (SELECT last_refreshed FROM mv_dashboard_stats LIMIT 1) AS last_refresh,
  (SELECT COUNT(*) FROM mv_dashboard_stats) AS row_count
UNION ALL
SELECT
  'mv_users_activity' AS view_name,
  (SELECT MAX(last_refreshed) FROM mv_users_activity) AS last_refresh,
  (SELECT COUNT(*) FROM mv_users_activity) AS row_count
UNION ALL
SELECT
  'mv_retention_cohorts' AS view_name,
  (SELECT MAX(last_refreshed) FROM mv_retention_cohorts) AS last_refresh,
  (SELECT COUNT(*) FROM mv_retention_cohorts) AS row_count;

CREATE UNIQUE INDEX idx_mv_view_refresh_status_unique ON mv_view_refresh_status (view_name);

-- ============================================================================
-- HELPER FUNCTION: Refresh all views safely
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS TABLE (
  view_name TEXT,
  refresh_status TEXT,
  duration_ms INTEGER
) AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
BEGIN
  -- Refresh mv_dashboard_stats
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_dashboard_stats'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_dashboard_stats'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh mv_users_activity
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_users_activity;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_users_activity'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_users_activity'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh mv_retention_cohorts
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_retention_cohorts;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_retention_cohorts'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_retention_cohorts'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh status view last
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_view_refresh_status;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_view_refresh_status'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_view_refresh_status'::TEXT, SQLERRM::TEXT, 0;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON mv_dashboard_stats TO authenticated;
GRANT SELECT ON mv_dashboard_stats TO service_role;

GRANT SELECT ON mv_users_activity TO authenticated;
GRANT SELECT ON mv_users_activity TO service_role;

GRANT SELECT ON mv_retention_cohorts TO authenticated;
GRANT SELECT ON mv_retention_cohorts TO service_role;

GRANT SELECT ON mv_view_refresh_status TO authenticated;
GRANT SELECT ON mv_view_refresh_status TO service_role;

GRANT EXECUTE ON FUNCTION refresh_dashboard_views() TO service_role;

-- ============================================================================
-- INITIAL DATA: Populate views
-- ============================================================================

-- Note: Views are populated on creation, but call refresh to ensure freshness
SELECT * FROM refresh_dashboard_views();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify dashboard stats (should return 1 row instantly)
-- SELECT * FROM mv_dashboard_stats;

-- Verify users activity (should be fast)
-- SELECT * FROM mv_users_activity LIMIT 10;

-- Verify retention cohorts
-- SELECT * FROM mv_retention_cohorts;

-- Verify refresh status
-- SELECT * FROM mv_view_refresh_status;

-- Compare performance (run EXPLAIN ANALYZE)
-- EXPLAIN ANALYZE SELECT * FROM mv_dashboard_stats;
-- vs
-- EXPLAIN ANALYZE SELECT COUNT(*) FROM users; -- (x17 queries)
