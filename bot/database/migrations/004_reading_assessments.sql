-- Migration: Add Reading Assessment Feature
-- Version: v2.8.0
-- Date: November 15, 2025
-- Description: Add comprehensive early-grade reading fluency assessment tables

-- =============================================================================
-- STEP 1: CREATE READING_ASSESSMENTS TABLE
-- =============================================================================

CREATE TABLE reading_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

  -- Student Management (for concurrent sessions)
  student_identifier VARCHAR(100),  -- "Student 1", "Student 2", "Ahmed", etc.
  student_number INTEGER,  -- Auto-increment per teacher (Redis-managed)
  concurrent_session_count INTEGER DEFAULT 0,  -- How many active at creation
  redis_session_key VARCHAR(255),  -- For state tracking

  -- Assessment Configuration
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 0 AND 5),
  -- 0=letters, 1=words, 2=sentences, 3=paragraph, 4=story, 5=advanced
  language VARCHAR(5) NOT NULL,  -- 'en', 'ur', 'ar', 'es'
  passage_type VARCHAR(20) NOT NULL,  -- 'letters', 'words', 'sentences', 'paragraph', 'story'

  -- Passage Info
  passage_text TEXT NOT NULL,
  passage_image_url TEXT,  -- R2: reading_passages/{userId}/{assessmentId}.png
  passage_generated_at TIMESTAMPTZ,
  passage_word_count INTEGER,  -- For benchmark comparison

  -- Audio Info
  audio_url TEXT,  -- R2: reading_audio/{userId}/{assessmentId}_{timestamp}.{ext}
  audio_duration_seconds FLOAT,
  audio_format VARCHAR(20),  -- 'opus', 'm4a', 'mp3', 'wav'
  audio_size_bytes BIGINT,
  audio_uploaded_at TIMESTAMPTZ,

  -- Audio Quality Validation (Soniox)
  num_speakers_detected INTEGER,  -- Validate single speaker (diarization)
  detected_language VARCHAR(5),  -- Validate language match
  audio_quality_score FLOAT,  -- Confidence/quality metric (0-1)
  audio_validation_warnings JSONB,  -- Array of warning messages

  -- Transcription (Soniox/Azure)
  transcript_text TEXT,
  transcript_confidence FLOAT,  -- Average word confidence
  word_timestamps JSONB,  -- [{ word, start, end, confidence, speaker }]

  -- Fluency Metrics
  total_words_in_passage INTEGER,
  words_read INTEGER,
  words_correct INTEGER,
  wcpm FLOAT,  -- Words Correct Per Minute
  accuracy_percentage FLOAT,
  time_elapsed_seconds FLOAT,

  -- Pronunciation Assessment (Azure for English)
  pronunciation_data JSONB,
  /* For English (Azure Pronunciation Assessment):
  {
    accuracyScore: float,  -- 0-100
    fluencyScore: float,   -- 0-100
    completenessScore: float,  -- 0-100
    prosodyScore: float,   -- 0-100 (en-US only)
    words: [{
      word: string,
      accuracyScore: float,
      errorType: 'None'|'Mispronunciation'|'Omission'|'Insertion',
      phonemes: [{ phoneme, accuracyScore }],
      syllables: [{ syllable, accuracyScore }]
    }]
  }
  For Urdu/Arabic/Spanish (GPT-4o audio analysis):
  {
    mispronounced_words: [{ word, timestamp, description }],
    overall_rating: 'Excellent'|'Good'|'Fair'|'Needs Support',
    confidence_level: float
  }
  */

  -- Prosody Analysis (GPT-4o for non-English, Azure for English)
  prosody_analysis JSONB,
  /* {
    hesitations: { count: int, timestamps: [float] },
    pacing: 'rushed'|'natural'|'slow',
    pacing_consistency: 'consistent'|'variable',
    expression: 'monotone'|'developing'|'expressive',
    fluency_level: 'struggling'|'developing'|'fluent',
    notes: string
  } */

  -- Error Analysis
  errors JSONB,  -- [{ type: 'omission|substitution|insertion|repetition', word, position, timestamp }]
  self_corrections_count INTEGER DEFAULT 0,  -- Positive indicator!

  -- Benchmark Comparison (L2-adjusted for Urdu)
  grade_benchmark_min INTEGER,  -- e.g., 30 cwpm for Grade 2 L2 Urdu
  grade_benchmark_max INTEGER,  -- e.g., 45 cwpm for Grade 2 L2 Urdu
  percentile_rank VARCHAR(20),  -- 'Below 10th', '10th-25th', '25th-50th', 'Above 50th'
  on_track BOOLEAN,  -- Within benchmark range
  is_second_language BOOLEAN DEFAULT TRUE,  -- Assumed true for Urdu (93% of students)

  -- Report Generation
  report_pdf_url TEXT,  -- R2: reading_reports/{userId}/{assessmentId}_report.pdf
  report_generated_at TIMESTAMPTZ,
  voice_feedback_url TEXT,  -- R2: reading_feedback/{userId}/{assessmentId}_feedback.mp3
  voice_feedback_duration_seconds INTEGER,
  voice_feedback_language VARCHAR(10),
  diagnostic_summary TEXT,  -- GPT-4 generated summary

  -- Comprehension Assessment (Optional)
  comprehension_requested BOOLEAN DEFAULT FALSE,
  comprehension_questions JSONB,  -- Generated questions
  comprehension_answers JSONB,  -- Student responses (text or audio transcripts)
  comprehension_analysis JSONB,  -- GPT-4 analysis
  comprehension_score FLOAT,  -- 0-100

  -- Processing Status & Metadata
  status VARCHAR(50) DEFAULT 'pending',
  -- 'pending', 'passage_generated', 'audio_received', 'processing',
  -- 'completed', 'failed', 'parent_shared'

  processing_started_at TIMESTAMPTZ,  -- For timeout detection
  last_successful_step VARCHAR(50),
  failed_step VARCHAR(50),
  error_message TEXT,
  can_resume BOOLEAN DEFAULT TRUE,

  -- Parent Sharing
  parent_shared BOOLEAN DEFAULT FALSE,
  parent_shared_at TIMESTAMPTZ,
  parent_message_generated TEXT,  -- Simplified parent-friendly message

  -- Cost Tracking
  transcription_cost DECIMAL(10, 6),
  pronunciation_cost DECIMAL(10, 6),
  analysis_cost DECIMAL(10, 6),
  report_cost DECIMAL(10, 6),
  voice_feedback_cost DECIMAL(10, 6),
  total_cost DECIMAL(10, 6),

  gpt4_input_tokens INTEGER,
  gpt4_output_tokens INTEGER,
  azure_api_calls INTEGER,
  soniox_duration_seconds FLOAT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary query patterns
