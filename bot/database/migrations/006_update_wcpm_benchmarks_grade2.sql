/**
 * Migration: Update Grade 2 English WCPM Benchmarks
 *
 * Issue: Current benchmarks are too low for Grade 2 English
 * - Fall 25th percentile: 34 (should be 44)
 * - Fall 75th percentile: 72 (should be 90)
 *
 * Impact: System incorrectly classified students as "above benchmark"
 * when they were actually below grade-level expectations.
 *
 * Source: Hasbrouck & Tindal (2017) - Oral Reading Fluency Norms
 * These are research-based standards used nationally in US schools
 * and adapted for international English language education.
 *
 * Created: November 18, 2025
 * Related Issue: Bug #35 - Godwin Austin assessment investigation
 */

-- Update Grade 2 English Fall benchmarks to research-based values
UPDATE wcpm_percentiles
SET wcpm_threshold = 26
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
  AND percentile = 10;

UPDATE wcpm_percentiles
SET wcpm_threshold = 44
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
  AND percentile = 25;

UPDATE wcpm_percentiles
SET wcpm_threshold = 68
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
  AND percentile = 50;

UPDATE wcpm_percentiles
SET wcpm_threshold = 90
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
  AND percentile = 75;

UPDATE wcpm_percentiles
SET wcpm_threshold = 111
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
  AND percentile = 90;

-- Verify the updates
SELECT
  grade_level,
  language,
  season,
  percentile,
  wcpm_threshold as new_threshold,
  CASE
    WHEN percentile = 10 THEN '26 (was 18)'
    WHEN percentile = 25 THEN '44 (was 34)'
    WHEN percentile = 50 THEN '68 (was 51)'
    WHEN percentile = 75 THEN '90 (was 72)'
    WHEN percentile = 90 THEN '111 (was 87)'
  END as change_note
FROM wcpm_percentiles
WHERE grade_level = 2
  AND language = 'en'
  AND season = 'fall'
ORDER BY percentile;
