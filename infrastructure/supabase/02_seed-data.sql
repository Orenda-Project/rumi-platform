-- =============================================================================
-- Rumi Platform - Seed Data
-- Run AFTER 00_complete-schema.sql and 01_rls-policies.sql
-- =============================================================================

-- WCPM Percentile Benchmarks (DIBELS-based norms for reading assessment)
-- These are used to compare student reading fluency scores
INSERT INTO wcpm_percentiles (grade, percentile, fall_wcpm, winter_wcpm, spring_wcpm, source)
VALUES
  ('Grade 1', 10, 0, 10, 19, 'DIBELS'),
  ('Grade 1', 25, 3, 23, 36, 'DIBELS'),
  ('Grade 1', 50, 10, 40, 56, 'DIBELS'),
  ('Grade 1', 75, 23, 59, 77, 'DIBELS'),
  ('Grade 1', 90, 43, 79, 97, 'DIBELS'),
  ('Grade 2', 10, 30, 49, 60, 'DIBELS'),
  ('Grade 2', 25, 48, 67, 80, 'DIBELS'),
  ('Grade 2', 50, 67, 89, 101, 'DIBELS'),
  ('Grade 2', 75, 86, 109, 121, 'DIBELS'),
  ('Grade 2', 90, 104, 127, 139, 'DIBELS'),
  ('Grade 3', 10, 50, 62, 72, 'DIBELS'),
  ('Grade 3', 25, 67, 83, 93, 'DIBELS'),
  ('Grade 3', 50, 88, 105, 115, 'DIBELS'),
  ('Grade 3', 75, 108, 126, 135, 'DIBELS'),
  ('Grade 3', 90, 127, 146, 153, 'DIBELS'),
  ('Grade 4', 10, 65, 75, 83, 'DIBELS'),
  ('Grade 4', 25, 83, 96, 103, 'DIBELS'),
  ('Grade 4', 50, 104, 118, 125, 'DIBELS'),
  ('Grade 4', 75, 125, 138, 146, 'DIBELS'),
  ('Grade 4', 90, 144, 157, 165, 'DIBELS'),
  ('Grade 5', 10, 76, 84, 90, 'DIBELS'),
  ('Grade 5', 25, 95, 105, 111, 'DIBELS'),
  ('Grade 5', 50, 118, 128, 133, 'DIBELS'),
  ('Grade 5', 75, 139, 150, 155, 'DIBELS'),
  ('Grade 5', 90, 159, 169, 174, 'DIBELS')
ON CONFLICT DO NOTHING;

-- LCPM Benchmarks (Letter Correct Per Minute)
-- Used for early literacy assessment in English and Urdu
-- Grade 0 = Kindergarten/Early Years

-- English LCPM Benchmarks
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (0, 'en', 'fall',    0,  0,  2,  5, 12, 20),
  (0, 'en', 'winter',  0,  2,  5, 12, 22, 32),
  (0, 'en', 'spring',  2,  5, 12, 22, 35, 45),
  (1, 'en', 'fall',    0,  2,  8, 29, 47, 58),
  (1, 'en', 'winter',  5, 13, 26, 42, 55, 66),
  (1, 'en', 'spring', 15, 24, 37, 52, 64, 74),
  (2, 'en', 'fall',   22, 30, 42, 55, 67, 78),
  (2, 'en', 'winter', 28, 36, 48, 61, 72, 83),
  (2, 'en', 'spring', 32, 40, 52, 65, 76, 86),
  (3, 'en', 'fall',   38, 45, 55, 68, 79, 89),
  (3, 'en', 'winter', 42, 48, 58, 71, 82, 92),
  (3, 'en', 'spring', 45, 52, 62, 74, 85, 95)
ON CONFLICT DO NOTHING;

-- Urdu LCPM Benchmarks
INSERT INTO lcpm_benchmarks (grade_level, language, season, percentile_5, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES
  (1, 'ur', 'fall',    0,  1,  5, 20, 33, 40),
  (1, 'ur', 'winter',  3,  9, 18, 29, 38, 46),
  (1, 'ur', 'spring', 10, 17, 26, 36, 45, 52),
  (2, 'ur', 'fall',   15, 21, 29, 38, 47, 55),
  (2, 'ur', 'winter', 20, 25, 34, 43, 50, 58),
  (2, 'ur', 'spring', 22, 28, 36, 46, 53, 60),
  (3, 'ur', 'fall',   27, 32, 38, 48, 55, 62),
  (3, 'ur', 'winter', 29, 34, 41, 50, 57, 64),
  (3, 'ur', 'spring', 32, 36, 43, 52, 60, 66)
ON CONFLICT DO NOTHING;

-- Schema version record
INSERT INTO schema_versions (version, description)
VALUES ('2.0.0', 'Rumi Platform production-parity schema (60 tables, 38 functions)')
ON CONFLICT (version) DO NOTHING;