CREATE INDEX idx_reading_assessments_user_id ON reading_assessments(user_id);
CREATE INDEX idx_reading_assessments_status ON reading_assessments(status);
CREATE INDEX idx_reading_assessments_created_at ON reading_assessments(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_reading_assessments_user_status ON reading_assessments(user_id, status, created_at DESC);
CREATE INDEX idx_reading_assessments_user_student ON reading_assessments(user_id, student_identifier);

-- Concurrent session tracking
CREATE INDEX idx_reading_concurrent ON reading_assessments(user_id, status)
  WHERE status IN ('pending', 'processing');

-- Abandoned job detection (for cleanup cron)
CREATE INDEX idx_reading_stuck_jobs ON reading_assessments(status, processing_started_at)
  WHERE status = 'processing';

-- Grade/language analytics
CREATE INDEX idx_reading_grade_lang ON reading_assessments(grade_level, language, created_at DESC)
  WHERE status = 'completed';

-- =============================================================================
-- STEP 3: ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE reading_assessments IS 'Stores early-grade reading fluency assessments based on EGRA/ASER frameworks';

COMMENT ON COLUMN reading_assessments.student_identifier IS 'Auto-generated "Student N" or teacher-provided name for concurrent session tracking';
COMMENT ON COLUMN reading_assessments.passage_type IS 'Level-based progression: letters → words → sentences → paragraph → story';
COMMENT ON COLUMN reading_assessments.word_timestamps IS 'Soniox word-level timestamps with speaker diarization for filtering teacher encouragement';
COMMENT ON COLUMN reading_assessments.pronunciation_data IS 'Azure phoneme-level data for English, GPT-4o word-level for other languages';
COMMENT ON COLUMN reading_assessments.prosody_analysis IS 'GPT-4o audio analysis for all languages (Azure prosody only for en-US)';
COMMENT ON COLUMN reading_assessments.self_corrections_count IS 'Positive indicator - shows student monitoring their reading';
COMMENT ON COLUMN reading_assessments.is_second_language IS 'Adjusted benchmarks for L2 learners (93% of Urdu students)';
COMMENT ON COLUMN reading_assessments.processing_started_at IS 'Timestamp for timeout detection in cleanup cron job';

COMMENT ON INDEX idx_reading_stuck_jobs IS 'Partial index for cleanup cron to find jobs stuck in processing >30 min';

-- =============================================================================
-- STEP 4: CREATE TRIGGER FOR AUTO-UPDATE
-- =============================================================================

CREATE TRIGGER update_reading_assessments_updated_at
BEFORE UPDATE ON reading_assessments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 5: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE reading_assessments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bot uses service_role key)
CREATE POLICY "Service role can do everything on reading_assessments" ON reading_assessments
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own assessments (for future portal integration)
CREATE POLICY "Users can view own assessments" ON reading_assessments
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- STEP 6: HELPER FUNCTIONS FOR READING WORKFLOW
-- =============================================================================

