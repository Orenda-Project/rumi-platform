# Session Tracking Migration Guide

**Version:** v3.1.0
**Date:** November 4, 2025
**Purpose:** Add explicit session tracking with 30-minute timeout rule

---

## What's Changing?

We're adding **explicit session tracking** to better organize conversations and measure user engagement.

### Before (v3.0)
- Messages stored individually with timestamps
- No explicit "session" concept
- Sessions calculated on-the-fly when needed

### After (v3.1)
- ✅ Each conversation belongs to a **chat session**
- ✅ Sessions automatically timeout after **30 minutes** of inactivity
- ✅ Sessions track: start time, end time, message count, session type
- ✅ Better analytics: sessions per day, average session length, etc.

---

## How It Works

### Session Lifecycle

```
User sends message
  ↓
Check last activity
  ↓
If < 30 min ago → Continue existing session
If > 30 min ago → Create new session
  ↓
Store message with session_id
```

### Example Timeline

```
10:00 AM - User: "Help with fractions"        → Session A created
10:01 AM - Bot: "Here's a lesson plan"        → Session A (1 min gap)
10:05 AM - User: "Thanks!"                    → Session A (4 min gap)

--- 35 minute gap ---

10:40 AM - User: "Now I need English help"    → Session B created (>30 min)
10:41 AM - Bot: "Sure, what topic?"           → Session B (1 min gap)
```

**Result:** 2 sessions, Session A = 3 messages, Session B = 2 messages

---

## Migration Steps

### Step 1: Run Database Migration

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Click on your project: **Digital Coach**
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy the entire contents of `/shared/database/migrations/001_add_chat_sessions.sql`
6. Paste into SQL Editor
7. Click **Run** (or press F5)

You should see:
```
Success. No rows returned
```

This creates:
- ✅ `chat_sessions` table
- ✅ `session_id` column in `conversations` table
- ✅ Helper functions for session management
- ✅ Triggers for auto-updating message counts

### Step 2: Backfill Existing Conversations (Optional)

If you want to organize your **existing conversation history** into sessions:

1. In Supabase SQL Editor, run:
```sql
SELECT * FROM backfill_chat_sessions(30);
```

This will:
- Go through all existing conversations
- Group them into sessions based on 30-minute gaps
- Update all conversations with appropriate `session_id`

**Example output:**
```
total_conversations | sessions_created | users_processed
--------------------|------------------|----------------
                 45 |               12 |               3
```

**Note:** This can take a few minutes if you have lots of conversations. It's safe to skip if you only care about tracking new sessions going forward.

### Step 3: Deploy Updated Bot Code

The bot code has been updated to automatically use sessions. Just deploy:

```bash
git pull origin main
```

Railway will auto-deploy the changes.

### Step 4: Verify Sessions Are Working

1. Send a test message to the bot
2. Go to Supabase Dashboard → **Table Editor** → **chat_sessions**
3. You should see a new session created!

Check the session fields:
- `user_id` - Links to the user
- `started_at` - When session began
- `last_activity_at` - Last message time
- `ended_at` - NULL (session is still active)
- `message_count` - Number of messages in session
- `session_type` - Type of conversation ('general', 'lesson_plan', etc.)

---

## What Changed in the Code

### 1. New Table: `chat_sessions`

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  started_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  ended_at TIMESTAMP,  -- NULL if active
  message_count INTEGER,
  session_type VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 2. Updated Table: `conversations`

Added column:
```sql
session_id UUID REFERENCES chat_sessions(id)
```

### 3. New Helper Functions

**In `shared/database/bot-helpers.js`:**

- `getOrCreateSession(userId, timeoutMinutes)` - Gets active session or creates new one
- `updateSessionType(sessionId, sessionType)` - Sets session type (lesson_plan, presentation, etc.)

**`storeConversation` now accepts optional `sessionId`:**
```javascript
// Old
await storeConversation(userId, 'user', message, 'text');

// New (auto-creates session if not provided)
await storeConversation(userId, 'user', message, 'text', sessionId);
```

### 4. Bot Behavior

The bot now automatically:
- ✅ Creates a new session when user messages after 30+ minutes
- ✅ Continues existing session if user messages within 30 minutes
- ✅ Tracks session type (lesson_plan, presentation, general)
- ✅ Stores all messages with their session_id

