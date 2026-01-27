-- Rumi WhatsApp Bot - Database Schema
-- Version: v3.0
-- Database: Supabase (PostgreSQL)
-- Created: November 3, 2025

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS AND REGISTRATION
-- =============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  grade VARCHAR(20),  -- e.g., "Grade 3", "Grade 4-5"
  subject VARCHAR(50),  -- e.g., "Math", "Science", "General"
  registration_completed BOOLEAN DEFAULT FALSE,
  registration_started_at TIMESTAMP,
  registration_completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- CONVERSATION HISTORY (for stateful memory)
-- =============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  message_type VARCHAR(20),  -- 'text', 'voice', 'image'
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- AUDIO COACHING SESSIONS
-- =============================================================================

CREATE TABLE audio_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  audio_url VARCHAR(500),  -- Cloudflare R2 URL
  audio_duration_seconds INTEGER,
  transcript TEXT,
  analysis_report JSONB,  -- Stores structured feedback
  voice_summary_url VARCHAR(500),  -- Generated Urdu audio summary
  pdf_report_url VARCHAR(500),  -- Generated PDF report
  status VARCHAR(20) DEFAULT 'processing',  -- processing, completed, failed
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- =============================================================================
-- LESSON PLANS AND PRESENTATIONS
-- =============================================================================

CREATE TABLE lesson_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(200) NOT NULL,
  grade VARCHAR(20),
  subject VARCHAR(50),
  type VARCHAR(20),  -- 'lesson_plan' or 'presentation'
  gamma_url VARCHAR(500),  -- Gamma.app presentation URL
  content JSONB,  -- Stores lesson plan structure
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- TEACHER PROGRESS TRACKING (for longitudinal analysis)
-- =============================================================================

CREATE TABLE teacher_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dimension VARCHAR(50),  -- e.g., 'questioning', 'pacing', 'engagement'
  score FLOAT,  -- 0-5 scale
  evidence TEXT,  -- Specific examples from audio
  session_id UUID REFERENCES audio_sessions(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- TEACHER FACTS (semantic memory)
-- =============================================================================

CREATE TABLE teacher_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category VARCHAR(50),  -- 'challenge', 'preference', 'context', etc.
  confidence FLOAT,  -- 0-1
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, fact)
);

-- =============================================================================
-- VIDEO LIBRARY (for media agent)
-- =============================================================================

CREATE TABLE videos (
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
-- FAILED OPERATIONS (dead letter queue for error tracking)
-- =============================================================================

CREATE TABLE failed_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(20),  -- phone number
  operation VARCHAR(100),
  error_message TEXT,
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_conversations_user_created ON conversations(user_id, created_at DESC);
CREATE INDEX idx_audio_sessions_user_created ON audio_sessions(user_id, created_at DESC);
CREATE INDEX idx_lesson_plans_user_created ON lesson_plans(user_id, created_at DESC);
CREATE INDEX idx_teacher_progress_user_dimension ON teacher_progress(user_id, dimension, created_at DESC);
CREATE INDEX idx_teacher_facts_user ON teacher_facts(user_id);
CREATE INDEX idx_videos_grade_subject ON videos(grade, subject);
CREATE INDEX idx_failed_operations_created ON failed_operations(created_at DESC);

-- =============================================================================
-- UPDATED_AT TRIGGER (for automatic timestamp updates)
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

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_operations ENABLE ROW LEVEL SECURITY;

-- For now, allow service_role full access (bot will use service_role key)
-- In the future, can add more granular policies for admin dashboard

-- Service role can do everything
CREATE POLICY "Service role can do everything on users" ON users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on conversations" ON conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on audio_sessions" ON audio_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on lesson_plans" ON lesson_plans
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on teacher_progress" ON teacher_progress
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on teacher_facts" ON teacher_facts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on videos" ON videos
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on failed_operations" ON failed_operations
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SAMPLE DATA (optional - for testing)
-- =============================================================================

-- Uncomment to add sample data for testing

-- INSERT INTO users (phone_number, name, grade, subject, registration_completed, registration_completed_at)
-- VALUES
--   ('923001234567', 'Test Teacher', 'Grade 4', 'Math', true, NOW());

-- =============================================================================
-- SCHEMA VERSION TRACKING
-- =============================================================================

CREATE TABLE schema_versions (
  version VARCHAR(20) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW(),
  description TEXT
);

INSERT INTO schema_versions (version, description)
VALUES ('v3.0.0', 'Initial v3.0 schema with all tables for agent-based architecture');

-- =============================================================================
-- COMPLETION
-- =============================================================================

-- Schema creation complete!
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify all tables created successfully
-- 3. Test connection from Node.js application
