-- Migration 003: Add Registration State Machine
-- Version: 3.4.0
-- Date: 2025-11-09
-- Description: Add formal state machine for registration workflow

-- Add registration_state column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_state VARCHAR(50) DEFAULT 'unregistered';

-- Add registration_state_updated_at column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_state_updated_at TIMESTAMP;

-- Add comments
COMMENT ON COLUMN users.registration_state IS 'Current state in registration state machine: unregistered, invited, flow_sent, in_progress, completed, prompt_failed, template_send_failed, submission_processing_failed';
COMMENT ON COLUMN users.registration_state_updated_at IS 'Timestamp of last state transition';

-- Create index for querying users by registration state
CREATE INDEX IF NOT EXISTS idx_users_registration_state
ON users(registration_state);

-- Backfill existing data:
-- Users with registration_completed = true should be in COMPLETED state
UPDATE users
SET registration_state = 'completed',
    registration_state_updated_at = COALESCE(registration_completed_at, NOW())
WHERE registration_completed = true
  AND (registration_state IS NULL OR registration_state = 'unregistered');

-- Users with registration_started_at but not completed should be in FLOW_SENT state
UPDATE users
SET registration_state = 'flow_sent',
    registration_state_updated_at = registration_started_at
WHERE registration_completed = false
  AND registration_started_at IS NOT NULL
  AND (registration_state IS NULL OR registration_state = 'unregistered');

-- Verify migration
DO $$
DECLARE
  state_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO state_count
  FROM users
  WHERE registration_state IS NOT NULL;

  RAISE NOTICE 'Migration 003 complete. % users have registration_state set', state_count;
END $$;
