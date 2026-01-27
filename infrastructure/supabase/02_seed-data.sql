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

-- Schema version record
INSERT INTO schema_versions (version, description)
VALUES ('1.0.0', 'Rumi Platform open-source initial setup')
ON CONFLICT (version) DO NOTHING;
