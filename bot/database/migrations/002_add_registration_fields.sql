-- Migration: Add Registration Fields
-- Version: v3.2.0
-- Date: November 6, 2025
-- Description: Add comprehensive registration fields for teacher onboarding

-- =============================================================================
-- STEP 1: ADD REGISTRATION FIELDS TO USERS TABLE
-- =============================================================================

-- Add new registration fields
ALTER TABLE users
ADD COLUMN first_name VARCHAR(100),
ADD COLUMN last_name VARCHAR(100),
ADD COLUMN school_name VARCHAR(200);

-- Rename existing columns for clarity
ALTER TABLE users
RENAME COLUMN grade TO grades_taught;

ALTER TABLE users
RENAME COLUMN subject TO subjects_taught_old;

-- Add new subjects_taught as JSONB array
ALTER TABLE users
ADD COLUMN subjects_taught JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data from old subject column to new subjects_taught
UPDATE users
SET subjects_taught = jsonb_build_array(subjects_taught_old)
WHERE subjects_taught_old IS NOT NULL;

-- Drop old column
ALTER TABLE users
DROP COLUMN subjects_taught_old;

-- Add comments for documentation
COMMENT ON COLUMN users.first_name IS 'Teacher first name from registration form';
COMMENT ON COLUMN users.last_name IS 'Teacher last name from registration form';
COMMENT ON COLUMN users.school_name IS 'School name from registration form';
COMMENT ON COLUMN users.grades_taught IS 'Grade level taught: Early Years (N-KG), Primary Grades (1-5), Secondary Grades (6-12), Uni/College (12+)';
COMMENT ON COLUMN users.subjects_taught IS 'Array of subjects taught: Maths, English, Local Language, Islamiyat, Science, SST/History/GK, Physics, Chemistry, Other';

-- =============================================================================
-- STEP 2: ADD TURN TRACKING TO CHAT_SESSIONS
-- =============================================================================

-- Add turn count for registration trigger
ALTER TABLE chat_sessions
ADD COLUMN turn_count INTEGER DEFAULT 0,
ADD COLUMN registration_triggered BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN chat_sessions.turn_count IS 'Number of conversation turns (user message + bot response = 1 turn)';
COMMENT ON COLUMN chat_sessions.registration_triggered IS 'Whether registration flow has been triggered for this session';

-- =============================================================================
-- STEP 3: CREATE FUNCTION TO INCREMENT TURN COUNT
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_turn_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment turn count when assistant responds (completing a turn)
  IF NEW.role = 'assistant' AND NEW.session_id IS NOT NULL THEN
    UPDATE chat_sessions
    SET turn_count = turn_count + 1
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-increment turn count
CREATE TRIGGER increment_session_turn_count
AFTER INSERT ON conversations
FOR EACH ROW
WHEN (NEW.session_id IS NOT NULL AND NEW.role = 'assistant')
EXECUTE FUNCTION increment_turn_count();

-- =============================================================================
-- STEP 4: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v3.2.0', 'Add comprehensive registration fields and turn tracking for teacher onboarding');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. Teacher registration fields (first_name, last_name, school_name)
-- 2. Improved grade and subject tracking with JSONB array
-- 3. Turn counting for registration trigger (after 2 turns)
-- 4. Registration triggered flag to prevent multiple triggers

-- Registration Template Fields:
-- - First Name (text input)
-- - Last Name (text input)
-- - School Name (text input)
-- - Grades (single select): Early Years (N-KG), Primary Grades (1-5), Secondary Grades (6-12), Uni/College (12+)
-- - Subjects (multi-select): Maths, English, Local Language, Islamiyat, Science, SST/History/GK, Physics, Chemistry, Other

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify all columns added successfully
-- 3. Update bot code to:
--    - Track turn counts
--    - Trigger registration after 2 turns
--    - Handle template submission webhook
--    - Store registration data
