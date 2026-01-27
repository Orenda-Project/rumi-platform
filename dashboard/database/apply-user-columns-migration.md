# Apply User Funnel Columns Migration

## Quick Steps

The funnel tracking tables (`website_visits`, `cta_clicks`, `chat_starts`) already exist! ✅

We just need to add 4 new columns to the `users` table.

### Option 1: Supabase Dashboard (Recommended - 2 minutes)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql)
2. Click **SQL Editor** in the left sidebar
3. Click **+ New Query**
4. Copy and paste the following SQL:

```sql
-- Add funnel tracking columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id);

-- Add comments
COMMENT ON COLUMN users.source IS 'User acquisition source: website, direct, or referral';
COMMENT ON COLUMN users.session_id IS 'Website session ID that led to signup';
COMMENT ON COLUMN users.first_message_at IS 'Timestamp of first WhatsApp message';
COMMENT ON COLUMN users.registered_at IS 'Timestamp when registration completed';
```

5. Click **Run** (or press Cmd+Enter)
6. You should see "Success. No rows returned"

### Option 2: Run via Command Line

If you have the direct Postgres connection details:

```bash
cd dashboard
psql "postgres://postgres:[PASSWORD]@db.YOUR_PROJECT_REF.supabase.co:5432/postgres" -f database/migrations/002_add_user_funnel_columns.sql
```

Replace `[PASSWORD]` with your Supabase database password.

## Verify Migration

After running the SQL, verify it worked:

```bash
cd dashboard
node database/verify-funnel-migration.js
```

You should see:
```
✅ Table 'website_visits': EXISTS
✅ Table 'cta_clicks': EXISTS
✅ Table 'chat_starts': EXISTS
✅ Users table: New columns added successfully
```

## What These Columns Do

- **`source`**: Tracks where the user came from (`website`, `direct`, or `referral`)
- **`session_id`**: Links the user back to their anonymous website session
- **`first_message_at`**: Records when they first messaged the bot
- **`registered_at`**: Records when they completed registration

This enables funnel analysis: Website Visit → CTA Click → Chat Start → Registration
