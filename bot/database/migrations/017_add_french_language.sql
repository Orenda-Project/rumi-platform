-- Migration: 017_add_french_language.sql
-- Purpose: Add French (fr) to the preferred_language CHECK constraint for
--          francophone-market expansion.
-- Date: August 5, 2026
--
-- Context: The canonical fresh-install schema (infrastructure/supabase/00_complete-schema.sql)
-- has no CHECK on users.preferred_language, so fresh clones already accept this code.
-- This migration only matters for deployments that previously applied
-- 011_add_language_expansion.sql / 016_add_indian_languages.sql (which added a
-- restrictive CHECK). It is a no-op-safe drop + re-add.

-- Step 1: Drop existing constraint if present
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_preferred_language;

-- Step 2: Re-add with the full union (PK regional + India + francophone + core).
-- Full support (conversation + reading assessment): en, ur
-- Conversation only: all others
ALTER TABLE users
ADD CONSTRAINT check_preferred_language
CHECK (preferred_language IN (
  'en', 'es', 'ur', 'ar', 'fr',
  'pa-PK', 'ps-PK', 'sd-PK', 'bal-PK', 'ta-LK',
  'hi', 'bn', 'mr', 'te', 'ta-IN', 'kn'
));

-- Verification (run manually):
-- SELECT preferred_language, COUNT(*) FROM users GROUP BY preferred_language ORDER BY preferred_language;
