-- Migration: Add Classroom Coaching Feature
-- Version: v3.3.0
-- Date: January 6, 2025
-- Description: Add comprehensive classroom observation and pedagogical coaching tables

-- =============================================================================
-- STEP 1: CREATE COACHING_SESSIONS TABLE
-- =============================================================================

CREATE TABLE coaching_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

  -- Audio metadata
  audio_url VARCHAR(500),  -- R2: classroom_audio/{userId}/{YYYY-MM}/{sessionId}_{timestamp}.ext
  audio_duration_seconds INTEGER,
  audio_format VARCHAR(20),  -- 'opus', 'm4a', 'mp3', 'wav'
  audio_size_bytes BIGINT,

  -- Transcription data
  transcript_text TEXT,
  transcript_language VARCHAR(10),  -- 'en', 'ur', 'mixed'
  diarization_data JSONB,  -- {speakers: [{id, label, segments: [{start, end, text}]}]}
  diarization_confidence FLOAT,

  -- Lesson plan (optional)
  lesson_plan_url VARCHAR(500),  -- R2: lesson_plans/{userId}/{sessionId}_lesson_plan.pdf
  lesson_plan_text TEXT,
  lesson_plan_r2_key TEXT,
  lesson_plan_excerpt TEXT,
  lesson_plan_structured JSONB,
  lesson_plan_format VARCHAR(20),  -- 'pdf', 'docx', null
  has_lesson_plan BOOLEAN DEFAULT FALSE,
  lesson_plan_word_count INTEGER,
  lesson_plan_extraction_status VARCHAR(20),
  lesson_plan_extraction_error TEXT,

  -- Pedagogical analysis
  analysis_data JSONB,  -- Structured analysis from GPT-5 mini
  /*
  {
    executive_summary: string,
    talk_time: { teacher_percentage: float, student_percentage: float },
    questions: { open_ended_count: int, closed_ended_count: int, examples: [] },
    strengths: [{ title, evidence, analysis, impact }],
    growth_opportunities: [{ area, observation, rationale, strategies: [] }],
    scores: { planning: 1-4, environment: 1-4, instruction: 1-4, overall: 1-4 },
    recommendations: []
  }
  */

  -- Reflective conversation
  conversation_state JSONB,
  /*
  {
    current_state: 'AWAITING_CONFIRMATION' | 'AWAITING_LESSON_PLAN' | 'TRANSCRIBING' |
                   'ANALYZING' | 'REFLECTIVE_QUESTION_1' | 'REFLECTIVE_QUESTION_2' |
                   'REFLECTIVE_QUESTION_3' | 'GENERATING_REPORT' | 'COMPLETED',
    questions_answered: int,
    questions: [{ question, answer, format: 'text'|'voice', answered_at }],
    skipped: boolean,
    started_at: timestamp,
    last_interaction: timestamp
  }
  */

  -- Generated outputs
  report_pdf_url VARCHAR(500),  -- R2: Generated observation report
  report_generated_at TIMESTAMPTZ,
  voice_debrief_url VARCHAR(500),  -- R2: voice_debriefs/{userId}/{sessionId}_debrief.mp3
  voice_debrief_duration_seconds INTEGER,
  voice_debrief_language VARCHAR(10),

  -- Processing metadata
  status VARCHAR(50) DEFAULT 'initiated',
  -- 'initiated', 'awaiting_confirmation', 'confirmed', 'transcribing', 'transcription_complete',
  -- 'awaiting_lesson_plan', 'analyzing', 'analysis_complete', 'conducting_conversation',
  -- 'generating_report', 'completed', 'failed'

  last_successful_step VARCHAR(50),
  failed_step VARCHAR(50),
  error_message TEXT,
  can_resume BOOLEAN DEFAULT TRUE,

  -- Cost tracking
  transcription_cost DECIMAL(10, 6),
  analysis_cost DECIMAL(10, 6),
  total_cost DECIMAL(10, 6),
  gpt5_input_tokens INTEGER,
  gpt5_output_tokens INTEGER,
  gpt5_cached_tokens INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  transcription_started_at TIMESTAMPTZ,
  transcription_completed_at TIMESTAMPTZ,
  analysis_started_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for coaching_sessions
