-- =============================================================================
-- Rumi Platform - Schema Verification
-- Run after setup to verify all tables were created correctly.
-- Each query should return a row — if any returns empty, that table is missing.
-- =============================================================================

-- Count all expected tables (should be >= 55)
SELECT 'Table Count' AS check_name,
       COUNT(*) AS result,
       CASE WHEN COUNT(*) >= 55 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Count functions (should be >= 30)
SELECT 'Function Count' AS check_name,
       COUNT(*) AS result,
       CASE WHEN COUNT(*) >= 30 THEN 'PASS' ELSE 'FAIL' END AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f';

-- Count triggers (should be >= 20)
SELECT 'Trigger Count' AS check_name,
       COUNT(DISTINCT trigger_name) AS result,
       CASE WHEN COUNT(DISTINCT trigger_name) >= 20 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- Verify all 60 tables exist
SELECT table_name,
       'EXISTS' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'dashboard_users', 'portal_organizations', 'access_scopes',
    'feature_permissions', 'invitations', 'user_feature_first_use',
    'chat_sessions', 'conversations', 'chat_starts', 'cta_clicks',
    'coaching_sessions', 'coaching_jobs', 'coaching_processing_queue',
    'coaching_quality_metrics', 'audio_sessions', 'teacher_progress',
    'teacher_facts', 'lesson_plans', 'lesson_plan_requests',
    'reading_assessments', 'lcpm_benchmarks', 'wcpm_percentiles',
    'student_lists', 'students', 'student_videos',
    'attendance_sessions', 'attendance_records',
    'exam_check_sessions', 'exam_templates', 'exam_submissions',
    'exam_grades', 'grade_audit_log', 'image_analysis_requests',
    'video_requests', 'video_tasks', 'videos',
    'ab_tests', 'ab_test_variants', 'ab_test_events',
    'ama_conversations', 'ama_messages', 'ama_query_audit',
    'byof_sessions', 'byof_messages', 'byof_plans', 'byof_approval_log',
    'broadcast_logs', 'broadcast_messages',
    'qa_test_runs', 'qa_analyst_proposals', 'qa_bug_patterns',
    'dashboard_audit_log', 'feature_suggestions', 'api_usage_log',
    'failed_operations', 'release_notes', 'schema_versions',
    'website_visits', 'migration_test'
  )
ORDER BY table_name;

-- Verify RLS is enabled on critical tables
SELECT tablename,
       rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'conversations', 'coaching_sessions',
    'reading_assessments', 'attendance_sessions', 'broadcast_messages'
  )
ORDER BY tablename;

-- Verify seed data
SELECT 'WCPM Benchmarks' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) >= 25 THEN 'PASS' ELSE 'FAIL' END AS status
FROM wcpm_percentiles;

SELECT 'LCPM Benchmarks' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) >= 20 THEN 'PASS' ELSE 'FAIL' END AS status
FROM lcpm_benchmarks;

-- Verify schema version
SELECT version, description, applied_at
FROM schema_versions
ORDER BY applied_at DESC
LIMIT 1;

-- Verify extensions
SELECT extname AS extension,
       'INSTALLED' AS status
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'vector');
