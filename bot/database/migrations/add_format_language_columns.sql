-- Migration: Add format and language tracking columns to conversations table
-- Date: 2025-11-05
-- Purpose: Track input/output format (text/voice) and language (en/ur) for analytics

-- Add new columns to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS input_format VARCHAR(10),
ADD COLUMN IF NOT EXISTS input_language VARCHAR(10),
ADD COLUMN IF NOT EXISTS output_format VARCHAR(10),
ADD COLUMN IF NOT EXISTS output_language VARCHAR(10);

-- Add comments to document column purposes
COMMENT ON COLUMN conversations.input_format IS 'Format of user message: text or voice';
COMMENT ON COLUMN conversations.input_language IS 'Language of user message: en (English), ur (Urdu), or mixed';
COMMENT ON COLUMN conversations.output_format IS 'Format of bot response: text or voice';
COMMENT ON COLUMN conversations.output_language IS 'Language of bot response: en or ur';

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_conversations_format_language
ON conversations(input_format, input_language, output_format, output_language);

-- Verify the migration
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'conversations'
AND column_name IN ('input_format', 'input_language', 'output_format', 'output_language');
