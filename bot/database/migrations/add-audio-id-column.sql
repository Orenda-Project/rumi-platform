-- ============================================================================
-- Add audio_id column to coaching_sessions table
-- This stores the WhatsApp media ID needed to download the audio file
-- ============================================================================

-- Add audio_id column after audio_url
ALTER TABLE coaching_sessions
ADD COLUMN IF NOT EXISTS audio_id VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_audio_id ON coaching_sessions(audio_id);

-- Add comment
COMMENT ON COLUMN coaching_sessions.audio_id IS 'WhatsApp media ID for downloading the audio file';
