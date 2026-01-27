/**
 * Migration 008: Get Users Sorted by Last Activity
 *
 * Purpose: Create database function to return users sorted by their most recent conversation
 * This fixes the bug where users with recent conversations don't appear at the top of the list
 *
 * Before: Users sorted by account creation date (created_at)
 * After: Users sorted by most recent conversation timestamp
 *
 * Example: User 923001234567
 *   - Created: Nov 14, 2025
 *   - Last conversation: Nov 21, 2025
 *   - Was buried deep in list, now appears at top
 */

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_users_with_last_activity(integer, integer);

-- Create function to get users with their most recent conversation timestamp
CREATE OR REPLACE FUNCTION get_users_with_last_activity(
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  phone_number TEXT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  registration_completed BOOLEAN,
  registration_state TEXT,
  registration_started_at TIMESTAMP WITH TIME ZONE,
  registration_completed_at TIMESTAMP WITH TIME ZONE,
  registration_state_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  last_conversation_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    u.id,
    u.phone_number,
    u.name,
    u.first_name,
    u.last_name,
    u.registration_completed,
    u.registration_state,
    u.registration_started_at,
    u.registration_completed_at,
    u.registration_state_updated_at,
    u.created_at,
    MAX(c.created_at) as last_conversation_at
  FROM users u
  LEFT JOIN conversations c ON c.user_id = u.id
  GROUP BY
    u.id,
    u.phone_number,
    u.name,
    u.first_name,
    u.last_name,
    u.registration_completed,
    u.registration_state,
    u.registration_started_at,
    u.registration_completed_at,
    u.registration_state_updated_at,
    u.created_at
  ORDER BY
    -- Users with conversations sorted by most recent conversation
    -- Users without conversations sorted by account creation
    COALESCE(MAX(c.created_at), u.created_at) DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Add comment
COMMENT ON FUNCTION get_users_with_last_activity IS
  'Returns users sorted by their most recent conversation timestamp. Users with recent activity appear first.';
