-- Video Requests Table Migration
-- Created: December 23, 2025
-- Purpose: Track educational video generation requests and pipeline progress

-- Create video_requests table
CREATE TABLE IF NOT EXISTS video_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID,
  topic TEXT NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  status VARCHAR(50) DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  script_data JSONB,
  slide_urls TEXT[],
  video_segment_urls TEXT[],
  pdf_url TEXT,
  video_url TEXT,
  generation_time_seconds INTEGER,
  estimated_cost DECIMAL(10, 4),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_requests_user_id ON video_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_video_requests_status ON video_requests(status);
CREATE INDEX IF NOT EXISTS idx_video_requests_created_at ON video_requests(created_at DESC);

-- Add table and column comments for documentation
COMMENT ON TABLE video_requests IS 'Tracks educational video generation requests through V6.1 pipeline';
COMMENT ON COLUMN video_requests.user_id IS 'FK to users table - teacher who requested the video';
COMMENT ON COLUMN video_requests.session_id IS 'Optional FK to chat_sessions for context';
COMMENT ON COLUMN video_requests.topic IS 'Subject/topic of the educational video';
COMMENT ON COLUMN video_requests.language IS 'Language code (en, ur, ar, es, bal-PK, sd-PK, ps-PK, pa-PK, ta-LK)';
COMMENT ON COLUMN video_requests.status IS 'pending, processing, completed, failed';
COMMENT ON COLUMN video_requests.current_step IS 'Pipeline step (0-6): 0=init, 1=script, 2=slides, 3=audio, 4=video, 5=assembly, 6=complete';
COMMENT ON COLUMN video_requests.script_data IS 'Generated script with scenes/narration (JSON)';
COMMENT ON COLUMN video_requests.slide_urls IS 'Array of generated slide image URLs from Creatomate';
COMMENT ON COLUMN video_requests.video_segment_urls IS 'Array of individual scene video URLs';
COMMENT ON COLUMN video_requests.pdf_url IS 'Final PDF document URL (optional)';
COMMENT ON COLUMN video_requests.video_url IS 'Final assembled video URL';
COMMENT ON COLUMN video_requests.generation_time_seconds IS 'Total time taken to generate video';
COMMENT ON COLUMN video_requests.estimated_cost IS 'Estimated cost in USD (API calls + compute)';
COMMENT ON COLUMN video_requests.error_message IS 'Error details if status is failed';
COMMENT ON COLUMN video_requests.retry_count IS 'Number of retry attempts';

-- Verification message
DO $$
BEGIN
  RAISE NOTICE 'Video requests table migration completed successfully!';
  RAISE NOTICE 'Created table: video_requests';
  RAISE NOTICE 'Created indexes: idx_video_requests_user_id, idx_video_requests_status, idx_video_requests_created_at';
END $$;
