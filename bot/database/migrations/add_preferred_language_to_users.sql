-- Migration: Add preferred_language column to users table for dynamic language switching
-- Date: 2025-11-11
-- Phase: Phase 2 - Language Architecture

-- Add preferred_language column with default 'en' (English)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en';

-- Update existing users to have default language (English)
UPDATE users
SET preferred_language = 'en'
WHERE preferred_language IS NULL;

-- Add index for performance (language filtering/grouping)
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON users(preferred_language);

-- Add comment explaining the column
COMMENT ON COLUMN users.preferred_language IS 'User''s preferred language for bot interactions: en (English), es (Spanish), ur (Urdu), ar (Arabic). Auto-updated via Soniox language detection.';

-- Add constraint to ensure only valid language codes
ALTER TABLE users
ADD CONSTRAINT check_preferred_language
CHECK (preferred_language IN ('en', 'es', 'ur', 'ar'));
