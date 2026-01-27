-- Migration 006: Add pronunciation_accuracy column to reading_assessments
-- Bug #15 Fix: Separate pronunciation accuracy (Azure phoneme-level) from word accuracy (word alignment)
-- Date: 2025-11-17
-- Purpose: Store both accuracy metrics separately for clarity

ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS pronunciation_accuracy DOUBLE PRECISION;

COMMENT ON COLUMN reading_assessments.pronunciation_accuracy IS 'Azure phoneme-level pronunciation accuracy (0-100). Only available for English assessments. NULL for Urdu.';

COMMENT ON COLUMN reading_assessments.accuracy_percentage IS 'Word alignment accuracy: percentage of words read correctly (correctWords / totalWords * 100). Always available for all languages.';
