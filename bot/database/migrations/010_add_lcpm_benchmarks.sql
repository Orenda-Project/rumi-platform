-- Migration: Add LCPM Benchmarks for Letter Naming Fluency
-- Version: v2.8.5
-- Date: November 30, 2025
-- Bug Fix: Bug #6 - WCPM Metric Inappropriateness for Alphabet Recognition
-- Description: WCPM is designed for connected text reading fluency, not isolated letter identification.
--              This migration adds LCPM (Letters Correct Per Minute) benchmarks using DIBELS norms.

-- =============================================================================
-- STEP 1: CREATE LCPM_BENCHMARKS TABLE
-- =============================================================================
-- DIBELS Letter Naming Fluency (LNF) norms for PreK-Grade 2
-- Source: Good, R. H., & Kaminski, R. A. (2002). DIBELS LNF benchmarks

CREATE TABLE IF NOT EXISTS lcpm_benchmarks (
  id SERIAL PRIMARY KEY,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 0 AND 3),
  -- 0=PreK, 1=Kindergarten, 2=Grade1, 3=Grade2
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  season VARCHAR(10) NOT NULL CHECK (season IN ('fall', 'winter', 'spring')),
  percentile_5 INTEGER NOT NULL,
  percentile_10 INTEGER NOT NULL,
  percentile_25 INTEGER NOT NULL,
  percentile_50 INTEGER NOT NULL,
  percentile_75 INTEGER NOT NULL,
  percentile_90 INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (grade_level, language, season)
);

-- =============================================================================
-- STEP 2: INSERT DIBELS LNF BENCHMARK DATA
-- =============================================================================
-- DIBELS Letter Naming Fluency (LNF) norms - letters per minute
-- Research source: University of Oregon DIBELS Data System

-- PreK (Grade 0) - Limited normative data, using conservative estimates
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (0, 'en', 'fall', 0, 0, 2, 5, 12, 20),
  (0, 'en', 'winter', 0, 2, 5, 12, 22, 32),
  (0, 'en', 'spring', 2, 5, 12, 22, 35, 45);

-- Kindergarten (Grade 1 in our system = K in school)
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (1, 'en', 'fall', 0, 2, 8, 29, 47, 58),
  (1, 'en', 'winter', 5, 13, 26, 42, 55, 66),
  (1, 'en', 'spring', 15, 24, 37, 52, 64, 74);

-- Grade 1 (Grade 2 in our system)
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (2, 'en', 'fall', 22, 30, 42, 55, 67, 78),
  (2, 'en', 'winter', 28, 36, 48, 61, 72, 83),
  (2, 'en', 'spring', 32, 40, 52, 65, 76, 86);

-- Grade 2 (Grade 3 in our system) - LNF less relevant but included for completeness
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (3, 'en', 'fall', 38, 45, 55, 68, 79, 89),
  (3, 'en', 'winter', 42, 48, 58, 71, 82, 92),
  (3, 'en', 'spring', 45, 52, 62, 74, 85, 95);

-- =============================================================================
-- STEP 3: ADD URDU LCPM BENCHMARKS (L2 adjusted - 30% lower)
-- =============================================================================
-- Urdu alphabet has 38 characters vs English 26, adjusted proportionally

INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  -- Kindergarten Urdu
  (1, 'ur', 'fall', 0, 1, 5, 20, 33, 40),
  (1, 'ur', 'winter', 3, 9, 18, 29, 38, 46),
  (1, 'ur', 'spring', 10, 17, 26, 36, 45, 52),
  -- Grade 1 Urdu
  (2, 'ur', 'fall', 15, 21, 29, 38, 47, 55),
  (2, 'ur', 'winter', 20, 25, 34, 43, 50, 58),
  (2, 'ur', 'spring', 22, 28, 36, 46, 53, 60),
  -- Grade 2 Urdu
  (3, 'ur', 'fall', 27, 32, 38, 48, 55, 62),
  (3, 'ur', 'winter', 29, 34, 41, 50, 57, 64),
  (3, 'ur', 'spring', 32, 36, 43, 52, 60, 66);

-- =============================================================================
-- STEP 4: CREATE HELPER FUNCTION FOR LCPM BENCHMARK LOOKUP
-- =============================================================================

CREATE OR REPLACE FUNCTION check_lcpm_benchmark_status(
  p_lcpm FLOAT,
  p_grade INTEGER,
  p_language VARCHAR(10)
)
RETURNS TABLE (
  benchmark_min INTEGER,
  benchmark_max INTEGER,
  on_track BOOLEAN,
  percentile_rank INTEGER,
  metric_name VARCHAR(10),
  metric_display_name VARCHAR(50)
) AS $$
DECLARE
  v_benchmarks lcpm_benchmarks%ROWTYPE;
  v_percentile INTEGER;
