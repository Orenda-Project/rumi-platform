-- Migration: Add Auto-Level Assessment Feature
-- Version: v2.9.22
-- Date: December 25, 2025
-- Description: Add columns for ASER-style adaptive level assessment

-- =============================================================================
-- STEP 1: ADD ASSESSMENT MODE COLUMNS
-- =============================================================================

-- assessment_mode: 'manual' (user selects level) or 'auto' (ASER-style adaptive)
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS assessment_mode VARCHAR(10) DEFAULT 'manual'
CHECK (assessment_mode IN ('manual', 'auto'));

-- starting_level: Initial level when auto mode started (story for auto, user-selected for manual)
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS starting_level VARCHAR(20);

-- final_level: The level where student stabilized (for auto mode)
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS final_level VARCHAR(20);

-- =============================================================================
-- STEP 2: ADD LEVEL ATTEMPTS TRACKING
-- =============================================================================

-- level_attempts: JSONB tracking all level attempts during adaptive assessment
-- Structure:
-- {
--   "story": { "attempts": 1, "passed": false, "accuracy": 45, "wcpm": 23 },
--   "paragraph": { "attempts": 2, "passed": true, "accuracy": 85, "wcpm": 45 },
--   ...
-- }
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS level_attempts JSONB DEFAULT '{}';

-- auto_level_history: Array of level transitions with timestamps
-- Structure:
-- [
--   { "from": "story", "to": "paragraph", "reason": "accuracy_below_80", "timestamp": "..." },
--   { "from": "paragraph", "to": "sentences", "reason": "accuracy_below_80", "timestamp": "..." },
--   ...
-- ]
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS auto_level_history JSONB DEFAULT '[]';

-- =============================================================================
-- STEP 3: ADD ATTEMPT COUNTER
-- =============================================================================

-- current_level_attempt: Which attempt this is at current level (1, 2, or 3)
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS current_level_attempt INTEGER DEFAULT 1;

-- max_attempts_per_level: Configurable (default 2 per ASER methodology)
ALTER TABLE reading_assessments
ADD COLUMN IF NOT EXISTS max_attempts_per_level INTEGER DEFAULT 2;

-- =============================================================================
-- STEP 4: ADD INDEXES FOR PERFORMANCE
-- =============================================================================

-- Index for filtering by assessment mode
CREATE INDEX IF NOT EXISTS idx_reading_assessments_mode
ON reading_assessments(assessment_mode)
WHERE assessment_mode = 'auto';

-- GIN index for JSONB queries on level_attempts
CREATE INDEX IF NOT EXISTS idx_reading_level_attempts
ON reading_assessments USING GIN (level_attempts);

-- =============================================================================
-- STEP 5: ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN reading_assessments.assessment_mode IS
'Assessment mode: manual (user selects level) or auto (ASER-style adaptive)';

COMMENT ON COLUMN reading_assessments.starting_level IS
'Initial level when assessment started (story for auto mode, user-selected for manual)';

COMMENT ON COLUMN reading_assessments.final_level IS
'Level where student stabilized (only for auto mode)';

COMMENT ON COLUMN reading_assessments.level_attempts IS
'JSONB tracking attempts at each level: { "level": { "attempts": N, "passed": bool, "accuracy": N, "wcpm": N } }';

COMMENT ON COLUMN reading_assessments.auto_level_history IS
'Array of level transitions: [{ "from": "...", "to": "...", "reason": "...", "timestamp": "..." }]';

COMMENT ON COLUMN reading_assessments.current_level_attempt IS
'Which attempt this is at current level (1-based, max 2 per ASER methodology)';

COMMENT ON COLUMN reading_assessments.max_attempts_per_level IS
'Maximum attempts allowed per level before moving down (default 2)';

-- =============================================================================
-- STEP 6: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v2.9.22', 'Add Auto-Level Assessment feature with ASER-style adaptive testing');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. assessment_mode column to track manual vs auto assessment
-- 2. level_attempts JSONB to track all level attempts during adaptive assessment
-- 3. auto_level_history JSONB to track level transitions
-- 4. current_level_attempt to track which attempt at current level
-- 5. Performance indexes for JSONB queries

-- ASER Methodology (implemented in auto mode):
-- 1. Start at STORY level
-- 2. If accuracy < 80%, move DOWN one level, give 2 attempts
-- 3. If accuracy >= 80%, STAY at current level (assessment complete)
-- 4. Continue until stable level found or reached LETTERS level
-- 5. Store final_level as the instructional level for the student

-- Level Progression (ASER/EGRA framework):
-- story → paragraph → sentences → words → letters
-- (Higher to lower complexity)

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor (staging first!)
-- 2. Verify columns created:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'reading_assessments' AND column_name LIKE '%level%';
-- 3. Test with sample data:
--    UPDATE reading_assessments SET assessment_mode = 'auto' WHERE id = 'test-uuid';
-- 4. Deploy auto-level orchestrator service
-- 5. Test auto mode via WhatsApp

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================

-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS assessment_mode;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS starting_level;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS final_level;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS level_attempts;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS auto_level_history;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS current_level_attempt;
-- ALTER TABLE reading_assessments DROP COLUMN IF EXISTS max_attempts_per_level;
-- DROP INDEX IF EXISTS idx_reading_assessments_mode;
-- DROP INDEX IF EXISTS idx_reading_level_attempts;
-- DELETE FROM schema_versions WHERE version = 'v2.9.22';
