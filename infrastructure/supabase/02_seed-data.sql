-- =============================================================================
-- Rumi Platform - Seed Data
-- Run AFTER 00_complete-schema.sql and 01_rls-policies.sql
-- =============================================================================

-- WCPM Percentile Benchmarks (DIBELS-based norms for reading assessment)
-- These are used to compare student reading fluency scores
-- Table structure: grade_level (INTEGER), language, season, percentile, wcpm_threshold
INSERT INTO wcpm_percentiles (grade_level, language, season, percentile, wcpm_threshold)
VALUES
  -- Grade 1
  (1, 'en', 'fall', 10, 0), (1, 'en', 'fall', 25, 3), (1, 'en', 'fall', 50, 10), (1, 'en', 'fall', 75, 23), (1, 'en', 'fall', 90, 43),
  (1, 'en', 'winter', 10, 10), (1, 'en', 'winter', 25, 23), (1, 'en', 'winter', 50, 40), (1, 'en', 'winter', 75, 59), (1, 'en', 'winter', 90, 79),
  (1, 'en', 'spring', 10, 19), (1, 'en', 'spring', 25, 36), (1, 'en', 'spring', 50, 56), (1, 'en', 'spring', 75, 77), (1, 'en', 'spring', 90, 97),
  -- Grade 2
  (2, 'en', 'fall', 10, 30), (2, 'en', 'fall', 25, 48), (2, 'en', 'fall', 50, 67), (2, 'en', 'fall', 75, 86), (2, 'en', 'fall', 90, 104),
  (2, 'en', 'winter', 10, 49), (2, 'en', 'winter', 25, 67), (2, 'en', 'winter', 50, 89), (2, 'en', 'winter', 75, 109), (2, 'en', 'winter', 90, 127),
  (2, 'en', 'spring', 10, 60), (2, 'en', 'spring', 25, 80), (2, 'en', 'spring', 50, 101), (2, 'en', 'spring', 75, 121), (2, 'en', 'spring', 90, 139),
  -- Grade 3
  (3, 'en', 'fall', 10, 50), (3, 'en', 'fall', 25, 67), (3, 'en', 'fall', 50, 88), (3, 'en', 'fall', 75, 108), (3, 'en', 'fall', 90, 127),
  (3, 'en', 'winter', 10, 62), (3, 'en', 'winter', 25, 83), (3, 'en', 'winter', 50, 105), (3, 'en', 'winter', 75, 126), (3, 'en', 'winter', 90, 146),
  (3, 'en', 'spring', 10, 72), (3, 'en', 'spring', 25, 93), (3, 'en', 'spring', 50, 115), (3, 'en', 'spring', 75, 135), (3, 'en', 'spring', 90, 153),
  -- Grade 4
  (4, 'en', 'fall', 10, 65), (4, 'en', 'fall', 25, 83), (4, 'en', 'fall', 50, 104), (4, 'en', 'fall', 75, 125), (4, 'en', 'fall', 90, 144),
  (4, 'en', 'winter', 10, 75), (4, 'en', 'winter', 25, 96), (4, 'en', 'winter', 50, 118), (4, 'en', 'winter', 75, 138), (4, 'en', 'winter', 90, 157),
  (4, 'en', 'spring', 10, 83), (4, 'en', 'spring', 25, 103), (4, 'en', 'spring', 50, 125), (4, 'en', 'spring', 75, 146), (4, 'en', 'spring', 90, 165),
  -- Grade 5
  (5, 'en', 'fall', 10, 76), (5, 'en', 'fall', 25, 95), (5, 'en', 'fall', 50, 118), (5, 'en', 'fall', 75, 139), (5, 'en', 'fall', 90, 159),
  (5, 'en', 'winter', 10, 84), (5, 'en', 'winter', 25, 105), (5, 'en', 'winter', 50, 128), (5, 'en', 'winter', 75, 150), (5, 'en', 'winter', 90, 169),
  (5, 'en', 'spring', 10, 90), (5, 'en', 'spring', 25, 111), (5, 'en', 'spring', 50, 133), (5, 'en', 'spring', 75, 155), (5, 'en', 'spring', 90, 174)
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
VALUES ('2.0.0', 'Rumi Platform production-parity schema (73 tables, 40 functions)')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- Region features (standardized region gating) — Phase 4A
-- 'default': generic Gamma LP + pic-to-LP on, curriculum LP off. Every region
-- with no explicit row inherits these defaults (fail-open). Add a row per
-- region to enable curriculum LPs / change the coaching framework / languages.
-- 'demo_region' is a SYNTHETIC example (fictional curriculum) showing how a
-- curriculum-enabled region looks — safe to delete.
-- ============================================================================
INSERT INTO region_features (region, gamma_lp_enabled, pic_lp_enabled, curriculum_lp_enabled, default_framework, supported_languages)
VALUES ('default', true, true, false, 'oecd', '["en"]'::jsonb)
ON CONFLICT (region) DO NOTHING;

INSERT INTO region_features (region, curriculum_key, supported_subjects, has_textbooks, curriculum_lp_enabled, default_framework, supported_languages)
VALUES ('demo_region', 'demo_curriculum', ARRAY['maths','english'], true, true, 'hots', '["en"]'::jsonb)
ON CONFLICT (region) DO NOTHING;

-- 'india': India-market region (per-user region). Conversation-core launch:
-- generic Gamma LP + pic-to-LP on, curriculum LP off (no India curriculum yet).
-- supported_languages drives the region-filtered /language picker (English +
-- the six Indian languages; reading-assessment norms are en/ur only for now).
-- Override the coaching framework per deployment via REGION_FRAMEWORK_MAP env.
INSERT INTO region_features (region, gamma_lp_enabled, pic_lp_enabled, curriculum_lp_enabled, default_framework, supported_languages)
VALUES ('india', true, true, false, 'oecd', '["en","hi","bn","mr","te","ta-IN","kn"]'::jsonb)
ON CONFLICT (region) DO NOTHING;

-- 'pakistan': the region the bundled content library belongs to. Video quizzes
-- (the 890-video Pakistani-curriculum student library + its quiz corpus) are
-- enabled HERE and nowhere else — the questions were authored against these
-- exact videos, in English and Urdu. A deployment serving Pakistani teachers
-- sets DEFAULT_REGION=pakistan in .env and gets the feature; other regions
-- flip video_quizzes_enabled on their own row once they have their own corpus.
INSERT INTO region_features (region, gamma_lp_enabled, pic_lp_enabled, curriculum_lp_enabled, default_framework, supported_languages, video_quizzes_enabled)
VALUES ('pakistan', true, true, false, 'oecd', '["en","ur"]'::jsonb, true)
ON CONFLICT (region) DO UPDATE SET video_quizzes_enabled = EXCLUDED.video_quizzes_enabled;
