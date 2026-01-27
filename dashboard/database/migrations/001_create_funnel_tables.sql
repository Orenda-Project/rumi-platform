-- Funnel Analysis Tables Migration
-- Created: November 7, 2025
-- Purpose: Track user journey from website → CTA click → chat start → registration

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: Website Visits
-- Tracks unique visitors to the website
CREATE TABLE IF NOT EXISTS website_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  referrer TEXT,
  landing_page TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_visits_session_id ON website_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_website_visits_created_at ON website_visits(created_at DESC);

COMMENT ON TABLE website_visits IS 'Tracks unique visitors to Rumi website';
COMMENT ON COLUMN website_visits.session_id IS 'Anonymous session ID from cookie/localStorage';
COMMENT ON COLUMN website_visits.ip_hash IS 'SHA256 hash of IP address for deduplication';

-- Table 2: CTA Clicks
-- Tracks "Start Chat" button clicks on website
CREATE TABLE IF NOT EXISTS cta_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL,
  button_location VARCHAR(100),
  whatsapp_link TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cta_clicks_session_id ON cta_clicks(session_id);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_created_at ON cta_clicks(created_at DESC);

COMMENT ON TABLE cta_clicks IS 'Tracks Start Chat button clicks on website';
COMMENT ON COLUMN cta_clicks.button_location IS 'Which CTA button was clicked (e.g., hero, footer, navbar)';

-- Table 3: Chat Starts
-- Tracks when user sends first message to WhatsApp bot
CREATE TABLE IF NOT EXISTS chat_starts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_starts_user_id ON chat_starts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_starts_phone_number ON chat_starts(phone_number);
CREATE INDEX IF NOT EXISTS idx_chat_starts_session_id ON chat_starts(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_starts_created_at ON chat_starts(created_at DESC);

COMMENT ON TABLE chat_starts IS 'Tracks first message sent to WhatsApp bot';
COMMENT ON COLUMN chat_starts.session_id IS 'Website session ID passed via URL parameter';

-- Table 4: Update Users Table
-- Add funnel tracking columns to existing users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id);

COMMENT ON COLUMN users.source IS 'User acquisition source: website, direct, or referral';
COMMENT ON COLUMN users.session_id IS 'Website session ID that led to signup';
COMMENT ON COLUMN users.first_message_at IS 'Timestamp of first WhatsApp message';
COMMENT ON COLUMN users.registered_at IS 'Timestamp when registration completed';

-- Verification Query
-- Run this to verify tables were created successfully
DO $$
BEGIN
  RAISE NOTICE 'Funnel tables migration completed successfully!';
  RAISE NOTICE 'Created tables: website_visits, cta_clicks, chat_starts';
  RAISE NOTICE 'Updated table: users (added 4 new columns)';
END $$;
