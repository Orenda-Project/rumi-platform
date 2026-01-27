/**
 * Migration: Add current_state column to conversations table
 * Purpose: Track conversation state for reading assessments and other multi-step flows
 * Created: 2025-11-15
 */

-- Add current_state column to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS current_state VARCHAR(50);

-- Add comment explaining the column
COMMENT ON COLUMN conversations.current_state IS 'State tracking for multi-step conversations (e.g., AWAITING_READING_LANGUAGE, AWAITING_READING_AUDIO)';

-- Create index for faster state queries
CREATE INDEX IF NOT EXISTS idx_conversations_current_state
ON conversations(current_state)
WHERE current_state IS NOT NULL;

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Migration 005 completed: Added current_state column to conversations table';
END $$;
