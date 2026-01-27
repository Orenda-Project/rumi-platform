-- Migration: Add Row-Level Locking for Reading Assessments
-- Version: Bug #34 Fix
-- Date: November 18, 2025
-- Description: Prevent concurrent processing of reading assessments through row-level locks

-- =============================================================================
-- BACKGROUND: BUG #34 - DATA MIXUP ISSUE
-- =============================================================================

-- PROBLEM:
-- Student 21's assessment data (transcript, audio) was mixed with Manto Hassan's.
-- Root cause: Concurrent workers processed two assessments simultaneously without
-- proper row-level locking, leading to stale reads and data mixup.

-- SOLUTION:
-- Add helper function to acquire row-level locks using SELECT FOR UPDATE SKIP LOCKED.
-- This ensures only ONE worker can process a given assessment at a time.

-- =============================================================================
-- STEP 1: CREATE FUNCTION TO ACQUIRE ASSESSMENT LOCK
-- =============================================================================

CREATE OR REPLACE FUNCTION acquire_assessment_lock(
  p_assessment_id UUID,
  p_expected_status VARCHAR(50)
)
RETURNS TABLE (
  locked BOOLEAN,
  assessment_data JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_assessment RECORD;
  v_locked BOOLEAN := FALSE;
  v_data JSONB;
  v_error TEXT := NULL;
BEGIN
  -- Attempt to acquire row-level lock with SKIP LOCKED
  -- If another worker already holds the lock, this will return immediately
  SELECT * INTO v_assessment
  FROM reading_assessments
  WHERE id = p_assessment_id
    AND status = p_expected_status
  FOR UPDATE SKIP LOCKED;

  IF v_assessment.id IS NULL THEN
    -- Lock not acquired (either assessment doesn't exist, status changed, or already locked)

    -- Check if assessment exists at all
    SELECT status INTO v_assessment
    FROM reading_assessments
    WHERE id = p_assessment_id;

    IF v_assessment.status IS NULL THEN
      v_error := 'Assessment not found';
    ELSIF v_assessment.status != p_expected_status THEN
      v_error := format('Status mismatch: expected %s, found %s', p_expected_status, v_assessment.status);
    ELSE
      v_error := 'Assessment locked by another worker';
    END IF;

    locked := FALSE;
    assessment_data := NULL;
    error_message := v_error;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock acquired successfully
  -- Validate assessment age (reject if >30 minutes old)
  IF v_assessment.created_at < NOW() - INTERVAL '30 minutes' THEN
    v_error := format('Assessment too old: %s minutes',
                     EXTRACT(EPOCH FROM (NOW() - v_assessment.created_at)) / 60);
    locked := FALSE;
    assessment_data := NULL;
    error_message := v_error;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Convert assessment record to JSONB
  v_data := jsonb_build_object(
    'id', v_assessment.id,
    'user_id', v_assessment.user_id,
    'session_id', v_assessment.session_id,
    'student_identifier', v_assessment.student_identifier,
    'grade_level', v_assessment.grade_level,
    'language', v_assessment.language,
    'passage_text', v_assessment.passage_text,
    'passage_word_count', v_assessment.passage_word_count,
    'audio_url', v_assessment.audio_url,
    'audio_duration_seconds', v_assessment.audio_duration_seconds,
    'status', v_assessment.status,
    'created_at', v_assessment.created_at,
    'processing_started_at', v_assessment.processing_started_at
  );

  -- Return success
  locked := TRUE;
  assessment_data := v_data;
  error_message := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_assessment_lock IS 'Acquires row-level lock on reading assessment, validates state, returns assessment data. Returns locked=false if already locked by another worker. Part of Bug #34 fix.';

-- =============================================================================
-- STEP 2: CREATE INDEX FOR LOCK QUERIES
-- =============================================================================

-- Optimize the SELECT FOR UPDATE query performance
CREATE INDEX IF NOT EXISTS idx_reading_assessments_lock_query
ON reading_assessments(id, status)
WHERE status IN ('passage_generated', 'audio_received', 'processing');

COMMENT ON INDEX idx_reading_assessments_lock_query IS 'Optimizes row-level lock acquisition queries (Bug #34 fix)';

-- =============================================================================
-- STEP 3: ADD FUNCTION TO SAFELY UPDATE STATUS WITH TIMESTAMP
-- =============================================================================

CREATE OR REPLACE FUNCTION update_assessment_status(
  p_assessment_id UUID,
  p_new_status VARCHAR(50),
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE reading_assessments
  SET
    status = p_new_status,
    processing_started_at = CASE
      WHEN p_new_status = 'processing' THEN NOW()
      WHEN p_new_status IN ('completed', 'failed') THEN processing_started_at -- Preserve original
      ELSE processing_started_at
    END,
    completed_at = CASE
      WHEN p_new_status = 'completed' THEN NOW()
      ELSE completed_at
    END,
    error_message = p_error_message,
    updated_at = NOW()
  WHERE id = p_assessment_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_assessment_status IS 'Safely updates assessment status with appropriate timestamps. Part of Bug #34 fix.';

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

-- Example 1: Acquire lock for processing
-- SELECT * FROM acquire_assessment_lock('8ac3adee-bb71-4785-aa01-8e6883819cec', 'passage_generated');

-- Expected results:
-- locked=true: Lock acquired, proceed with processing
-- locked=false, error='Assessment locked by another worker': Another worker is processing
-- locked=false, error='Status mismatch: expected passage_generated, found processing': Assessment already being processed
-- locked=false, error='Assessment too old: 35 minutes': Assessment expired

-- Example 2: Update status after processing
-- SELECT update_assessment_status('8ac3adee-bb71-4785-aa01-8e6883819cec', 'processing');
-- SELECT update_assessment_status('8ac3adee-bb71-4785-aa01-8e6883819cec', 'completed');

-- =============================================================================
-- DEPLOYMENT NOTES
-- =============================================================================

-- This migration adds:
-- 1. acquire_assessment_lock() - Row-level lock function with validation
-- 2. update_assessment_status() - Safe status updates with timestamps
-- 3. Index optimization for lock queries

-- Integration required in reading-assessment.service.js:
-- - Call acquire_assessment_lock() before processing audio
-- - Check locked=true before proceeding
-- - Handle locked=false cases appropriately
-- - Use update_assessment_status() for all status changes

-- Benefits:
-- - Prevents concurrent workers from processing same assessment
-- - Validates assessment age and state before locking
-- - Returns detailed error messages for debugging
-- - Zero-wait lock acquisition (SKIP LOCKED)
-- - Automatic transaction rollback releases lock

-- Testing:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Test lock acquisition:
--    SELECT * FROM acquire_assessment_lock('<assessment_id>', 'passage_generated');
-- 3. In another session, try acquiring same lock (should return locked=false)
-- 4. Commit/rollback first transaction, retry (should return locked=true)

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS update_assessment_status(UUID, VARCHAR, TEXT);
-- DROP FUNCTION IF EXISTS acquire_assessment_lock(UUID, VARCHAR);
-- DROP INDEX IF EXISTS idx_reading_assessments_lock_query;
