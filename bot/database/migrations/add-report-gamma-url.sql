-- Migration: Add Gamma URL column for classroom observation reports
-- Version: v3.3.1
-- Date: January 7, 2025
-- Description: Add report_gamma_url column to store interactive Gamma report links

-- Add report_gamma_url column to coaching_sessions
ALTER TABLE coaching_sessions
ADD COLUMN IF NOT EXISTS report_gamma_url VARCHAR(500);

-- Add comment for documentation
COMMENT ON COLUMN coaching_sessions.report_gamma_url IS 'Interactive Gamma report URL (editable web version)';

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_gamma_url ON coaching_sessions(report_gamma_url)
  WHERE report_gamma_url IS NOT NULL;

-- Update schema version
INSERT INTO schema_versions (version, description)
VALUES ('v3.3.1', 'Add report_gamma_url column for interactive Gamma report links')
ON CONFLICT (version) DO NOTHING;