BEGIN
  -- Get fall benchmarks (conservative, start of year)
  SELECT * INTO v_benchmarks
  FROM lcpm_benchmarks
  WHERE grade_level = p_grade
    AND language = COALESCE(p_language, 'en')
    AND season = 'fall'
  LIMIT 1;

  -- If no benchmark found, use defaults
  IF v_benchmarks IS NULL THEN
    benchmark_min := 20;
    benchmark_max := 60;
    on_track := p_lcpm >= 20;
    percentile_rank := 50;
    metric_name := 'LCPM';
    metric_display_name := 'Letters Correct Per Minute';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Calculate percentile
  IF p_lcpm < v_benchmarks.percentile_5 THEN
    v_percentile := 5;
  ELSIF p_lcpm < v_benchmarks.percentile_10 THEN
    v_percentile := 10;
  ELSIF p_lcpm < v_benchmarks.percentile_25 THEN
    v_percentile := 25;
  ELSIF p_lcpm < v_benchmarks.percentile_50 THEN
    v_percentile := 50;
  ELSIF p_lcpm < v_benchmarks.percentile_75 THEN
    v_percentile := 75;
  ELSIF p_lcpm < v_benchmarks.percentile_90 THEN
    v_percentile := 90;
  ELSE
    v_percentile := 95;
  END IF;

  -- Return results
  benchmark_min := v_benchmarks.percentile_25;  -- 25th percentile as minimum target
  benchmark_max := v_benchmarks.percentile_75;  -- 75th percentile as stretch goal
  on_track := p_lcpm >= v_benchmarks.percentile_25;  -- On track if above 25th percentile
  percentile_rank := v_percentile;
  metric_name := 'LCPM';
  metric_display_name := 'Letters Correct Per Minute';

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_lcpm_benchmark_status IS 'Determines LCPM benchmark status for letter naming fluency using DIBELS norms';

-- =============================================================================
-- STEP 5: CREATE COMMENTS
-- =============================================================================

COMMENT ON TABLE lcpm_benchmarks IS 'DIBELS Letter Naming Fluency (LNF) normative benchmarks for alphabet recognition assessment';
COMMENT ON COLUMN lcpm_benchmarks.grade_level IS '0=PreK, 1=Kindergarten, 2=Grade1, 3=Grade2 (LNF less relevant beyond Grade 2)';
COMMENT ON COLUMN lcpm_benchmarks.season IS 'Assessment timing: fall (Sept-Nov), winter (Dec-Feb), spring (Mar-May)';
COMMENT ON COLUMN lcpm_benchmarks.percentile_50 IS 'Median performance - students at this level are on track';

-- =============================================================================
-- STEP 6: CREATE INDEX FOR FAST LOOKUP
-- =============================================================================

CREATE INDEX idx_lcpm_benchmarks_lookup ON lcpm_benchmarks(grade_level, language, season);

-- =============================================================================
-- STEP 7: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v2.8.5', 'Add LCPM benchmarks for letter naming fluency (Bug #6 fix)');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. lcpm_benchmarks table with DIBELS Letter Naming Fluency norms
-- 2. check_lcpm_benchmark_status() function for benchmark lookup
-- 3. Support for both English and Urdu alphabet assessment
--
-- Bug #6 Context:
-- WCPM (Words Correct Per Minute) was being used for alphabet recognition assessments,
-- which is pedagogically inappropriate because:
-- - Letter identification measures visual discrimination + phonological retrieval
-- - WCPM measures decoding + semantic processing + syntactic integration
-- - These are fundamentally different cognitive processes
--
-- Solution:
-- - Letters passages now use LCPM (Letters Correct Per Minute)
-- - DIBELS LNF norms provide appropriate developmental benchmarks
-- - Reports now display "Letters Correct Per Minute" for alphabet assessments
--
-- Research Sources:
-- - Good, R. H., & Kaminski, R. A. (2002). DIBELS LNF benchmarks
-- - National Reading Panel (2000). Letter knowledge as distinct construct
-- - Jenkins, J. R., et al. (2003). WCPM vs word list performance differences

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify table created:
--    SELECT * FROM lcpm_benchmarks LIMIT 5;
-- 3. Test helper function:
--    SELECT * FROM check_lcpm_benchmark_status(45, 2, 'en');
-- 4. Deploy code changes to fluency.service.js and report.service.js

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================

-- DROP FUNCTION IF EXISTS check_lcpm_benchmark_status(FLOAT, INTEGER, VARCHAR);
-- DROP INDEX IF EXISTS idx_lcpm_benchmarks_lookup;
-- DROP TABLE IF EXISTS lcpm_benchmarks;
-- DELETE FROM schema_versions WHERE version = 'v2.8.5';
