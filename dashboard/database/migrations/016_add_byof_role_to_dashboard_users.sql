-- Migration: Add BYOF role to dashboard_users
-- Purpose: Enable BYOF (Build Your Own Feature) access control
-- Date: December 31, 2025
-- ============================================================================

-- Add byof_role column to dashboard_users
-- NULL = no BYOF access, 'reporter' = can create, 'approver' = can approve
ALTER TABLE dashboard_users
ADD COLUMN IF NOT EXISTS byof_role VARCHAR(20)
CHECK (byof_role IS NULL OR byof_role IN ('reporter', 'approver'));

-- Add comment for documentation
COMMENT ON COLUMN dashboard_users.byof_role IS 'BYOF role: reporter (can create plans) or approver (can approve plans). NULL means no BYOF access.';

-- Create index for BYOF role queries
CREATE INDEX IF NOT EXISTS idx_dashboard_users_byof_role ON dashboard_users(byof_role) WHERE byof_role IS NOT NULL;

-- Grant approver role to existing admin
-- UPDATE dashboard_users SET byof_role = 'approver' WHERE username = 'admin';

-- Rollback script (for reference):
-- ALTER TABLE dashboard_users DROP COLUMN IF EXISTS byof_role;