**No code changes needed for basic functionality** - session management is automatic!

---

## New Analytics Possibilities

### Dashboard Queries You Can Now Do

**1. Sessions per day:**
```javascript
const { data } = await supabase
  .from('chat_sessions')
  .select('*')
  .gte('started_at', yesterday)
  .lte('started_at', today);

console.log(`Sessions today: ${data.length}`);
```

**2. Average session length:**
```javascript
const { data } = await supabase
  .from('chat_sessions')
  .select('started_at, ended_at')
  .not('ended_at', 'is', null);

const avgLength = data.reduce((sum, session) => {
  const duration = new Date(session.ended_at) - new Date(session.started_at);
  return sum + duration;
}, 0) / data.length / 1000 / 60; // Convert to minutes

console.log(`Average session: ${avgLength.toFixed(1)} minutes`);
```

**3. Most common session types:**
```javascript
const { data } = await supabase
  .from('chat_sessions')
  .select('session_type')
  .not('session_type', 'is', null);

const typeCounts = data.reduce((acc, { session_type }) => {
  acc[session_type] = (acc[session_type] || 0) + 1;
  return acc;
}, {});

console.log('Session types:', typeCounts);
// Output: { general: 45, lesson_plan: 23, presentation: 12 }
```

**4. Messages per session:**
```javascript
const { data } = await supabase
  .from('chat_sessions')
  .select('message_count');

const avgMessages = data.reduce((sum, s) => sum + s.message_count, 0) / data.length;
console.log(`Average messages per session: ${avgMessages.toFixed(1)}`);
```

---

## Rollback Instructions

If you need to remove sessions (not recommended, but possible):

1. Go to Supabase SQL Editor
2. Run:
```sql
-- Remove session tracking
DROP TRIGGER IF EXISTS update_session_count_on_message_insert ON conversations;
DROP FUNCTION IF EXISTS update_session_message_count();
DROP FUNCTION IF EXISTS get_or_create_session(UUID, INTEGER);
DROP FUNCTION IF EXISTS backfill_chat_sessions(INTEGER);

-- Remove session_id from conversations
ALTER TABLE conversations DROP COLUMN IF EXISTS session_id;

-- Remove chat_sessions table
DROP TABLE IF EXISTS chat_sessions;

-- Remove version entry
DELETE FROM schema_versions WHERE version = 'v3.1.0';
```

**Warning:** This will delete all session data!

---

## Troubleshooting

### Issue: "relation 'chat_sessions' does not exist"

**Solution:** You didn't run the migration yet. Go to Step 1 and run the migration SQL.

### Issue: backfill_chat_sessions is taking too long

**Solution:** If you have 1000s of conversations, the backfill can take 5-10 minutes. You can:
- Wait for it to finish, OR
- Skip backfill and only track new sessions going forward

### Issue: Sessions aren't being created

**Solution:**
1. Check Supabase logs for errors
2. Verify the migration ran successfully
3. Check that bot code is updated (`git pull`)
4. Check Railway deployment logs

---

## Benefits of This Change

### For You (Admin)
- ✅ Better analytics: sessions per day, session length, engagement metrics
- ✅ Understand user behavior patterns
- ✅ Measure feature usage (how many lesson plan sessions vs general help)
- ✅ Track user retention (sessions per user over time)

### For Users
- ✅ More organized conversation history
- ✅ Bot can understand session context better
- ✅ Future: Could show "Your last session was about fractions"

### For Future Features
- ✅ Session summaries (at end of session, show recap)
- ✅ Session goals ("Let's work on your lesson plan" → track goal completion)
- ✅ Multi-turn conversations (bot remembers session context)
- ✅ Session-based recommendations

---

## Questions?

If you have questions or run into issues:

1. Check **Railway logs** for bot errors
2. Check **Supabase logs** for database errors
3. Check the bot code: `shared/database/bot-helpers.js` (lines 72-185)
4. Check the migration file: `shared/database/migrations/001_add_chat_sessions.sql`

---

**Last Updated:** November 4, 2025
**Schema Version:** v3.1.0
**Migration Status:** Ready to deploy
