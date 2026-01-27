-- Migration: 012_add_language_nudge_sent.sql
-- Purpose: Track if user has received one-time language selection nudge message
-- Date: December 21, 2025
-- Related: Problem A - Language Expansion (regional languages support)

-- Add column to track if user has received language nudge
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_nudge_sent BOOLEAN DEFAULT false;

-- Index for efficient querying of users to nudge
CREATE INDEX IF NOT EXISTS idx_users_language_nudge
ON users (language_nudge_sent, updated_at);

COMMENT ON COLUMN users.language_nudge_sent IS
'Whether user has received one-time language selection nudge message';

-- Verification query (run manually to confirm):
-- SELECT language_nudge_sent, COUNT(*)
-- FROM users
-- GROUP BY language_nudge_sent;
