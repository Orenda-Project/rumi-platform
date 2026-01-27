-- Migration: Add registration_state columns to users table
-- Date: 2025-11-09
-- Purpose: Fix bug where registration_completed was not being set automatically

-- Add registration_state column to track state machine
ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_state TEXT DEFAULT 'unregistered';

-- Add timestamp for state transitions
ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_state_updated_at TIMESTAMPTZ;

-- Update existing users who have completed registration
UPDATE users
SET registration_state = 'completed',
    registration_state_updated_at = registration_completed_at
WHERE registration_completed = true
  AND (registration_state IS NULL OR registration_state = 'unregistered');

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_registration_state
ON users(registration_state);

-- Verification query (run this after migration)
-- SELECT COUNT(*) as total_users,
--        SUM(CASE WHEN registration_completed = true THEN 1 ELSE 0 END) as completed_count,
--        SUM(CASE WHEN registration_state = 'completed' THEN 1 ELSE 0 END) as state_completed_count
-- FROM users;
