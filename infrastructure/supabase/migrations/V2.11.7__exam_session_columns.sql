-- =============================================================================
-- V2.11.7 - Exam checker: the session row holds what the exam checker writes
-- Versioned migration, applied by infrastructure/scripts/migrate.js.
--
-- The exam checker stores the page readings, the grades and the marked pages on
-- exam_check_sessions (ocr_results, grading_results, annotated_images), and the
-- detected / confirmed students as objects ({ name, pageNumbers, ... }). None of
-- the three columns existed, so every grading run ended in "Failed to update
-- session"; and the student columns were text[], which turned each object into a
-- string, so a student's name and pages were lost (a null student_name on
-- exam_submissions, 0 marks, no marked pages).
--
-- ADDITIVE, plus a type change on two columns while they are still text[]: each
-- existing array becomes the same array as jsonb (to_jsonb), so no row loses a
-- value. Installs where the columns are already jsonb are untouched.
--
-- ROLLBACK: remove the three new columns, and turn each student column back
-- into text[] with USING ARRAY(SELECT jsonb_array_elements_text(<column>)).
--
-- ALL OR NOTHING. The whole change is one DO block, so it is one statement: if
-- any part fails, nothing is left applied, whether this file is run by psql,
-- the SQL editor or infrastructure/scripts/migrate.js. Safe to run again.
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE exam_check_sessions ADD COLUMN IF NOT EXISTS ocr_results JSONB;
  ALTER TABLE exam_check_sessions ADD COLUMN IF NOT EXISTS grading_results JSONB;
  ALTER TABLE exam_check_sessions ADD COLUMN IF NOT EXISTS annotated_images JSONB;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exam_check_sessions'
        AND column_name = 'detected_students') = 'ARRAY' THEN
    ALTER TABLE exam_check_sessions
      ALTER COLUMN detected_students TYPE JSONB USING to_jsonb(detected_students);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exam_check_sessions'
        AND column_name = 'confirmed_students') = 'ARRAY' THEN
    ALTER TABLE exam_check_sessions
      ALTER COLUMN confirmed_students TYPE JSONB USING to_jsonb(confirmed_students);
  END IF;

  -- Recorded inside the block, so the version is never marked applied unless
  -- everything above was.
  INSERT INTO schema_versions (version, description)
  VALUES ('2.11.7', 'Exam checker: exam_check_sessions ocr_results / grading_results / annotated_images, students as jsonb')
  ON CONFLICT (version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
