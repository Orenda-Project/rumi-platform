-- =============================================================================
-- Rumi Platform - Row Level Security (RLS) Policies
-- Run AFTER 00_complete-schema.sql
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wcpm_percentiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_check_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_analysis_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_versions ENABLE ROW LEVEL SECURITY;

-- Service role policies (bot uses service_role key for full access)
CREATE POLICY "service_role_users" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_chat_sessions" ON chat_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_sessions" ON coaching_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_queue" ON coaching_processing_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_coaching_metrics" ON coaching_quality_metrics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_audio_sessions" ON audio_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_reading_assessments" ON reading_assessments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_wcpm_percentiles" ON wcpm_percentiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_lesson_plans" ON lesson_plans FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_teacher_progress" ON teacher_progress FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_teacher_facts" ON teacher_facts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_videos" ON videos FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_video_requests" ON video_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_student_videos" ON student_videos FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_sessions" ON exam_check_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_submissions" ON exam_submissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_grades" ON exam_grades FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_exam_templates" ON exam_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_student_lists" ON student_lists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_students" ON students FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_attendance_sessions" ON attendance_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_attendance_records" ON attendance_records FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_image_analysis" ON image_analysis_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_failed_operations" ON failed_operations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_schema_versions" ON schema_versions FOR ALL USING (auth.role() = 'service_role');
