-- Migration: Add image_analysis_requests table
-- Date: January 19, 2026
-- Purpose: Store image analysis requests for multimodal vision feature
-- Run: Use the Supabase SQL Editor or: node infrastructure/scripts/run-migration.js bot/database/migrations/20260119_add_image_analysis_requests.sql

BEGIN;

CREATE TABLE IF NOT EXISTS image_analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Image storage (survives retries)
  image_url TEXT NOT NULL,
  image_metadata JSONB DEFAULT '{}',
  -- {whatsappMediaId, mimeType, caption, sizeBytes, uploadedAt}

  -- Processing state
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Results
  analysis_result JSONB,
  -- {success, analysis, usage: {promptTokens, completionTokens}, model, detail}
  tokens_used INTEGER,

  -- Correlation for debugging
  correlation_id VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for stale job recovery (if we add async later)
CREATE INDEX IF NOT EXISTS idx_image_requests_status_started
ON image_analysis_requests(status, started_at)
WHERE status = 'processing';

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_image_requests_user
ON image_analysis_requests(user_id, created_at DESC);

-- Trigger for updated_at (check if function exists first)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END
$$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_image_requests_updated_at ON image_analysis_requests;
CREATE TRIGGER update_image_requests_updated_at
  BEFORE UPDATE ON image_analysis_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
