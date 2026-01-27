-- ============================================================================
-- Coaching Jobs Queue Table and Functions
-- Background job processing infrastructure for classroom coaching
-- ============================================================================

-- Create coaching_jobs table
CREATE TABLE IF NOT EXISTS coaching_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coaching_session_id UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('transcription', 'analysis', 'report_generation')),
  payload JSONB DEFAULT '{}'::jsonb,

  -- Job lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ DEFAULT now(), -- For retry delays

  -- Worker tracking
  worker_id TEXT,

  -- Retry logic
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  error_stack TEXT,

  -- Indexes for fast queries
  CONSTRAINT coaching_jobs_valid_dates CHECK (
    (completed_at IS NULL OR started_at IS NOT NULL) AND
    (started_at IS NULL OR started_at >= created_at)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_status ON coaching_jobs(status);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_scheduled ON coaching_jobs(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_session ON coaching_jobs(coaching_session_id);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_created ON coaching_jobs(created_at DESC);

-- ============================================================================
-- Drop existing functions (if they exist with different signatures)
-- Use CASCADE to drop all versions regardless of signature
-- ============================================================================
DROP FUNCTION IF EXISTS queue_coaching_job CASCADE;
DROP FUNCTION IF EXISTS claim_next_coaching_job CASCADE;
DROP FUNCTION IF EXISTS complete_coaching_job CASCADE;
DROP FUNCTION IF EXISTS fail_coaching_job CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_coaching_jobs CASCADE;

-- ============================================================================
-- RPC Function: Queue a new coaching job
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_coaching_job(
  p_session_id UUID,
  p_job_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Insert job
  INSERT INTO coaching_jobs (
    coaching_session_id,
    job_type,
    payload,
    status,
    created_at,
    scheduled_for
  ) VALUES (
    p_session_id,
    p_job_type,
    p_payload,
    'pending',
    now(),
    now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- ============================================================================
-- RPC Function: Claim next available job (with distributed locking)
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_next_coaching_job(
  p_worker_id TEXT,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  coaching_session_id UUID,
  job_type TEXT,
  payload JSONB,
  status TEXT,
  attempts INTEGER,
  max_attempts INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Find and claim next available job using SELECT FOR UPDATE SKIP LOCKED
  -- This prevents race conditions in distributed worker environments
  SELECT cj.id INTO v_job_id
  FROM coaching_jobs cj
  WHERE cj.status = 'pending'
    AND cj.scheduled_for <= now()
    AND cj.attempts < p_max_attempts
  ORDER BY cj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Update job status to processing
  UPDATE coaching_jobs
  SET
    status = 'processing',
    started_at = now(),
    worker_id = p_worker_id,
    attempts = coaching_jobs.attempts + 1
  WHERE coaching_jobs.id = v_job_id;

  -- Return the claimed job
  RETURN QUERY
  SELECT
    cj.id,
    cj.coaching_session_id,
    cj.job_type,
    cj.payload,
    cj.status,
    cj.attempts,
    cj.max_attempts,
    cj.created_at
  FROM coaching_jobs cj
  WHERE cj.id = v_job_id;
END;
$$;

-- ============================================================================
-- RPC Function: Mark job as completed
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_coaching_job(
  p_job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE coaching_jobs
  SET
    status = 'completed',
    completed_at = now()
  WHERE id = p_job_id;
END;
$$;

-- ============================================================================
-- RPC Function: Mark job as failed (with exponential backoff retry)
-- ============================================================================
CREATE OR REPLACE FUNCTION fail_coaching_job(
  p_job_id UUID,
  p_error_message TEXT,
  p_error_stack TEXT DEFAULT NULL,
  p_retry_delay_seconds INTEGER DEFAULT 60
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  -- Get current attempt count
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM coaching_jobs
  WHERE id = p_job_id;

  -- Check if we should retry
  IF v_attempts < v_max_attempts THEN
    -- Retry: Set back to pending with delay
    UPDATE coaching_jobs
    SET
      status = 'pending',
      error_message = p_error_message,
      error_stack = p_error_stack,
      scheduled_for = now() + (p_retry_delay_seconds || ' seconds')::interval
    WHERE id = p_job_id;
  ELSE
    -- Max attempts reached: Mark as permanently failed
    UPDATE coaching_jobs
    SET
      status = 'failed',
      completed_at = now(),
      error_message = p_error_message,
      error_stack = p_error_stack
    WHERE id = p_job_id;
  END IF;
END;
$$;

-- ============================================================================
-- Cleanup function: Delete old completed jobs (run periodically)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_coaching_jobs(
  p_days_old INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM coaching_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < now() - (p_days_old || ' days')::interval;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- Grant permissions (adjust based on your RLS setup)
-- ============================================================================
-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON coaching_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION queue_coaching_job(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_next_coaching_job(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_coaching_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fail_coaching_job(UUID, TEXT, TEXT, INTEGER) TO authenticated;

-- Grant access to service_role (for workers)
GRANT ALL ON coaching_jobs TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

COMMENT ON TABLE coaching_jobs IS 'Background job queue for classroom coaching processing';
COMMENT ON FUNCTION queue_coaching_job(UUID, TEXT, JSONB) IS 'Queue a new coaching job for background processing';
COMMENT ON FUNCTION claim_next_coaching_job(TEXT, INTEGER) IS 'Claim next available job using distributed locking (SELECT FOR UPDATE SKIP LOCKED)';
COMMENT ON FUNCTION complete_coaching_job(UUID) IS 'Mark a job as successfully completed';
COMMENT ON FUNCTION fail_coaching_job(UUID, TEXT, TEXT, INTEGER) IS 'Mark a job as failed with exponential backoff retry logic';