-- Function to calculate WCPM
CREATE OR REPLACE FUNCTION calculate_wcpm(
  p_words_correct INTEGER,
  p_time_seconds FLOAT
)
RETURNS FLOAT AS $$
BEGIN
  IF p_time_seconds <= 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((p_words_correct::FLOAT / p_time_seconds * 60)::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_wcpm IS 'Calculate Words Correct Per Minute from correct words and time';

-- Function to determine benchmark status
CREATE OR REPLACE FUNCTION check_benchmark_status(
  p_wcpm FLOAT,
  p_grade INTEGER,
  p_language VARCHAR(5),
  p_is_l2 BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  benchmark_min INTEGER,
  benchmark_max INTEGER,
  on_track BOOLEAN,
  percentile_rank VARCHAR(20)
) AS $$
DECLARE
  v_min INTEGER;
  v_max INTEGER;
  v_on_track BOOLEAN;
  v_percentile VARCHAR(20);
BEGIN
  -- L2-adjusted benchmarks for Urdu (25-30% lower than L1)
  IF p_language = 'ur' AND p_is_l2 THEN
    CASE p_grade
      WHEN 1 THEN v_min := 15; v_max := 25;
      WHEN 2 THEN v_min := 30; v_max := 45;
      WHEN 3 THEN v_min := 45; v_max := 70;
      ELSE v_min := 0; v_max := 0;
    END CASE;
  -- Standard English benchmarks (Hasbrouck-Tindal)
  ELSIF p_language = 'en' THEN
    CASE p_grade
      WHEN 1 THEN v_min := 20; v_max := 53;
      WHEN 2 THEN v_min := 51; v_max := 89;
      WHEN 3 THEN v_min := 71; v_max := 107;
      WHEN 4 THEN v_min := 94; v_max := 123;
      WHEN 5 THEN v_min := 110; v_max := 139;
      ELSE v_min := 0; v_max := 0;
    END CASE;
  -- Generic benchmarks for other languages
  ELSE
    CASE p_grade
      WHEN 1 THEN v_min := 15; v_max := 30;
      WHEN 2 THEN v_min := 30; v_max := 50;
      WHEN 3 THEN v_min := 50; v_max := 80;
      ELSE v_min := 0; v_max := 0;
    END CASE;
  END IF;

  -- Determine if on track
  v_on_track := p_wcpm >= v_min AND p_wcpm <= v_max;

  -- Determine percentile rank
  IF p_wcpm < v_min * 0.10 THEN
    v_percentile := 'Below 10th';
  ELSIF p_wcpm < v_min * 0.25 THEN
    v_percentile := '10th-25th';
  ELSIF p_wcpm < v_min * 0.50 THEN
    v_percentile := '25th-50th';
  ELSIF p_wcpm >= v_min THEN
    v_percentile := 'Above 50th';
  ELSE
    v_percentile := 'Below 25th';
  END IF;

  -- Return results
  benchmark_min := v_min;
  benchmark_max := v_max;
  on_track := v_on_track;
  percentile_rank := v_percentile;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION check_benchmark_status IS 'Determines benchmark status with L2-adjusted thresholds for Urdu';

-- =============================================================================
-- STEP 7: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v2.8.0', 'Add Reading Assessment feature with EGRA/ASER-aligned fluency testing');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. reading_assessments table for storing reading fluency assessments
-- 2. Comprehensive indexes for performance and concurrent session management
-- 3. Helper functions for WCPM calculation and L2-adjusted benchmarks
-- 4. Speaker diarization support (filter teacher encouragement)
-- 5. Dual-mode pronunciation: Azure (English) vs Soniox+GPT-4o (other languages)

-- Key Features:
-- - EGRA/ASER framework alignment (oral reading fluency)
-- - L2-adjusted benchmarks for Urdu (93% of students learn it as second language)
-- - Speaker diarization to handle teacher encouragement
-- - Concurrent session support (multiple students assessed simultaneously)
-- - Parent sharing capability with simplified messages
-- - Cost tracking per assessment
-- - Timeout detection for abandoned jobs (cleanup cron)

-- Processing Architecture:
-- - Redis locks prevent duplicate processing (see session management doc)
-- - SQS visibility timeout extension prevents resurrection
-- - Idempotency checks in worker
-- - Cleanup cron job resets stuck jobs >30 min

-- Language Support:
-- - English: Azure Pronunciation Assessment (phoneme-level accuracy + prosody)
-- - Urdu/Arabic/Spanish: Soniox transcription + GPT-4o audio analysis (word-level)
-- - Urdu: No diacritics in passages (matches Pakistani textbook format)

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify tables created successfully:
--    SELECT * FROM schema_versions WHERE version = 'v2.8.0';
-- 3. Test helper functions:
--    SELECT * FROM calculate_wcpm(45, 60); -- Should return 45.00
--    SELECT * FROM check_benchmark_status(45, 2, 'ur', TRUE);
-- 4. Deploy reading assessment worker code
-- 5. Monitor assessment health:
--    SELECT status, COUNT(*) FROM reading_assessments GROUP BY status;

-- =============================================================================
-- ROLLBACK (if needed - use with caution!)
-- =============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS check_benchmark_status(FLOAT, INTEGER, VARCHAR, BOOLEAN);
-- DROP FUNCTION IF EXISTS calculate_wcpm(INTEGER, FLOAT);
-- DROP TABLE IF EXISTS reading_assessments CASCADE;
-- DELETE FROM schema_versions WHERE version = 'v2.8.0';
