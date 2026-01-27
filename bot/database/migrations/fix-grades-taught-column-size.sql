-- Fix grades_taught column size to accommodate all grade combinations
-- Current: VARCHAR(20) - causes "value too long" error
-- New: VARCHAR(100) - allows "Early Years, Primary, Secondary" (33 chars) and more

-- Issue: When users select all 3 grades:
-- ["0_Early_Years_(N-KG)", "1_Primary_Grades_(1-5)", "2_Secondary_Grades_(6-12)"]
-- Transforms to: "Early Years, Primary, Secondary" = 33 characters
-- Database column is VARCHAR(20) → ERROR

ALTER TABLE users
  ALTER COLUMN grades_taught TYPE VARCHAR(100);

-- Verify the change
COMMENT ON COLUMN users.grades_taught IS 'Comma-separated list of grade levels taught (e.g., "Early Years, Primary, Secondary")';