CREATE INDEX idx_coaching_sessions_user_id ON coaching_sessions(user_id);
CREATE INDEX idx_coaching_sessions_status ON coaching_sessions(status);
CREATE INDEX idx_coaching_sessions_created_at ON coaching_sessions(created_at DESC);
CREATE INDEX idx_coaching_sessions_user_status ON coaching_sessions(user_id, status, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE coaching_sessions IS 'Stores classroom observation and pedagogical coaching sessions';
COMMENT ON COLUMN coaching_sessions.diarization_data IS 'Speaker diarization from Soniox with speaker labels and segments';
COMMENT ON COLUMN coaching_sessions.analysis_data IS 'Structured pedagogical analysis from GPT-5 mini using Danielson Framework';
COMMENT ON COLUMN coaching_sessions.conversation_state IS 'State machine tracking for multi-turn reflective conversation';
COMMENT ON COLUMN coaching_sessions.diarization_confidence IS 'Confidence score from Soniox speaker diarization (0-100)';

-- =============================================================================
-- STEP 2: CREATE COACHING_PROCESSING_QUEUE TABLE (Background Worker)
-- =============================================================================

CREATE TABLE coaching_processing_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coaching_session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,

  -- Job metadata
  job_type VARCHAR(50) NOT NULL,
  -- 'transcription', 'analysis', 'reflective_question', 'report_generation', 'voice_debrief'

  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'

  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Worker tracking
  processing_worker_id TEXT,  -- Format: worker-{hostname}-{pid}

  -- Error handling
  error_message TEXT,
  error_stack TEXT,

  -- Job payload (optional data needed for processing)
  payload JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

-- Indexes for queue performance (CRITICAL for scalability)
CREATE INDEX idx_queue_pending_jobs ON coaching_processing_queue(status, next_retry_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_queue_processing ON coaching_processing_queue(status, processing_worker_id)
  WHERE status = 'processing';
CREATE INDEX idx_queue_session ON coaching_processing_queue(coaching_session_id);

-- Comments
COMMENT ON TABLE coaching_processing_queue IS 'Background job queue for async processing of coaching sessions';
COMMENT ON COLUMN coaching_processing_queue.processing_worker_id IS 'ID of worker currently processing this job (for distributed locking)';
COMMENT ON INDEX idx_queue_pending_jobs IS 'Partial index for fast lookup of pending jobs to claim';

-- =============================================================================
-- STEP 3: CREATE POSTGRESQL FUNCTION FOR DISTRIBUTED JOB CLAIMING
-- =============================================================================

-- This function implements SELECT FOR UPDATE SKIP LOCKED for atomic job claiming
-- Multiple workers can safely call this concurrently without race conditions

CREATE OR REPLACE FUNCTION claim_next_coaching_job(
  worker_id TEXT,
  max_attempts INTEGER DEFAULT 3
)
RETURNS SETOF coaching_processing_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE coaching_processing_queue
  SET
    status = 'processing',
    started_at = NOW(),
    processing_worker_id = worker_id,
    attempts = attempts + 1
  WHERE id = (
    SELECT id
    FROM coaching_processing_queue
    WHERE status = 'pending'
      AND attempts < max_attempts
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED  -- CRITICAL: Prevents race conditions between workers
    LIMIT 1
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_next_coaching_job IS 'Atomically claims next pending job for processing using FOR UPDATE SKIP LOCKED';

-- =============================================================================
-- STEP 4: CREATE COACHING_QUALITY_METRICS TABLE
-- =============================================================================

CREATE TABLE coaching_quality_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coaching_session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,

  -- Quality metrics
  diarization_confidence FLOAT,
  processing_time_seconds INTEGER,
  transcription_time_seconds INTEGER,
  analysis_time_seconds INTEGER,
  report_generation_time_seconds INTEGER,

  -- User feedback
  user_satisfaction_rating INTEGER,  -- 1-5 stars (optional post-MVP)
  user_feedback TEXT,

  -- System health
  worker_id TEXT,
  retry_count INTEGER DEFAULT 0,
  had_errors BOOLEAN DEFAULT FALSE,

  -- Cost metrics
  session_cost DECIMAL(10, 6),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quality analytics
CREATE INDEX idx_quality_metrics_session ON coaching_quality_metrics(coaching_session_id);
CREATE INDEX idx_quality_metrics_created ON coaching_quality_metrics(created_at DESC);

COMMENT ON TABLE coaching_quality_metrics IS 'Quality and performance metrics for monitoring coaching sessions';

-- =============================================================================
-- STEP 5: ADD TRIGGERS FOR AUTO-UPDATE
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_coaching_sessions_updated_at
BEFORE UPDATE ON coaching_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 6: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_quality_metrics ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bot uses service_role key)
CREATE POLICY "Service role can do everything on coaching_sessions" ON coaching_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on coaching_processing_queue" ON coaching_processing_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on coaching_quality_metrics" ON coaching_quality_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- STEP 7: HELPER FUNCTIONS FOR COACHING WORKFLOW
-- =============================================================================

-- Function to automatically queue a job
CREATE OR REPLACE FUNCTION queue_coaching_job(
  p_session_id UUID,
  p_job_type VARCHAR(50),
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO coaching_processing_queue (
    coaching_session_id,
    job_type,
    payload,
    status
  ) VALUES (
    p_session_id,
    p_job_type,
    p_payload,
    'pending'
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION queue_coaching_job IS 'Helper function to queue a new coaching job for background processing';

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_coaching_job(
  p_job_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE coaching_processing_queue
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as failed with retry logic
CREATE OR REPLACE FUNCTION fail_coaching_job(
  p_job_id UUID,
  p_error_message TEXT,
  p_error_stack TEXT DEFAULT NULL,
  p_retry_delay_seconds INTEGER DEFAULT 60
)
RETURNS VOID AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  -- Get current attempts
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM coaching_processing_queue
  WHERE id = p_job_id;

  -- If max attempts reached, mark as permanently failed
  IF v_attempts >= v_max_attempts THEN
    UPDATE coaching_processing_queue
    SET
      status = 'failed',
      failed_at = NOW(),
      error_message = p_error_message,
      error_stack = p_error_stack
    WHERE id = p_job_id;
  ELSE
    -- Queue for retry with exponential backoff
    UPDATE coaching_processing_queue
    SET
      status = 'pending',
      error_message = p_error_message,
      error_stack = p_error_stack,
      next_retry_at = NOW() + (p_retry_delay_seconds * POWER(2, v_attempts) || ' seconds')::INTERVAL,
      processing_worker_id = NULL
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fail_coaching_job IS 'Handles job failure with exponential backoff retry logic';

-- =============================================================================
-- STEP 8: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v3.3.0', 'Add Classroom Coaching feature with background worker queue and distributed locking');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. coaching_sessions table for storing classroom observation sessions
-- 2. coaching_processing_queue for bulletproof async job processing
-- 3. coaching_quality_metrics for monitoring and analytics
-- 4. PostgreSQL function claim_next_coaching_job() for distributed locking
-- 5. Helper functions for queue management
-- 6. Comprehensive indexes for performance at scale (1000+ concurrent users)

-- Key Features:
-- - Speaker diarization data storage
-- - GPT-5 mini analysis with token tracking
-- - Multi-turn reflective conversation state machine
-- - Cost tracking per session
-- - Error recovery with resume capability
-- - Worker health monitoring

-- Background Worker Architecture:
-- - Uses SELECT FOR UPDATE SKIP LOCKED for atomic job claiming
-- - Supports multiple worker instances (5+ on Railway)
-- - Exponential backoff retry (1s, 2s, 4s...)
-- - Graceful failure handling

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify all tables created successfully:
--    SELECT * FROM schema_versions WHERE version = 'v3.3.0';
-- 3. Test the claim function:
--    SELECT * FROM claim_next_coaching_job('test-worker-1', 3);
-- 4. Deploy background worker code (workers/coaching-processor.js)
-- 5. Monitor queue health:
--    SELECT status, COUNT(*) FROM coaching_processing_queue GROUP BY status;

-- =============================================================================
-- ROLLBACK (if needed - use with caution!)
-- =============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS fail_coaching_job(UUID, TEXT, TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS complete_coaching_job(UUID);
-- DROP FUNCTION IF EXISTS queue_coaching_job(UUID, VARCHAR, JSONB);
-- DROP FUNCTION IF EXISTS claim_next_coaching_job(TEXT, INTEGER);
-- DROP TABLE IF EXISTS coaching_quality_metrics;
-- DROP TABLE IF EXISTS coaching_processing_queue;
-- DROP TABLE IF EXISTS coaching_sessions;
-- DELETE FROM schema_versions WHERE version = 'v3.3.0';
