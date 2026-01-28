-- =============================================================================
-- V1.0.0 - Baseline Schema
-- This migration marks the initial schema version.
-- The full schema is in 00_complete-schema.sql (for fresh installs).
-- =============================================================================

-- Ensure schema_versions table exists (for upgrades from pre-versioned installs)
CREATE TABLE IF NOT EXISTS schema_versions (
  id SERIAL,
  version VARCHAR(20) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64)
);

-- Record baseline
INSERT INTO schema_versions (version, description)
VALUES ('1.0.0', 'Rumi Platform open-source baseline schema')
ON CONFLICT (version) DO NOTHING;
