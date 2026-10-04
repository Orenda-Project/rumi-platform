-- =============================================================================
-- V2.11.2 - Teacher portal password reset: a wrong-attempt count per code
-- A portal reset code is 6 digits. With no limit on wrong tries, all million
-- codes could be tried while one code was valid (10 minutes). The portal now
-- counts wrong tries at the current code in users.password_reset_attempts and
-- clears the code after PORTAL_RESET_CODE_MAX_ATTEMPTS (default 5); a new code
-- starts the count at 0.
--
-- ADDITIVE ONLY. One column with a default, so every existing row reads 0.
-- Nothing else changes. Fresh installs get the same from
-- 00_complete-schema.sql.
--
-- ALL OR NOTHING. The whole change is one DO block, so it is one statement: if
-- any part fails, nothing is left applied, whether this file is run by psql,
-- the SQL editor or infrastructure/scripts/migrate.js. (A BEGIN/COMMIT pair
-- would not do: migrate.js runs the file inside a database function, where
-- transaction commands are refused.) Safe to run again.
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER NOT NULL DEFAULT 0;

  -- Recorded inside the block, so the version is never marked applied unless
  -- everything above was.
  INSERT INTO schema_versions (version, description)
  VALUES ('2.11.2', 'Portal password reset: users.password_reset_attempts (wrong tries per code)')
  ON CONFLICT (version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
