-- =============================================================================
-- Rumi Platform - Complete Database Schema
-- Version: 1.0.0
-- Database: Supabase (PostgreSQL)
-- Run this entire file in Supabase SQL Editor to create all tables.
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. USERS AND REGISTRATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  grade VARCHAR(50),
  subject VARCHAR(100),
  preferred_language VARCHAR(10) DEFAULT 'en',
  registration_completed BOOLEAN DEFAULT FALSE,
  registration_started_at TIMESTAMP,
  registration_completed_at TIMESTAMP,
  grades_taught TEXT,
  language_nudge_sent BOOLEAN DEFAULT FALSE,
  first_message_at TIMESTAMP,
  session_id VARCHAR(100),
  source VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 2. CHAT SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  session_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 3. CONVERSATION HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(20),
  format VARCHAR(20) DEFAULT 'text',
  language VARCHAR(10),
  current_state VARCHAR(50),
  input_format VARCHAR(10),
  input_language VARCHAR(10),
  output_format VARCHAR(10),
  output_language VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 4. COACHING SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id),
  audio_url VARCHAR(500),
  audio_duration_seconds INTEGER,
  audio_format VARCHAR(20),
  audio_size_bytes BIGINT,
  transcript_text TEXT,
  transcript_language VARCHAR(10),
  diarization_data JSONB,
  diarization_confidence FLOAT,
  lesson_plan_url VARCHAR(500),
  lesson_plan_text TEXT,
  lesson_plan_r2_key VARCHAR(500),
  lesson_plan_excerpt TEXT,
  lesson_plan_structured JSONB,
  lesson_plan_format VARCHAR(20),
  has_lesson_plan BOOLEAN DEFAULT FALSE,
  analysis_data JSONB,
  conversation_state JSONB,
  report_pdf_url VARCHAR(500),
  report_generated_at TIMESTAMP,
  voice_debrief_url VARCHAR(500),
  voice_debrief_duration_seconds INTEGER,
  voice_debrief_language VARCHAR(10),
  status VARCHAR(30) DEFAULT 'pending',
  last_successful_step VARCHAR(50),
  failed_step VARCHAR(50),
  error_message TEXT,
  can_resume BOOLEAN DEFAULT TRUE,
  transcription_cost DECIMAL(10,4),
  analysis_cost DECIMAL(10,4),
  total_cost DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  transcription_started_at TIMESTAMP,
  transcription_completed_at TIMESTAMP,
  analysis_started_at TIMESTAMP,
  analysis_completed_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 5. COACHING PROCESSING QUEUE
-- =============================================================================

CREATE TABLE IF NOT EXISTS coaching_processing_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coaching_session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  processing_worker_id VARCHAR(100),
  error_message TEXT,
  error_stack TEXT,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP
);

-- =============================================================================
-- 6. COACHING QUALITY METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS coaching_quality_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coaching_session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  diarization_confidence FLOAT,
  processing_time_seconds FLOAT,
  transcription_time_seconds FLOAT,
  analysis_time_seconds FLOAT,
  report_generation_time_seconds FLOAT,
  user_satisfaction_rating INTEGER,
  user_feedback TEXT,
  worker_id VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  had_errors BOOLEAN DEFAULT FALSE,
  session_cost DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 7. AUDIO SESSIONS (legacy, referenced by teacher_progress)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audio_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  audio_url VARCHAR(500),
  audio_duration_seconds INTEGER,
  transcript TEXT,
  analysis_report JSONB,
  voice_summary_url VARCHAR(500),
  pdf_report_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- =============================================================================
-- 8. READING ASSESSMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS reading_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_name VARCHAR(100),
  student_grade VARCHAR(20),
  language VARCHAR(10) DEFAULT 'en',
  passage_text TEXT,
  passage_title VARCHAR(200),
  passage_word_count INTEGER,
  audio_url VARCHAR(500),
  audio_duration_seconds INTEGER,
  transcript_text TEXT,
  assessment_data JSONB,
  wcpm FLOAT,
  accuracy_percentage FLOAT,
  fluency_score FLOAT,
  comprehension_score FLOAT,
  errors_data JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- =============================================================================
