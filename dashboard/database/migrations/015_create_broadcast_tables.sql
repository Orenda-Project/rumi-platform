-- Migration 015: Broadcast Feature Tables
-- Date: December 26, 2025
-- Description: Creates tables for admin broadcast messaging with delivery tracking

-- Main broadcast record
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Admin info
  admin_user_id UUID REFERENCES dashboard_users(id),
  admin_username TEXT NOT NULL,
  admin_ip_address TEXT,
  admin_user_agent TEXT,

  -- Content
  message_content TEXT NOT NULL,
  filters JSONB NOT NULL,  -- {activity: '24h', country: '92'}

  -- Template info (for Meta approval)
  template_id TEXT,
  template_name TEXT,
  template_status TEXT,  -- PENDING, APPROVED, REJECTED
  template_rejected_reason TEXT,
  template_submitted_at TIMESTAMPTZ,

  -- Counts
  total_recipients INT NOT NULL,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  replied_count INT DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft',
  -- Values: draft, template_pending, template_rejected, template_timeout, sending, completed, completed_with_errors, cancelled, failed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,

  -- Errors & Audit
  errors JSONB,
  error_message TEXT,
  audit_trail JSONB DEFAULT '[]'::JSONB
);

-- Individual message tracking
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID REFERENCES broadcast_logs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  phone_number TEXT NOT NULL,
  message_id TEXT,  -- WhatsApp wamid

  -- Status tracking
  status TEXT DEFAULT 'pending',  -- pending, sent, delivered, read, failed
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_status ON broadcast_logs(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_admin ON broadcast_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_created ON broadcast_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id ON broadcast_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_message_id ON broadcast_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_user_sent ON broadcast_messages(user_id, sent_at DESC);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_user
  ON broadcast_messages(broadcast_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_messages_wamid
  ON broadcast_messages(message_id) WHERE message_id IS NOT NULL;

-- Function to get broadcast counts efficiently
CREATE OR REPLACE FUNCTION get_broadcast_counts(p_broadcast_id UUID)
RETURNS TABLE(
  delivered_count INT,
  read_count INT,
  failed_count INT,
  replied_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))::INT AS delivered_count,
    COUNT(*) FILTER (WHERE status = 'read')::INT AS read_count,
    COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_count,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::INT AS replied_count
  FROM broadcast_messages
  WHERE broadcast_id = p_broadcast_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment replied count
CREATE OR REPLACE FUNCTION increment_replied_count(p_broadcast_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcast_logs
  SET replied_count = replied_count + 1
  WHERE id = p_broadcast_id;
END;
$$ LANGUAGE plpgsql;

-- Generic function to increment any count column
CREATE OR REPLACE FUNCTION increment_broadcast_count(p_broadcast_id UUID, p_column_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Only allow specific column names for security
  IF p_column_name NOT IN ('sent_count', 'delivered_count', 'read_count', 'failed_count', 'replied_count') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column_name;
  END IF;

  EXECUTE format('UPDATE broadcast_logs SET %I = %I + 1 WHERE id = $1', p_column_name, p_column_name)
    USING p_broadcast_id;
END;
$$ LANGUAGE plpgsql;

-- Advisory lock functions for concurrency control
CREATE OR REPLACE FUNCTION acquire_broadcast_lock(p_broadcast_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  PERFORM pg_advisory_lock(hashtext(p_broadcast_id::text));
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_broadcast_lock(p_broadcast_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_broadcast_id::text));
END;
$$ LANGUAGE plpgsql;

-- Audit trigger for change logging
CREATE OR REPLACE FUNCTION log_broadcast_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.audit_trail = COALESCE(OLD.audit_trail, '[]'::JSONB) ||
      jsonb_build_object(
        'timestamp', NOW(),
        'old_status', OLD.status,
        'new_status', NEW.status
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broadcast_audit_trigger ON broadcast_logs;
CREATE TRIGGER broadcast_audit_trigger
BEFORE UPDATE ON broadcast_logs
FOR EACH ROW
EXECUTE FUNCTION log_broadcast_changes();

-- Grant permissions
GRANT ALL ON broadcast_logs TO authenticated;
GRANT ALL ON broadcast_messages TO authenticated;
GRANT EXECUTE ON FUNCTION get_broadcast_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_replied_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_broadcast_count(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION acquire_broadcast_lock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_broadcast_lock(UUID) TO authenticated;

-- Add index for conversations query (used by getUsersForBroadcast)
CREATE INDEX IF NOT EXISTS idx_conversations_user_role_created
  ON conversations(user_id, role, created_at DESC);
