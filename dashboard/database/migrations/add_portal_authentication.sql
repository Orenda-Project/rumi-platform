-- Migration: Add Teacher Portal Authentication
-- Description: Adds columns to users table for portal login, password management, and invitations
-- Date: 2025-11-13
-- Related: TEACHER_PORTAL_IMPLEMENTATION_PLAN.md

-- Add portal authentication columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS portal_password_hash TEXT,
ADD COLUMN IF NOT EXISTS portal_invite_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS portal_invite_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS portal_activated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(6),
ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for fast portal invitation token lookup
-- Used when users click invitation link: your-portal-domain.com/setup/{token}
CREATE INDEX IF NOT EXISTS idx_users_portal_invite_token
ON users(portal_invite_token)
WHERE portal_invite_token IS NOT NULL;

-- Create composite index for portal login authentication
-- Used when users log in with phone_number + password
CREATE INDEX IF NOT EXISTS idx_users_portal_login
ON users(phone_number, portal_activated)
WHERE portal_activated = TRUE;

-- Create composite index for password reset flow
-- Used when users request password reset via WhatsApp
CREATE INDEX IF NOT EXISTS idx_users_password_reset
ON users(password_reset_code, password_reset_expires_at)
WHERE password_reset_code IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.portal_password_hash IS 'bcrypt hash of portal password (10 rounds)';
COMMENT ON COLUMN users.portal_invite_token IS 'UUID token for one-time portal setup link';
COMMENT ON COLUMN users.portal_invite_expires_at IS 'Invitation link expires after 7 days';
COMMENT ON COLUMN users.portal_activated IS 'TRUE after user completes password setup';
COMMENT ON COLUMN users.portal_last_login IS 'Last successful portal login timestamp';
COMMENT ON COLUMN users.password_reset_code IS '6-digit code sent via WhatsApp for password reset';
COMMENT ON COLUMN users.password_reset_expires_at IS 'Reset code expires after 10 minutes';
