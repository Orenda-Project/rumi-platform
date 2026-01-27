-- Adds new lesson plan extraction columns to coaching_sessions

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS lesson_plan_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS lesson_plan_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS lesson_plan_structured JSONB,
  ADD COLUMN IF NOT EXISTS lesson_plan_word_count INTEGER,
  ADD COLUMN IF NOT EXISTS lesson_plan_extraction_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS lesson_plan_extraction_error TEXT;

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_lesson_plan_structured
  ON coaching_sessions USING GIN (lesson_plan_structured);

