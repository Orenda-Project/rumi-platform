-- Test Migration
-- Purpose: Verify programmatic SQL execution works correctly
-- Created: November 7, 2025

-- Create a test table
CREATE TABLE IF NOT EXISTS migration_test (
  id SERIAL PRIMARY KEY,
  test_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test data
INSERT INTO migration_test (test_message)
VALUES ('Migration system working perfectly! ✅');

-- Verify it worked
SELECT
  'Migration test successful!' as status,
  COUNT(*) as rows_inserted
FROM migration_test;
