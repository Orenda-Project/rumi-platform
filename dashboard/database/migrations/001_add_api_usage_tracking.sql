-- Migration: Add API Usage Tracking Tables
-- Description: Create tables for tracking API usage and health snapshots
-- Date: 2025-11-06

-- Track local API calls for services without usage endpoints
CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL, -- 'soniox', 'uplift', etc.
  operation_type VARCHAR(50) NOT NULL, -- 'transcription', 'tts', etc.
  units_consumed DECIMAL(10, 2), -- duration for soniox, chars for uplift
  estimated_cost DECIMAL(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track API health check results
CREATE TABLE IF NOT EXISTS api_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'healthy', 'warning', 'critical', 'error'
  usage_data JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_usage_service_date
  ON api_usage_log(service, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_health_service_date
  ON api_health_snapshots(service, checked_at DESC);

-- Comments for documentation
COMMENT ON TABLE api_usage_log IS 'Tracks API calls for services without programmatic usage endpoints (Soniox, Uplift)';
COMMENT ON TABLE api_health_snapshots IS 'Stores periodic snapshots of API health check results';

COMMENT ON COLUMN api_usage_log.service IS 'Service name (soniox, uplift, etc.)';
COMMENT ON COLUMN api_usage_log.operation_type IS 'Type of operation (transcription, tts, etc.)';
COMMENT ON COLUMN api_usage_log.units_consumed IS 'Units consumed (hours for Soniox, characters for Uplift)';
COMMENT ON COLUMN api_usage_log.estimated_cost IS 'Estimated cost in USD';

COMMENT ON COLUMN api_health_snapshots.service IS 'Service name';
COMMENT ON COLUMN api_health_snapshots.status IS 'Health status (healthy, warning, critical, error)';
COMMENT ON COLUMN api_health_snapshots.usage_data IS 'Full health data as JSON';
