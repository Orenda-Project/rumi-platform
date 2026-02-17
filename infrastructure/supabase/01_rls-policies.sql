-- =============================================================================
-- Rumi Platform - Row Level Security (RLS) Policies
-- Run AFTER 00_complete-schema.sql
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feature_first_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_starts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cta_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lcpm_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wcpm_percentiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_check_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_analysis_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ama_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ama_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ama_query_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE byof_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE byof_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE byof_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE byof_approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_analyst_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_bug_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_test ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Service role policies
-- The bot uses the service_role key which bypasses RLS.
-- These policies grant full access to service_role and restrict anonymous access.
-- =============================================================================

-- Core User Management
CREATE POLICY "service_role_users" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_dashboard_users" ON dashboard_users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_portal_orgs" ON portal_organizations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access_scopes" ON access_scopes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_feature_perms" ON feature_permissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_invitations" ON invitations FOR ALL USING (auth.role() = 'service_role');

-- Engagement & Analytics
CREATE POLICY "service_role_feature_first_use" ON user_feature_first_use FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_chat_sessions" ON chat_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_chat_starts" ON chat_starts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_cta_clicks" ON cta_clicks FOR ALL USING (auth.role() = 'service_role');

-- Coaching
CREATE POLICY "service_role_coaching_sessions" ON coaching_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_jobs" ON coaching_jobs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_queue" ON coaching_processing_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_metrics" ON coaching_quality_metrics FOR ALL USING (auth.role() = 'service_role');

-- Legacy Audio & Teacher
CREATE POLICY "service_role_audio_sessions" ON audio_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_teacher_progress" ON teacher_progress FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_teacher_facts" ON teacher_facts FOR ALL USING (auth.role() = 'service_role');

-- Lesson Plans
CREATE POLICY "service_role_lesson_plans" ON lesson_plans FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_lesson_plan_requests" ON lesson_plan_requests FOR ALL USING (auth.role() = 'service_role');

-- Reading Assessment
CREATE POLICY "service_role_reading_assessments" ON reading_assessments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_lcpm_benchmarks" ON lcpm_benchmarks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_wcpm_percentiles" ON wcpm_percentiles FOR ALL USING (auth.role() = 'service_role');

-- Attendance
CREATE POLICY "service_role_student_lists" ON student_lists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_students" ON students FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_student_videos" ON student_videos FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_attendance_sessions" ON attendance_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_attendance_records" ON attendance_records FOR ALL USING (auth.role() = 'service_role');

-- Exam Checker
CREATE POLICY "service_role_exam_sessions" ON exam_check_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_templates" ON exam_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_submissions" ON exam_submissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_grades" ON exam_grades FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_grade_audit_log" ON grade_audit_log FOR ALL USING (auth.role() = 'service_role');

-- Image Analysis
CREATE POLICY "service_role_image_analysis" ON image_analysis_requests FOR ALL USING (auth.role() = 'service_role');

-- Video
CREATE POLICY "service_role_video_requests" ON video_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_video_tasks" ON video_tasks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_videos" ON videos FOR ALL USING (auth.role() = 'service_role');

-- A/B Testing
CREATE POLICY "service_role_ab_tests" ON ab_tests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_ab_test_variants" ON ab_test_variants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_ab_test_events" ON ab_test_events FOR ALL USING (auth.role() = 'service_role');

-- AMA
CREATE POLICY "service_role_ama_conversations" ON ama_conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_ama_messages" ON ama_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_ama_query_audit" ON ama_query_audit FOR ALL USING (auth.role() = 'service_role');

-- BYOF
CREATE POLICY "service_role_byof_sessions" ON byof_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_byof_messages" ON byof_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_byof_plans" ON byof_plans FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_byof_approval_log" ON byof_approval_log FOR ALL USING (auth.role() = 'service_role');

-- Broadcast
CREATE POLICY "service_role_broadcast_logs" ON broadcast_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_broadcast_messages" ON broadcast_messages FOR ALL USING (auth.role() = 'service_role');

-- QA
CREATE POLICY "service_role_qa_test_runs" ON qa_test_runs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_qa_analyst_proposals" ON qa_analyst_proposals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_qa_bug_patterns" ON qa_bug_patterns FOR ALL USING (auth.role() = 'service_role');

-- Misc / System
CREATE POLICY "service_role_dashboard_audit" ON dashboard_audit_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_feature_suggestions" ON feature_suggestions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_api_usage_log" ON api_usage_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_failed_operations" ON failed_operations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_release_notes" ON release_notes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_schema_versions" ON schema_versions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_website_visits" ON website_visits FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_migration_test" ON migration_test FOR ALL USING (auth.role() = 'service_role');
