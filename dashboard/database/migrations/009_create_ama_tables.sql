-- Migration 009: AMA (Ask Me Anything) Tables
-- Creates tables for storing AMA conversations, messages, and query audit logs
-- Author: Claude Opus 4.5
-- Date: December 1, 2025

-- ============================================================================
-- TABLE: ama_conversations
-- Stores conversation metadata for each AMA chat session
-- ============================================================================
CREATE TABLE IF NOT EXISTS ama_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'New Conversation',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  context_summary TEXT, -- Compressed context when conversation gets long
  is_archived BOOLEAN DEFAULT FALSE
);

-- Index for fast user conversation lookups
CREATE INDEX IF NOT EXISTS idx_ama_conversations_user_id ON ama_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ama_conversations_updated_at ON ama_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ama_conversations_user_archived ON ama_conversations(user_id, is_archived);

-- ============================================================================
-- TABLE: ama_messages
-- Stores individual messages within a conversation
-- ============================================================================
CREATE TABLE IF NOT EXISTS ama_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ama_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking_content TEXT, -- Store the thinking/reasoning if displayed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Metadata for tracking
  tokens_used INTEGER,
  model_used VARCHAR(50),
  response_time_ms INTEGER,

  -- If the message included a SQL query
  sql_query TEXT,
  query_result JSONB,

  -- If the message included a chart
  chart_type VARCHAR(50), -- 'bar', 'line', 'pie', 'doughnut', 'table'
  chart_data JSONB,

  -- For tracer reports
  tracer_user_id UUID REFERENCES users(id),
  tracer_report JSONB
);

-- Index for fast message lookups
CREATE INDEX IF NOT EXISTS idx_ama_messages_conversation_id ON ama_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ama_messages_created_at ON ama_messages(created_at);

-- ============================================================================
-- TABLE: ama_query_audit
-- Audit log for all SQL queries executed through AMA
-- Critical for security monitoring and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS ama_query_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES ama_messages(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES dashboard_users(id),
  original_question TEXT NOT NULL,
  generated_sql TEXT NOT NULL,
  sql_validated BOOLEAN DEFAULT FALSE,
  validation_errors TEXT[],
  execution_status VARCHAR(20) CHECK (execution_status IN ('success', 'error', 'blocked', 'timeout')),
  execution_time_ms INTEGER,
  row_count INTEGER,
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for audit lookups
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_user_id ON ama_query_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_created_at ON ama_query_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_status ON ama_query_audit(execution_status);

-- ============================================================================
-- FUNCTION: Update conversation updated_at and message_count
-- ============================================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ama_conversations
  SET
    updated_at = NOW(),
    message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when message is added
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON ama_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON ama_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================================================
-- FUNCTION: Auto-generate conversation title from first message
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_title_conversation()
RETURNS TRIGGER AS $$
DECLARE
  v_is_first_user_message BOOLEAN;
  v_conversation_title VARCHAR(255);
BEGIN
  -- Only process user messages
  IF NEW.role != 'user' THEN
    RETURN NEW;
  END IF;

  -- Check if this is the first user message in the conversation
  SELECT NOT EXISTS (
    SELECT 1 FROM ama_messages
    WHERE conversation_id = NEW.conversation_id
    AND role = 'user'
    AND id != NEW.id
  ) INTO v_is_first_user_message;

  IF v_is_first_user_message THEN
    -- Truncate content to create title (max 60 chars)
    v_conversation_title := CASE
      WHEN LENGTH(NEW.content) > 60 THEN LEFT(NEW.content, 57) || '...'
      ELSE NEW.content
    END;

    UPDATE ama_conversations
    SET title = v_conversation_title
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-title conversations
DROP TRIGGER IF EXISTS trigger_auto_title_conversation ON ama_messages;
CREATE TRIGGER trigger_auto_title_conversation
  AFTER INSERT ON ama_messages
  FOR EACH ROW
  EXECUTE FUNCTION auto_title_conversation();

-- ============================================================================
-- RLS POLICIES (Row Level Security)
-- ============================================================================

-- Enable RLS on all AMA tables
ALTER TABLE ama_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ama_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ama_query_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own conversations
CREATE POLICY ama_conversations_user_policy ON ama_conversations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can only see messages in their conversations
CREATE POLICY ama_messages_user_policy ON ama_messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM ama_conversations WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see their own audit logs
CREATE POLICY ama_query_audit_user_policy ON ama_query_audit
  FOR ALL
  USING (user_id = auth.uid());

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON ama_conversations TO authenticated;
GRANT ALL ON ama_messages TO authenticated;
GRANT ALL ON ama_query_audit TO authenticated;
GRANT ALL ON ama_conversations TO service_role;
GRANT ALL ON ama_messages TO service_role;
GRANT ALL ON ama_query_audit TO service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE ama_conversations IS 'Stores AMA chat conversation metadata. Each conversation belongs to one admin user.';
COMMENT ON TABLE ama_messages IS 'Stores individual messages within AMA conversations. Includes SQL queries, chart data, and tracer reports.';
COMMENT ON TABLE ama_query_audit IS 'Security audit log for all SQL queries executed through the AMA feature. Critical for compliance and debugging.';

COMMENT ON COLUMN ama_conversations.context_summary IS 'Compressed summary of older messages when conversation exceeds token limit';
COMMENT ON COLUMN ama_messages.thinking_content IS 'LLM reasoning/thinking content if thinking tokens are enabled';
COMMENT ON COLUMN ama_messages.chart_data IS 'JSON data structure for rendering charts (labels, datasets, options)';
COMMENT ON COLUMN ama_messages.tracer_report IS 'Full tracer report JSON for user journey analysis';
