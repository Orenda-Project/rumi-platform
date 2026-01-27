-- Add Funnel Tracking Columns to Users Table
-- Created: November 7, 2025
-- Purpose: Add source attribution and timestamp tracking to users table

-- Add funnel tracking columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id);

-- Add comments for documentation
COMMENT ON COLUMN users.source IS 'User acquisition source: website, direct, or referral';
COMMENT ON COLUMN users.session_id IS 'Website session ID that led to signup';
COMMENT ON COLUMN users.first_message_at IS 'Timestamp of first WhatsApp message';
COMMENT ON COLUMN users.registered_at IS 'Timestamp when registration completed';
