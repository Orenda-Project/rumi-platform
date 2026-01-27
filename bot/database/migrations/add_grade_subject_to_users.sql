-- Migration: Add grade and subject columns to users table
-- Date: 2025-11-07

ALTER TABLE users
ADD COLUMN IF NOT EXISTS grade VARCHAR(50),
ADD COLUMN IF NOT EXISTS subject VARCHAR(100);

-- Update existing users to have default values
UPDATE users
SET grade = 'Not specified'
WHERE grade IS NULL;

UPDATE users
SET subject = 'Not specified'
WHERE subject IS NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN users.grade IS 'Broad grade category: Early Years, Primary, Secondary, etc.';
COMMENT ON COLUMN users.subject IS 'Subject(s) the teacher teaches';
