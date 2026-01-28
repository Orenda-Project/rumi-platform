# Monitoring & Observability Guide

How to monitor your Rumi deployment, set up dashboards, and debug issues.

---

## Quick Start

### 1. Built-in Dashboard (Phase 2)

The Rumi platform includes a built-in observability dashboard. After deploying the bot (Phase 1), add the dashboard:

```bash
cd dashboard
npm install

# Set environment variables (see .env.template "Dashboard" sections)
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your_secure_password
export SESSION_SECRET=random_secret_string
export DASHBOARD_PORT=3001

# Run locally
node index.js
# Dashboard available at http://localhost:3001
```

**What it shows:**
- Registered teachers and engagement metrics
- Coaching session history with OECD scores
- Reading assessment results and fluency trends
- WhatsApp broadcast tracking
- System queue status

**Deploy as Railway service:**
Add a second service in Railway pointing to the `dashboard/` directory, sharing the same Supabase database.

### 2. Railway Logs (No Setup Required)

Railway provides built-in logging for all services:

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# View live logs
railway logs --service "your-service-name"

# View logs with filtering
railway logs --service "your-service-name" | grep "ERROR"
```

### 3. Axiom (Structured Logging - Optional)

For advanced log aggregation and querying, set up Axiom:

1. Create free account at axiom.co
2. Create a dataset (e.g., `rumi-logs`)
3. Generate an API token
4. Add to `.env`:

```env
AXIOM_TOKEN=xapt-your-token
AXIOM_DATASET=rumi-logs
```

The bot automatically sends structured logs to Axiom when these variables are set.

**Useful Axiom queries:**

```
# All errors in last hour
status == "error" | sort _time desc

# Coaching sessions by duration
coaching_session_id != "" | stats avg(duration_seconds), count() by status

# Slow API responses (>5s)
response_time_ms > 5000 | sort response_time_ms desc
```

---

## What to Monitor

### Health Checks

The bot exposes a health endpoint at `/health` (or root `/`). Monitor it with any uptime service:

| Service | URL to Monitor | Expected Response |
|---------|---------------|-------------------|
| Bot | `https://your-bot.railway.app/` | 200 OK |
| Dashboard | `https://your-dashboard.railway.app/` | 200 OK |
| BullMQ Worker | Check Railway service status | Process running |

### Key Metrics

| Metric | Where to Find | Alert Threshold |
|--------|--------------|-----------------|
| Message response time | Axiom or Railway logs | > 10 seconds |
| Failed coaching sessions | `coaching_sessions` table, `status = 'failed'` | Any |
| Queue backlog | Redis / BullMQ dashboard | > 50 jobs waiting |
| Error rate | Axiom: `status == "error"` | > 5% of requests |
| Transcription failures | Axiom: `"transcription" AND "error"` | Any |
| Memory usage | Railway metrics dashboard | > 80% |

### Database Queries for Monitoring

Run these against your Supabase database:

```sql
-- Active users in last 24 hours
SELECT COUNT(DISTINCT user_id) as active_users
FROM conversations
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Failed coaching sessions (last 7 days)
SELECT id, user_id, status, error_message, created_at
FROM coaching_sessions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Reading assessment completion rate
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1) as completion_rate
FROM reading_sessions
WHERE created_at > NOW() - INTERVAL '7 days';

-- Queue job status summary
SELECT status, COUNT(*) as count
FROM coaching_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Top errors (if you log to a table)
SELECT error_message, COUNT(*) as occurrences
FROM coaching_sessions
WHERE status = 'failed'
GROUP BY error_message
ORDER BY occurrences DESC
LIMIT 10;
```

---

## Troubleshooting

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Bot not responding | Webhook URL misconfigured | Verify webhook URL in Meta Business Manager matches Railway URL |
| Slow responses (>30s) | LLM timeout or Redis connection | Check Railway logs for timeout errors; verify Redis is running |
| Coaching stuck at "analyzing" | Worker process crashed | Restart the worker service in Railway; check for memory issues |
| "Audio too short" errors | User sent < 3 second audio | Normal behavior — user needs to send longer recordings |
| Reading assessment stuck | Soniox API timeout | Check Soniox API status; verify `SONIOX_API_KEY` is valid |
| No voice responses | ElevenLabs quota exceeded | Check ElevenLabs dashboard for usage; bot falls back to text |

### Debug Commands

```bash
# Test all connections (Supabase, Redis, LLM)
cd bot && node infrastructure/scripts/test-connections.js

# Validate environment variables
cd bot && npm run validate:env

# Test webhook locally (without WhatsApp)
cd bot && npm run simulate

# Check Redis queue status
cd bot && node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.keys('bull:*').then(keys => {
  console.log('Queue keys:', keys.length);
  redis.quit();
});
"
```

### Log Levels

The bot uses structured logging via `logToFile()`. Key patterns to search for:

| Pattern | Meaning |
|---------|---------|
| `Starting pedagogical analysis` | Coaching analysis began |
| `Analysis completed` | Coaching analysis finished successfully |
| `Error in processAnalysis` | Coaching analysis failed |
| `Queueing reading assessment` | Reading assessment started |
| `Starting report generation` | Report PDF being created |
| `Reflective question generated` | Coaching Q&A in progress |

---

## Setting Up Alerts

### Option A: Railway Alerts

Railway provides built-in alerts for:
- Service crashes / restarts
- Memory threshold exceeded
- Deployment failures

Configure in Railway dashboard → Service → Settings → Notifications.

### Option B: External Monitoring

Use any HTTP monitoring service (UptimeRobot, Better Stack, Checkly) to ping your bot's health endpoint every 1-5 minutes.

### Option C: Database-Based Alerts

Create a simple cron job that queries for failure conditions:

```javascript
// scripts/check-health.js
const supabase = require('./bot/shared/config/supabase');

async function checkHealth() {
  // Check for stuck coaching sessions (>30 min in "analyzing")
  const { data: stuck } = await supabase
    .from('coaching_sessions')
    .select('id')
    .eq('status', 'analyzing')
    .lt('analysis_started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (stuck?.length > 0) {
    console.error(`ALERT: ${stuck.length} stuck coaching sessions`);
    // Send notification (email, Slack, etc.)
  }
}
```

---

## Portal Setup (Phase 2)

The Teacher Portal provides a web interface for teachers to view their coaching history and reading results.

```bash
cd portal
npm install
npm run dev
# Portal available at http://localhost:5173
```

**Deploy:** Build and deploy to any static hosting (Vercel, Netlify, Railway):

```bash
cd portal
npm run build
# Deploy the dist/ directory
```

**Environment:** The portal connects directly to Supabase using the client-side anon key. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the portal's build environment.

See `portal/GITHUB_ACTIONS_SETUP.md` for CI/CD auto-deployment.