-- 9. WCPM PERCENTILE BENCHMARKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS wcpm_percentiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade VARCHAR(20) NOT NULL,
  percentile INTEGER NOT NULL,
  fall_wcpm FLOAT,
  winter_wcpm FLOAT,
  spring_wcpm FLOAT,
  source VARCHAR(100) DEFAULT 'DIBELS',
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 10. LESSON PLANS AND PRESENTATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS lesson_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(200) NOT NULL,
  grade VARCHAR(20),
  subject VARCHAR(50),
  type VARCHAR(20),
  gamma_url VARCHAR(500),
  pdf_url VARCHAR(500),
  content JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 11. TEACHER PROGRESS TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS teacher_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dimension VARCHAR(50),
  score FLOAT,
  evidence TEXT,
  session_id UUID REFERENCES audio_sessions(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 12. TEACHER FACTS (semantic memory)
-- =============================================================================

CREATE TABLE IF NOT EXISTS teacher_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category VARCHAR(50),
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, fact)
);

-- =============================================================================
-- 13. VIDEO LIBRARY
-- =============================================================================

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(200) NOT NULL,
  url VARCHAR(500) NOT NULL,
  grade VARCHAR(20),
  subject VARCHAR(50),
  topic VARCHAR(100),
  source VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 14. VIDEO REQUESTS (AI video generation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(500),
  language VARCHAR(10) DEFAULT 'en',
  style VARCHAR(50) DEFAULT 'infographic',
  status VARCHAR(30) DEFAULT 'pending',
  script_data JSONB,
  video_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 15. STUDENT VIDEOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_request_id UUID REFERENCES video_requests(id),
  title VARCHAR(500),
  video_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  language VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 16. EXAM CHECKER
-- =============================================================================

CREATE TABLE IF NOT EXISTS exam_check_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) DEFAULT 'collecting_images',
  subject VARCHAR(100),
  class_name VARCHAR(50),
  exam_date DATE,
  board VARCHAR(100),
  original_images JSONB,
  marking_scheme JSONB,
  detected_students TEXT[],
  confirmed_students TEXT[],
  detected_questions JSONB,
  ocr_provider VARCHAR(50),
  ocr_confidence FLOAT,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_check_sessions(id) ON DELETE CASCADE,
  student_name VARCHAR(100),
  image_urls TEXT[],
  page_numbers INTEGER[],
  extracted_text TEXT,
  extracted_answers JSONB,
  answer_positions JSONB,
  annotated_image_urls TEXT[],
  thumbnail_urls TEXT[],
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES exam_submissions(id) ON DELETE CASCADE,
  question_id VARCHAR(50),
  question_type VARCHAR(20),
  max_marks DECIMAL(5,1),
  awarded_marks DECIMAL(5,1),
  is_correct BOOLEAN,
  is_partial BOOLEAN DEFAULT FALSE,
  grading_rationale TEXT,
  confidence FLOAT,
  feedback_up TEXT,
  feedback_back TEXT,
  feedback_forward TEXT,
  answer_bbox JSONB,
  original_marks DECIMAL(5,1),
  edited_by UUID REFERENCES users(id),
  edited_at TIMESTAMP,
  edit_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200),
  subject VARCHAR(100),
  class_name VARCHAR(50),
  board VARCHAR(100),
  marking_scheme JSONB,
  total_marks DECIMAL(6,1),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 17. ATTENDANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  class_name VARCHAR(100) NOT NULL,
  section VARCHAR(20),
  academic_year VARCHAR(10) NOT NULL,
  attendance_frequency VARCHAR(10) DEFAULT 'once' CHECK (attendance_frequency IN ('once', 'twice')),
  student_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID REFERENCES student_lists(id) ON DELETE CASCADE,
  roll_number INTEGER,
  student_name VARCHAR(200) NOT NULL,
  father_name VARCHAR(200),
  student_name_urdu TEXT,
  father_name_urdu TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  list_id UUID REFERENCES student_lists(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  session_type VARCHAR(20) DEFAULT 'full_day' CHECK (session_type IN ('morning', 'afternoon', 'full_day')),
  audio_url TEXT,
  transcript TEXT,
  transcript_confidence DECIMAL(3,2),
  excel_url TEXT,
  total_students INTEGER,
  present_count INTEGER,
  absent_count INTEGER,
  was_manually_edited BOOLEAN DEFAULT FALSE,
  marking_method VARCHAR(20) CHECK (marking_method IN ('voice', 'tap', 'everyone_present')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  student_name VARCHAR(200),
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  confidence DECIMAL(3,2) DEFAULT 1.00,
  detected_response TEXT,
  was_manually_changed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 18. IMAGE ANALYSIS REQUESTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS image_analysis_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url VARCHAR(500),
  image_r2_key VARCHAR(500),
  analysis_type VARCHAR(50) DEFAULT 'general',
  prompt TEXT,
  response TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- =============================================================================
-- 19. FAILED OPERATIONS (dead letter queue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS failed_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(20),
  operation VARCHAR(100),
  error_message TEXT,
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 20. SCHEMA VERSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_versions (
  id SERIAL,
  version VARCHAR(20) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64)
);

-- =============================================================================
-- 21. LESSON PLAN REQUESTS (async job queue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lesson_plan_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20),
  topic VARCHAR(500) NOT NULL,
  full_message TEXT,
  language VARCHAR(10) DEFAULT 'en',
  content_type VARCHAR(30) DEFAULT 'lesson_plan',
  status VARCHAR(30) DEFAULT 'pending',
  gamma_url VARCHAR(500),
  pdf_url VARCHAR(500),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  processing_started_at TIMESTAMP,
  completed_at TIMESTAMP,
  last_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE lesson_plan_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 22. VIDEO TASKS (video generation task persistence)
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_request_id UUID REFERENCES video_requests(id) ON DELETE CASCADE,
  filename VARCHAR(200) NOT NULL,
  task_id VARCHAR(200),
  task_type VARCHAR(20) DEFAULT 'image',
  status VARCHAR(30) DEFAULT 'polling',
  result_url VARCHAR(500),
  ephemeral_url VARCHAR(500),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(video_request_id, filename)
);

ALTER TABLE video_tasks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 23. BROADCAST MESSAGES (broadcast delivery tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_id VARCHAR(200),
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  replied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 24. USER FEATURE FIRST USE (onboarding intro tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_feature_first_use (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feature VARCHAR(50) NOT NULL,
  video_shown_at TIMESTAMP,
  feature_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, feature)
);

ALTER TABLE user_feature_first_use ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 25. FEATURE SUGGESTIONS (cross-feature recommendation tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS feature_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  suggested_feature VARCHAR(50) NOT NULL,
  trigger_type VARCHAR(30),
  confidence_score FLOAT,
  message_context TEXT,
  was_shown BOOLEAN DEFAULT FALSE,
  was_clicked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE feature_suggestions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 26. A/B TESTS (multi-armed bandit experiment definitions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 27. A/B TEST VARIANTS (experiment arms with Thompson Sampling stats)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ab_test_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_name VARCHAR(100) NOT NULL,
  variant_content JSONB,
  successes INTEGER DEFAULT 1,
  failures INTEGER DEFAULT 1,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(test_id, variant_name)
);

ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 28. A/B TEST EVENTS (experiment event log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ab_test_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_name VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  phone_number VARCHAR(20),
  event_type VARCHAR(30) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ab_test_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 29. CHAT STARTS (website-to-WhatsApp funnel tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_starts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20),
  session_id VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE chat_starts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_format_language ON conversations(input_format, input_language, output_format, output_language);
CREATE INDEX IF NOT EXISTS idx_audio_sessions_user_created ON audio_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_user_created ON lesson_plans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_progress_user_dimension ON teacher_progress(user_id, dimension, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_facts_user ON teacher_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_grade_subject ON videos(grade, subject);
CREATE INDEX IF NOT EXISTS idx_failed_operations_created ON failed_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user ON coaching_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_status ON coaching_sessions(status);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_user ON reading_assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_date ON attendance_sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plan_requests_user ON lesson_plan_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plan_requests_status ON lesson_plan_requests(status);
CREATE INDEX IF NOT EXISTS idx_video_tasks_request ON video_tasks(video_request_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_message_id ON broadcast_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_user ON broadcast_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast ON broadcast_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_first_use_user ON user_feature_first_use(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_user ON feature_suggestions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_tests_name ON ab_tests(test_name);
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test ON ab_test_variants(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON ab_test_events(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_starts_user ON chat_starts(user_id, created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_facts_updated_at BEFORE UPDATE ON teacher_facts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coaching_sessions_updated_at BEFORE UPDATE ON coaching_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RECORD SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('1.0.0', 'Rumi Platform open-source consolidated schema')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_versions (version, description)
VALUES ('1.1.0', 'Add missing tables: lesson_plan_requests, video_tasks, broadcast_messages, user_feature_first_use, feature_suggestions, ab_tests, ab_test_variants, ab_test_events, chat_starts')
ON CONFLICT (version) DO NOTHING;
