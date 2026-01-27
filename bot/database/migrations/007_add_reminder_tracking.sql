-- Migration 007: Add reminder tracking to coaching_sessions
-- Bug #9: Coaching Stuck Sessions - Stale Session Cleanup Mechanism
-- Created: November 30, 2025

-- Add reminder_sent_at column to track when reminder was sent
ALTER TABLE coaching_sessions
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient stale session queries
-- This index helps the cron job quickly find sessions in 'conducting_conversation' status
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_stale
ON coaching_sessions (status, created_at)
WHERE status = 'conducting_conversation';

-- Comment for documentation
COMMENT ON COLUMN coaching_sessions.reminder_sent_at IS 'Timestamp when stale session reminder was sent. Used by Bug #9 cleanup worker to prevent duplicate reminders.';
