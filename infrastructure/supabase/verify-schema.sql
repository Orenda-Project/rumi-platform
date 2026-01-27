-- =============================================================================
-- Rumi Platform - Schema Verification
-- Run after setup to verify all tables were created correctly.
-- Each query should return a row — if any returns empty, that table is missing.
-- =============================================================================

-- Count all expected tables
SELECT 'Table Count' AS check_name,
       COUNT(*) AS result,
       CASE WHEN COUNT(*) >= 25 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Verify core tables exist
SELECT table_name,
       'EXISTS' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'chat_sessions',
    'conversations',
    'coaching_sessions',
    'coaching_processing_queue',
    'coaching_quality_metrics',
    'audio_sessions',
    'reading_assessments',
    'wcpm_percentiles',
    'lesson_plans',
    'teacher_progress',
    'teacher_facts',
    'videos',
    'video_requests',
    'student_videos',
    'exam_check_sessions',
    'exam_submissions',
    'exam_grades',
    'exam_templates',
    'student_lists',
    'students',
    'attendance_sessions',
    'attendance_records',
    'image_analysis_requests',
    'failed_operations',
    'schema_versions'
  )
ORDER BY table_name;

-- Verify RLS is enabled
SELECT tablename,
       rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'conversations', 'coaching_sessions', 'reading_assessments')
ORDER BY tablename;

-- Verify seed data
SELECT 'WCPM Benchmarks' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) >= 25 THEN 'PASS' ELSE 'FAIL' END AS status
FROM wcpm_percentiles;

-- Verify schema version
SELECT version, description, applied_at
FROM schema_versions
ORDER BY applied_at DESC
LIMIT 1;

-- Verify extensions
SELECT extname AS extension,
       'INSTALLED' AS status
FROM pg_extension
WHERE extname = 'uuid-ossp';
