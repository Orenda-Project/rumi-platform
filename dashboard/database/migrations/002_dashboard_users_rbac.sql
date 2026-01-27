-- Migration: Add Dashboard Users table for RBAC
-- Purpose: Role-based access control for dashboard with email invitations
-- Date: November 11, 2025
-- ============================================================================

-- Create dashboard_users table
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES dashboard_users(id),
  invite_token VARCHAR(255) UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  password_reset_token VARCHAR(255) UNIQUE,
  password_reset_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dashboard_users_email ON dashboard_users(email);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_username ON dashboard_users(username);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_invite_token ON dashboard_users(invite_token);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_role ON dashboard_users(role);

-- Add comments for documentation
COMMENT ON TABLE dashboard_users IS 'Dashboard users with role-based access control';
COMMENT ON COLUMN dashboard_users.role IS 'User role: admin or viewer';
COMMENT ON COLUMN dashboard_users.invite_token IS 'Unique token for setting up new account';
COMMENT ON COLUMN dashboard_users.password_reset_token IS 'Token for password reset functionality';

-- Insert default admin user (password: admin123)
-- Password hash for 'admin123': $2a$10$K5L9V7KhR2dGzD1hX8PtOuBx7LPzGe9kTYQxGZWVyB2vKtGwMXeWi
INSERT INTO dashboard_users (
  email,
  username,
  password_hash,
  role,
  created_at
) VALUES (
  'admin@rumi.ai',
  'admin',
  '$2a$10$K5L9V7KhR2dGzD1hX8PtOuBx7LPzGe9kTYQxGZWVyB2vKtGwMXeWi',
  'admin',
  NOW()
) ON CONFLICT (username) DO NOTHING;

-- Create audit log table for tracking user actions
CREATE TABLE IF NOT EXISTS dashboard_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON dashboard_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON dashboard_audit_log(created_at);

-- Grant permissions
GRANT ALL ON dashboard_users TO service_role;
GRANT ALL ON dashboard_audit_log TO service_role;