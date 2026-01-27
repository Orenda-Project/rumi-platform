-- Migration: Add media URL columns to conversations table
-- Purpose: Store URLs for audio files and documents (PDFs) for dashboard playback/viewing
-- Date: November 11, 2025
-- ============================================================================

-- Add media_url column to store audio and document URLs
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Add media_id column to store WhatsApp media ID for reference
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS media_id VARCHAR(255);

-- Add mime_type column to store the file type
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- Add comment for documentation
COMMENT ON COLUMN conversations.media_url IS 'URL to media file (audio or PDF) stored in R2 or other storage';
COMMENT ON COLUMN conversations.media_id IS 'WhatsApp media ID for reference and download';
COMMENT ON COLUMN conversations.mime_type IS 'MIME type of the media file (e.g., audio/ogg, application/pdf)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_media_id ON conversations(media_id);
CREATE INDEX IF NOT EXISTS idx_conversations_message_type ON conversations(message_type);