-- Migration: 011_add_language_expansion.sql
-- Purpose: Add support for 5 new languages (Pakistani Punjabi, Sindhi, Balochi, Pashto, Sri Lankan Tamil)
-- Date: December 14, 2025

-- Step 1: Add language_locked column (allows users to lock their language preference)
-- Default to false so existing users continue with auto-detection
ALTER TABLE users
ADD COLUMN IF NOT EXISTS language_locked BOOLEAN DEFAULT false;

-- Step 2: Drop existing constraint if exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_preferred_language;

-- Step 3: Add expanded constraint with new languages
-- Tier 1 (full support): en, ur
-- Tier 2 (coaching only): es, ar, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK
ALTER TABLE users
ADD CONSTRAINT check_preferred_language
CHECK (preferred_language IN ('en', 'es', 'ur', 'ar', 'pa-PK', 'ps-PK', 'sd-PK', 'bal-PK', 'ta-LK'));

-- Step 4: Add index for language_locked queries (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_users_language_locked ON users(language_locked);

-- Step 5: Add index on preferred_language for faster language-based queries
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON users(preferred_language);

-- Verification query (run manually to confirm):
-- SELECT preferred_language, language_locked, COUNT(*)
-- FROM users
-- GROUP BY preferred_language, language_locked
-- ORDER BY preferred_language;
