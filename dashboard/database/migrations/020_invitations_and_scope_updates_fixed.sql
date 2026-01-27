-- Migration 020: Add invitations table and update access_scopes (FIXED - Idempotent)
-- Purpose: Support partner admin invitation system and improve access scope tracking
-- Date: January 13, 2026
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. UPDATE access_scopes TABLE
-- =============================================================================

-- Add updated_at field for tracking scope modifications
ALTER TABLE access_scopes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_access_scopes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS access_scopes_updated_at_trigger ON access_scopes;

-- Create trigger
CREATE TRIGGER access_scopes_updated_at_trigger
BEFORE UPDATE ON access_scopes
FOR EACH ROW
EXECUTE FUNCTION update_access_scopes_updated_at();

COMMENT ON COLUMN access_scopes.updated_at IS 'Timestamp of last scope modification';

-- =============================================================================
-- 2. CREATE invitations TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('partner_admin', 'partner_viewer')),

  -- Scope configuration for new user (applied when invitation is accepted)
  -- Same structure as access_scopes.scope_value
  scope_config JSONB NOT NULL,

  -- Secure token for invitation link
  token VARCHAR(128) NOT NULL UNIQUE,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),

  -- Invitation metadata
  invited_by UUID NOT NULL REFERENCES dashboard_users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Acceptance tracking
  accepted_at TIMESTAMPTZ,
  created_user_id UUID REFERENCES dashboard_users(id),

  -- Revocation tracking
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES dashboard_users(id),

  -- Email delivery tracking
  last_sent_at TIMESTAMPTZ,
  send_count INT DEFAULT 0
);

COMMENT ON TABLE invitations IS 'Partner admin invitation system for user onboarding';
COMMENT ON COLUMN invitations.email IS 'Email address for invitation recipient';
COMMENT ON COLUMN invitations.role IS 'Role to assign when invitation is accepted (partner_admin or partner_viewer)';
COMMENT ON COLUMN invitations.scope_config IS 'JSON containing scope configuration {scope_type, scope_value}';
COMMENT ON COLUMN invitations.token IS 'Secure random token for invitation URL';
COMMENT ON COLUMN invitations.status IS 'Current status: pending, accepted, revoked, expired';
COMMENT ON COLUMN invitations.invited_by IS 'Dashboard user ID who created the invitation (super admin)';
COMMENT ON COLUMN invitations.expires_at IS 'Expiration datetime (default 7 days from creation)';
COMMENT ON COLUMN invitations.created_user_id IS 'Dashboard user ID created when invitation was accepted';
COMMENT ON COLUMN invitations.last_sent_at IS 'Last time invitation email was sent';
COMMENT ON COLUMN invitations.send_count IS 'Number of times invitation email was sent';

-- =============================================================================
-- 3. CREATE INDEXES
-- =============================================================================

-- Invitations indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at DESC);

-- Composite index for finding pending invitations
CREATE INDEX IF NOT EXISTS idx_invitations_status_expires ON invitations(status, expires_at);

-- =============================================================================
-- 4. GRANT PERMISSIONS
-- =============================================================================

GRANT ALL ON invitations TO service_role;
GRANT SELECT ON invitations TO portal_app_user;

-- =============================================================================
-- 5. VALIDATION FUNCTION
-- =============================================================================

-- Function to validate invitation token and check expiration
CREATE OR REPLACE FUNCTION is_invitation_valid(p_token VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_status VARCHAR;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT status, expires_at
  INTO v_status, v_expires_at
  FROM invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status != 'pending' THEN
    RETURN FALSE;
  END IF;

  IF v_expires_at < NOW() THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_invitation_valid IS 'Checks if invitation token is valid (pending and not expired)';

GRANT EXECUTE ON FUNCTION is_invitation_valid TO service_role;
GRANT EXECUTE ON FUNCTION is_invitation_valid TO portal_app_user;

COMMIT;
