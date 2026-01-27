-- Fix for ambiguous column reference in claim_next_coaching_job function
-- Run this after the main migration

DROP FUNCTION IF EXISTS claim_next_coaching_job(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION claim_next_coaching_job(
  p_worker_id TEXT,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS SETOF coaching_processing_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE coaching_processing_queue
  SET
    status = 'processing',
    started_at = NOW(),
    processing_worker_id = p_worker_id,
    attempts = coaching_processing_queue.attempts + 1
  WHERE coaching_processing_queue.id = (
    SELECT q.id
    FROM coaching_processing_queue q
    WHERE q.status = 'pending'
      AND q.attempts < p_max_attempts
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= NOW())
    ORDER BY q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_next_coaching_job IS 'Atomically claims next pending job for processing using FOR UPDATE SKIP LOCKED';
