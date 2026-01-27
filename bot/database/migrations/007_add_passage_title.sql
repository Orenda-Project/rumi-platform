-- Migration 007: Add passage_title column to reading_assessments
-- Bug #16 Fix: Store passage title separately from passage text
-- Date: 2025-11-17
-- Purpose: Prevent word alignment errors caused by titles that students don't read

ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS passage_title VARCHAR(200);

COMMENT ON COLUMN reading_assessments.passage_title IS 'Title of the reading passage (stored separately, not included in passage_text for word alignment). NULL for letters/words/sentences types, populated for paragraph/story types.';

COMMENT ON COLUMN reading_assessments.passage_text IS 'The actual passage text that students read (excludes title). Used for word alignment accuracy calculation.';
