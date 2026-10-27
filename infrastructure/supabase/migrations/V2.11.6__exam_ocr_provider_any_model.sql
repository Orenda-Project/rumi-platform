-- =============================================================================
-- V2.11.6 - Exam checker: ocr_provider holds the vision model's name
-- The exam checker now reads papers with the exam-vision engine and stores the
-- model that read them in exam_check_sessions.ocr_provider (for example
-- "gemini-3.5-flash"). Installs that applied the legacy
-- bot/database/migrations/015_exam_checker.sql carry a CHECK limiting the
-- column to ('mistral', 'chandra'), which would reject every new write. This
-- drops that CHECK, and only when it is the legacy one; installs without it
-- are untouched. No row changes. Fresh installs never had the CHECK:
-- 00_complete-schema.sql creates the column without one.
--
-- ROLLBACK: only possible while every row still holds 'mistral', 'chandra' or
-- NULL (switch the exam checker back first):
--   ALTER TABLE exam_check_sessions ADD CONSTRAINT exam_check_sessions_ocr_provider_check
--     CHECK (ocr_provider IN ('mistral', 'chandra', NULL));
--
-- ALL OR NOTHING. The whole change is one DO block, so it is one statement: if
-- any part fails, nothing is left applied, whether this file is run by psql,
-- the SQL editor or infrastructure/scripts/migrate.js. Safe to run again.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_check_sessions_ocr_provider_check'
      AND conrelid = 'exam_check_sessions'::regclass
      AND pg_get_constraintdef(oid) LIKE '%mistral%'
  ) THEN
    ALTER TABLE exam_check_sessions DROP CONSTRAINT exam_check_sessions_ocr_provider_check;
  END IF;

  -- Recorded inside the block, so the version is never marked applied unless
  -- everything above was.
  INSERT INTO schema_versions (version, description)
  VALUES ('2.11.6', 'Exam checker: exam_check_sessions.ocr_provider accepts any vision model name')
  ON CONFLICT (version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
