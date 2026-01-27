-- Migration: Add Chat Sessions
-- Version: v3.1.0
-- Date: November 4, 2025
-- Description: Add explicit session tracking with 30-minute timeout rule

-- =============================================================================
-- STEP 1: CREATE CHAT_SESSIONS TABLE
-- =============================================================================

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,  -- NULL if session is still active
  message_count INTEGER DEFAULT 0,
  session_type VARCHAR(50),  -- 'lesson_plan', 'presentation', 'general', 'audio_coaching'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_chat_sessions_user_started ON chat_sessions(user_id, started_at DESC);
CREATE INDEX idx_chat_sessions_user_active ON chat_sessions(user_id, last_activity_at DESC) WHERE ended_at IS NULL;

-- =============================================================================
-- STEP 2: ADD SESSION_ID TO CONVERSATIONS TABLE
-- =============================================================================

ALTER TABLE conversations
ADD COLUMN session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;

-- Index for session-based queries
CREATE INDEX idx_conversations_session ON conversations(session_id, created_at);

-- =============================================================================
-- STEP 3: ADD AUTO-UPDATE TRIGGER FOR CHAT_SESSIONS
-- =============================================================================

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 4: CREATE FUNCTION TO GET OR CREATE SESSION
-- =============================================================================

CREATE OR REPLACE FUNCTION get_or_create_session(
  p_user_id UUID,
  p_session_timeout_minutes INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_last_activity TIMESTAMP;
  v_time_since_last_activity INTERVAL;
BEGIN
  -- Get the most recent session for this user
  SELECT id, last_activity_at INTO v_session_id, v_last_activity
  FROM chat_sessions
  WHERE user_id = p_user_id
    AND ended_at IS NULL
  ORDER BY last_activity_at DESC
  LIMIT 1;

  -- Calculate time since last activity
  IF v_last_activity IS NOT NULL THEN
    v_time_since_last_activity := NOW() - v_last_activity;
  END IF;

  -- If no session exists or session timed out, create new session
  IF v_session_id IS NULL OR v_time_since_last_activity > (p_session_timeout_minutes || ' minutes')::INTERVAL THEN
    -- End the old session if it exists
    IF v_session_id IS NOT NULL THEN
      UPDATE chat_sessions
      SET ended_at = v_last_activity
      WHERE id = v_session_id;
    END IF;

    -- Create new session
    INSERT INTO chat_sessions (user_id, started_at, last_activity_at)
    VALUES (p_user_id, NOW(), NOW())
    RETURNING id INTO v_session_id;
  ELSE
    -- Update last_activity_at for existing session
    UPDATE chat_sessions
    SET last_activity_at = NOW()
    WHERE id = v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- STEP 5: CREATE FUNCTION TO UPDATE SESSION MESSAGE COUNT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment message count for the session
  IF NEW.session_id IS NOT NULL THEN
    UPDATE chat_sessions
    SET message_count = message_count + 1
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update message count
CREATE TRIGGER update_session_count_on_message_insert
AFTER INSERT ON conversations
FOR EACH ROW
WHEN (NEW.session_id IS NOT NULL)
EXECUTE FUNCTION update_session_message_count();

-- =============================================================================
-- STEP 6: BACKFILL SESSIONS FOR EXISTING CONVERSATIONS (OPTIONAL)
-- =============================================================================

-- This creates sessions for existing conversation data
-- Run this manually if you want to organize historical data into sessions
-- NOTE: This can take time if you have lots of conversations

CREATE OR REPLACE FUNCTION backfill_chat_sessions(
  p_session_timeout_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
  total_conversations BIGINT,
  sessions_created BIGINT,
  users_processed BIGINT
) AS $$
DECLARE
  v_user_record RECORD;
  v_conversation_record RECORD;
  v_current_session_id UUID;
  v_last_message_time TIMESTAMP;
  v_time_gap INTERVAL;
  v_sessions_created BIGINT := 0;
  v_conversations_processed BIGINT := 0;
  v_users_processed BIGINT := 0;
BEGIN
  -- Process each user
  FOR v_user_record IN
    SELECT DISTINCT user_id FROM conversations WHERE session_id IS NULL ORDER BY user_id
  LOOP
    v_users_processed := v_users_processed + 1;
    v_current_session_id := NULL;
    v_last_message_time := NULL;

    -- Process conversations for this user in chronological order
    FOR v_conversation_record IN
      SELECT id, created_at
      FROM conversations
      WHERE user_id = v_user_record.user_id AND session_id IS NULL
      ORDER BY created_at ASC
    LOOP
      -- Calculate time gap
      IF v_last_message_time IS NOT NULL THEN
        v_time_gap := v_conversation_record.created_at - v_last_message_time;
      END IF;

      -- Create new session if needed
      IF v_current_session_id IS NULL OR
         (v_time_gap IS NOT NULL AND v_time_gap > (p_session_timeout_minutes || ' minutes')::INTERVAL) THEN

        -- End previous session if exists
        IF v_current_session_id IS NOT NULL THEN
          UPDATE chat_sessions
          SET ended_at = v_last_message_time
          WHERE id = v_current_session_id;
        END IF;

        -- Create new session
        INSERT INTO chat_sessions (user_id, started_at, last_activity_at)
        VALUES (v_user_record.user_id, v_conversation_record.created_at, v_conversation_record.created_at)
        RETURNING id INTO v_current_session_id;

        v_sessions_created := v_sessions_created + 1;
      END IF;

      -- Assign conversation to current session
      UPDATE conversations
      SET session_id = v_current_session_id
      WHERE id = v_conversation_record.id;

      -- Update session's last_activity_at
      UPDATE chat_sessions
      SET last_activity_at = v_conversation_record.created_at,
          message_count = message_count + 1
      WHERE id = v_current_session_id;

      v_last_message_time := v_conversation_record.created_at;
      v_conversations_processed := v_conversations_processed + 1;
    END LOOP;

    -- Mark the last session as ended
    IF v_current_session_id IS NOT NULL THEN
      UPDATE chat_sessions
      SET ended_at = v_last_message_time
      WHERE id = v_current_session_id AND ended_at IS NULL;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_conversations_processed, v_sessions_created, v_users_processed;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- STEP 7: UPDATE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on chat_sessions" ON chat_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- STEP 8: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v3.1.0', 'Add chat_sessions table with 30-minute timeout and session tracking');

-- =============================================================================
-- MIGRATION INSTRUCTIONS
-- =============================================================================

-- To apply this migration:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Optionally run: SELECT * FROM backfill_chat_sessions(30);
--    (This will organize existing conversations into sessions)
-- 3. Update bot code to use get_or_create_session() function
-- 4. Verify sessions are being created correctly

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================

-- To rollback this migration (use with caution!):
-- DROP TRIGGER IF EXISTS update_session_count_on_message_insert ON conversations;
-- DROP FUNCTION IF EXISTS update_session_message_count();
-- DROP FUNCTION IF EXISTS get_or_create_session(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS backfill_chat_sessions(INTEGER);
-- ALTER TABLE conversations DROP COLUMN IF EXISTS session_id;
-- DROP TABLE IF EXISTS chat_sessions;
-- DELETE FROM schema_versions WHERE version = 'v3.1.0';
