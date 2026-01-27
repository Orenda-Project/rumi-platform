-- Migration 007: Retention Calculation Function
-- Creates PostgreSQL function to calculate cohort retention rates
-- Author: Claude Code
-- Date: November 20, 2025

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS calculate_retention(TEXT, DATE, DATE);

-- Create retention calculation function
CREATE OR REPLACE FUNCTION calculate_retention(
  p_feature_type TEXT DEFAULT 'overall',
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '12 weeks',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  cohort_week DATE,
  cohort_size BIGINT,
  day0_activation_pct NUMERIC,
  week1_users BIGINT,
  week1_pct NUMERIC,
  week2_users BIGINT,
  week2_pct NUMERIC,
  week3_users BIGINT,
  week3_pct NUMERIC,
  week4_users BIGINT,
  week4_pct NUMERIC,
  week5_8_users BIGINT,
  week5_8_pct NUMERIC,
  week9_12_users BIGINT,
  week9_12_pct NUMERIC,
  has_week2_data BOOLEAN,
  has_week3_data BOOLEAN,
  has_week4_data BOOLEAN,
  has_week5_8_data BOOLEAN,
  has_week9_12_data BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH cohorts AS (
    -- Define weekly cohorts
    SELECT
      u.id as user_id,
      DATE_TRUNC('week', u.registration_completed_at)::DATE as cohort_week,
      u.registration_completed_at
    FROM users u
    WHERE u.registration_completed_at IS NOT NULL
      AND u.registration_completed_at >= p_start_date
      AND u.registration_completed_at <= p_end_date
  ),
  activity_timeline AS (
    -- Build activity timeline based on feature type
    SELECT
      user_id,
      created_at as activity_date,
      'coaching' as activity_type
    FROM coaching_sessions
    WHERE status = 'completed'
      AND (p_feature_type = 'overall' OR p_feature_type = 'coaching')

    UNION ALL

    SELECT
      user_id,
      created_at as activity_date,
      'lesson_plan' as activity_type
    FROM lesson_plans
    WHERE (p_feature_type = 'overall' OR p_feature_type = 'lesson_plans')

    UNION ALL

    SELECT
      user_id,
      created_at as activity_date,
      'reading_assessment' as activity_type
    FROM reading_assessments
    WHERE status = 'completed'
      AND (p_feature_type = 'overall' OR p_feature_type = 'reading')
  ),
  retention_buckets AS (
    SELECT
      c.cohort_week,
      c.user_id,

      -- Day 0 (registration day) activity
      BOOL_OR(CASE
        WHEN a.activity_date::DATE = c.registration_completed_at::DATE
        THEN true ELSE false
      END) as active_day0,

      -- Week 1 (days 1-7) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '1 day'
          AND a.activity_date < c.registration_completed_at + INTERVAL '8 days'
        THEN true ELSE false
      END) as active_week1,

      -- Week 2 (days 8-14) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '8 days'
          AND a.activity_date < c.registration_completed_at + INTERVAL '15 days'
        THEN true ELSE false
      END) as active_week2,

      -- Week 3 (days 15-21) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '15 days'
          AND a.activity_date < c.registration_completed_at + INTERVAL '22 days'
        THEN true ELSE false
      END) as active_week3,

      -- Week 4 (days 22-28) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '22 days'
          AND a.activity_date < c.registration_completed_at + INTERVAL '29 days'
        THEN true ELSE false
      END) as active_week4,

      -- Week 5-8 (days 29-56) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '29 days'
          AND a.activity_date < c.registration_completed_at + INTERVAL '57 days'
        THEN true ELSE false
      END) as active_week5_8,

      -- Week 9-12 (days 57-84) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.registration_completed_at + INTERVAL '57 days'
          AND a.activity_date < c.registration_completed_at + INTERVAL '85 days'
        THEN true ELSE false
      END) as active_week9_12

    FROM cohorts c
    LEFT JOIN activity_timeline a ON c.user_id = a.user_id
    GROUP BY c.cohort_week, c.user_id
  )
  SELECT
    rb.cohort_week,
    COUNT(DISTINCT rb.user_id) as cohort_size,

    -- Day 0 activation percentage (feature usage on registration day)
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_day0) / COUNT(DISTINCT rb.user_id), 1) as day0_activation_pct,

    -- Week 1 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) as week1_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) / COUNT(DISTINCT rb.user_id), 1) as week1_pct,

    -- Week 2 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) as week2_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) / COUNT(DISTINCT rb.user_id), 1) as week2_pct,

    -- Week 3 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) as week3_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) / COUNT(DISTINCT rb.user_id), 1) as week3_pct,

    -- Week 4 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) as week4_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) / COUNT(DISTINCT rb.user_id), 1) as week4_pct,

    -- Week 5-8 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week5_8) as week5_8_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week5_8) / COUNT(DISTINCT rb.user_id), 1) as week5_8_pct,

    -- Week 9-12 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week9_12) as week9_12_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week9_12) / COUNT(DISTINCT rb.user_id), 1) as week9_12_pct,

    -- Maturity flags (is cohort old enough for this time bucket?)
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '14 days') as has_week2_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '21 days') as has_week3_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '28 days') as has_week4_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '56 days') as has_week5_8_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '84 days') as has_week9_12_data

  FROM retention_buckets rb
  GROUP BY rb.cohort_week
  ORDER BY rb.cohort_week DESC;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_users_registration_completed
ON users(registration_completed_at)
WHERE registration_completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coaching_user_created
ON coaching_sessions(user_id, created_at, status);

CREATE INDEX IF NOT EXISTS idx_lesson_plans_user_created
ON lesson_plans(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reading_user_created
ON reading_assessments(user_id, created_at, status);

-- Grant execute permission to authenticated users
-- (Adjust based on your Supabase RLS policies)
GRANT EXECUTE ON FUNCTION calculate_retention(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_retention(TEXT, DATE, DATE) TO service_role;

-- Test the function with current data
-- SELECT * FROM calculate_retention('overall', CURRENT_DATE - INTERVAL '12 weeks', CURRENT_DATE) LIMIT 5;
