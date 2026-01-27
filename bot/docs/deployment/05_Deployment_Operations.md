# Deployment & Operations

Production deployment guide and ongoing maintenance procedures.

---

## Database Migrations

### Required Migrations (In Order)

Before deploying the application, ensure all database migrations are applied:

#### 1. Core Schema (001_add_chat_sessions.sql)
```bash
# Run in Supabase SQL Editor
# Creates: users, chat_sessions, conversations tables
```

#### 2. Registration Fields (002_add_registration_fields.sql)
```bash
# Adds: first_name, last_name, registration fields to users
```

#### 3. Classroom Coaching (003_classroom_coaching.sql)
```bash
# Creates: coaching_sessions, coaching_processing_queue (deprecated),
#          coaching_quality_metrics tables
# Creates: RPC functions for job queue
```

#### 4. Audio ID Column (add-audio-id-column.sql)
```bash
# Adds: audio_id column to coaching_sessions
# Purpose: Store WhatsApp media ID for audio download
```

**CRITICAL**: This migration is required for classroom coaching to work.

**To apply**:
1. Open Supabase Dashboard → SQL Editor
2. Copy content from `/shared/database/migrations/add-audio-id-column.sql`
3. Execute SQL
4. Verify: `SELECT audio_id FROM coaching_sessions LIMIT 1;`

#### 5. Coaching Jobs Table (create-coaching-jobs-table.sql)
```bash
# Replaces: coaching_processing_queue (from migration 003)
# Creates: coaching_jobs table with improved schema
# Creates: 5 RPC functions for distributed job processing
```

**CRITICAL**: This migration is required for the background worker.

**RPC Functions Created**:
- `queue_coaching_job(p_session_id, p_job_type, p_payload)` - Add job to queue
- `claim_next_coaching_job(p_worker_id, p_max_attempts)` - Atomic job claiming with SKIP LOCKED
- `complete_coaching_job(p_job_id)` - Mark job as completed
- `fail_coaching_job(p_job_id, p_error_message, p_error_stack, p_retry_delay_seconds)` - Handle failures with retry
- `get_pending_jobs_count()` - Monitor queue health

**To apply**:
1. Open Supabase Dashboard → SQL Editor
2. Copy content from `/shared/database/migrations/create-coaching-jobs-table.sql`
3. Execute SQL
4. Verify RPC functions exist:
   ```sql
   SELECT routine_name
   FROM information_schema.routines
   WHERE routine_name LIKE '%coaching%';
   ```

### Verify Migrations

After running all migrations:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'chat_sessions', 'conversations',
                     'coaching_sessions', 'coaching_jobs',
                     'coaching_quality_metrics');

-- Check coaching_sessions has audio_id column
SELECT column_name FROM information_schema.columns
WHERE table_name = 'coaching_sessions'
  AND column_name = 'audio_id';

-- Check RPC functions
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('queue_coaching_job', 'claim_next_coaching_job',
                       'complete_coaching_job', 'fail_coaching_job');
```

Expected results:
- 6 tables
- audio_id column present
- 4+ RPC functions

---

## Railway Deployment (Current)

Railway provides automatic deployments from GitHub with built-in HTTPS and environment variable management.

### Initial Deployment

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login**:
   ```bash
   railway login
   ```

3. **Link Project**:
   ```bash
   railway link
   ```
   Select "digital coach" from the list.

4. **Set Environment Variables**:
   ```bash
   railway variables --set WHATSAPP_TOKEN=EAAYour_Token
   railway variables --set PHONE_NUMBER_ID=123456789012345
   railway variables --set WEBHOOK_VERIFY_TOKEN=your_token
   railway variables --set OPENAI_API_KEY=sk-proj-Your_Key
   railway variables --set SONIOX_API_KEY=Your_Key
   railway variables --set GAMMA_API_KEY=sk-gamma-Your_Key
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

6. **Get Public URL**:
   ```bash
   railway open
   ```
   Copy the Railway-provided domain (e.g., `https://your-app-production.up.railway.app`)

7. **Update WhatsApp Webhook**:
   - Meta Business Platform → WhatsApp → Configuration
   - Update webhook URL to `https://your-app.railway.app/webhook`
   - Verify and save

### Automated Deployments

Railway auto-deploys when you push to `main`:

```bash
git push origin main
```

**Deployment Process**:
1. Railway detects push
2. Runs `npm install`
3. Starts with `npm start`
4. Health checks the deployment
5. Switches traffic to new version

**Monitor Deployment**:
```bash
railway logs --tail 100
```

### Manual Deployment

Deploy without pushing to GitHub:

```bash
railway up
```

Uploads local code directly.

### Rollback

Revert to previous deployment:

```bash
railway rollback
```

---

## Background Worker Deployment

The classroom coaching feature requires a **separate Railway service** running the background worker.

### Architecture

```
[Web Server Service]     [Worker Service]
whatsapp-bot.js     ←→   coaching-processor.js
     ↓                            ↓
[coaching_jobs table in Supabase]
```

Both services:
- Share the same Supabase database
- Run independently (different Railway services)
- Scale independently

### Deploy Worker to Railway

#### Method 1: Railway Dashboard (Recommended)

1. **Create New Service**:
   - Railway Dashboard → Project → New Service
   - Select "Empty Service"
   - Name it "coaching-worker"

2. **Configure Service**:
   - Settings → Build:
     - Build Command: `npm install`
     - Start Command: `node workers/coaching-processor.js`

3. **Set Environment Variables**:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   WHATSAPP_TOKEN=EAAYour_Token
   PHONE_NUMBER_ID=123456789012345
   SONIOX_API_KEY=Your_Key
   OPENAI_API_KEY=sk-proj-Your_Key
   CLOUDFLARE_R2_ACCESS_KEY_ID=your_key
   CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret
   CLOUDFLARE_R2_BUCKET_NAME=your_bucket
   CLOUDFLARE_R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com

   # Worker-specific settings (optional)
   COACHING_WORKER_CONCURRENCY=3
   COACHING_POLL_INTERVAL=1000
   COACHING_WORKER_HEALTH_PORT=3100
   NODE_ENV=production
   ```

4. **Deploy**:
   - Connect to GitHub repository (same repo as web server)
   - Railway automatically deploys
   - Monitor logs: Railway Dashboard → coaching-worker → Deployments

5. **Verify Worker is Running**:
   ```bash
   # Check health endpoint
   curl https://your-worker-production.up.railway.app/health

   # Expected response:
   {
     "status": "healthy",
     "worker": {
       "workerId": "worker-...",
       "isRunning": true,
       "activeJobs": 0,
       "totalJobsProcessed": 42
     }
   }
   ```

#### Method 2: Railway CLI

```bash
# Create new service
railway service create coaching-worker

# Link to service
railway service link

# Set environment variables
railway variables --set SUPABASE_URL=...
railway variables --set SUPABASE_SERVICE_ROLE_KEY=...
# ... (set all variables from Method 1)

# Deploy
railway up

# View logs
railway logs --tail 100
```

### Worker Configuration Options

**Environment Variables**:

| Variable | Default | Description |
|----------|---------|-------------|
| `COACHING_WORKER_CONCURRENCY` | 3 | Jobs processed simultaneously |
| `COACHING_POLL_INTERVAL` | 1000 | Milliseconds between queue polls |
| `COACHING_ERROR_BACKOFF` | 5000 | Milliseconds to wait after error |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | 30000 | Max time to wait for jobs on shutdown |
| `COACHING_WORKER_HEALTH_PORT` | 3100 | Port for health check endpoint |

**Scaling Recommendations**:

| Users | Workers | Concurrency per Worker | Total Capacity |
|-------|---------|------------------------|----------------|
| 100 | 1 | 3 | 3 concurrent jobs |
| 500 | 2 | 3 | 6 concurrent jobs |
| 1,000 | 3 | 3 | 9 concurrent jobs |
| 5,000 | 5 | 5 | 25 concurrent jobs |

### Monitor Worker Health

**Health Check Endpoints**:

```bash
# Overall health
GET /health
Response: {"status": "healthy", "worker": {...}}

# Readiness probe (for load balancers)
GET /ready
Response: {"ready": true}

# Worker statistics
GET /stats
Response: {
  "workerId": "worker-hostname-12345",
  "activeJobs": 2,
  "totalJobsProcessed": 156,
  "jobsSucceeded": 150,
  "jobsFailed": 6,
  "successRate": "96.15%",
  "uptimeSeconds": 86400
}
```

**Check Queue Health** (Supabase SQL Editor):

```sql
-- Pending jobs
SELECT COUNT(*) FROM coaching_jobs WHERE status = 'pending';

-- Processing jobs (should be < worker_count * concurrency)
SELECT COUNT(*) FROM coaching_jobs WHERE status = 'processing';

-- Failed jobs (investigate if > 0)
SELECT * FROM coaching_jobs WHERE status = 'failed' ORDER BY created_at DESC;

-- Jobs by status
SELECT status, COUNT(*) FROM coaching_jobs GROUP BY status;

-- Stuck jobs (processing > 30 minutes)
SELECT * FROM coaching_jobs
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '30 minutes';
```

### Troubleshooting Worker Issues

**Worker Not Claiming Jobs**:

1. Check worker logs:
   ```bash
   railway logs --service coaching-worker --tail 100
   ```

2. Verify RPC functions exist:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'claim_next_coaching_job';
   ```

3. Test RPC function manually:
   ```sql
   SELECT * FROM claim_next_coaching_job('test-worker-123', 3);
   ```

4. Check database permissions:
   ```sql
   -- Service role should have EXECUTE permission
   GRANT EXECUTE ON FUNCTION claim_next_coaching_job TO service_role;
   ```

**Jobs Stuck in "Processing"**:

This can happen if worker crashes mid-job. The job needs manual intervention:

```sql
-- Reset stuck jobs to pending
UPDATE coaching_jobs
SET status = 'pending',
    worker_id = NULL,
    started_at = NULL,
    scheduled_for = NOW()
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '1 hour';
```

**Worker Crashes Immediately**:

1. Check for missing environment variables:
   ```bash
   railway logs | grep -i "error"
   ```

2. Common issues:
   - Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`
   - Invalid service role key (use service_role, not anon key)
   - Missing Cloudflare R2 credentials
   - Port conflict (change `COACHING_WORKER_HEALTH_PORT`)

**High Memory Usage**:

1. Check concurrency setting:
   ```bash
   # Reduce from 3 to 2
   railway variables --set COACHING_WORKER_CONCURRENCY=2
   ```

2. Monitor with Railway dashboard:
   - Dashboard → coaching-worker → Metrics
   - Look for memory spikes during transcription jobs

3. Increase Railway memory:
   - Settings → Resources
   - Upgrade to 2GB or 4GB plan

### Worker Update Process

When deploying code changes that affect the worker:

1. **Update code** (commit and push):
   ```bash
   git add workers/coaching-processor.js shared/services/
   git commit -m "fix: update coaching worker logic"
   git push origin main
   ```

2. **Railway auto-deploys** both services:
   - Web server redeploys
   - Worker redeploys with graceful shutdown

3. **Monitor deployment**:
   ```bash
   railway logs --service coaching-worker --tail 50
   ```

4. **Verify worker restarted**:
   ```bash
   curl https://coaching-worker.railway.app/health
   # Check uptimeSeconds is low (recently restarted)
   ```

**Graceful Shutdown**:
- Worker receives SIGTERM from Railway
- Finishes active jobs (up to 30 seconds)
- Marks incomplete jobs as pending
- Exits cleanly

**Zero-Downtime Updates**:
- Deploy multiple worker instances
- Railway rolls out updates one at a time
- Jobs automatically distributed to healthy workers

---

## Cost Structure

### Monthly Operational Costs

**Assumptions** (100 teachers):
- 10 messages per teacher per week
- 30% voice messages
- 10 lesson plan requests per week

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Railway (Hosting) | $0-5 | Free tier sufficient |
| WhatsApp Cloud API | $0 | Within free 1,000 conversations |
| OpenAI (GPT-4 + TTS) | $17 | ~$0.02 per text, $0.03 per voice |
| Soniox (Transcription) | $0.10 | $0.10 per hour |
| Gamma AI (Lesson Plans) | $10 (est.) | Not publicly documented |
| **Total** | **$32-37** | **$0.32 per teacher** |

### Cost Optimization

**Use GPT-3.5-Turbo** (90% cheaper):
```javascript
// In whatsapp-bot.js
const completion = await openai.chat.completions.create({
  model: "gpt-3.5-turbo",  // Changed from "gpt-4"
  messages: conversationHistory
});
```
**Savings**: ~$15/month → ~$1.50/month

**Cache Common Responses**: Reduce API calls by 30-50%

**Limit Lesson Plans**: Rate-limit to 2 per teacher per week

### Scaling Costs

| Users | Monthly Cost | Cost per User |
|-------|--------------|---------------|
| 100 | $32 | $0.32 |
| 500 | $145 | $0.29 |
| 1,000 | $280 | $0.28 |
| 5,000 | $1,350 | $0.27 |

---

## Maintenance Tasks

### Daily Operations

**Check Service Health**:
```bash
railway status
```

**View Recent Logs**:
```bash
railway logs --tail 50
```

**Check Error Rate**:
```bash
railway logs | grep -i error | wc -l
```

**Expected**: 0-5 errors per day normal, >10 investigate.

### Weekly Maintenance

**Clean Up Soniox Resources**:
```bash
node check-soniox-status.js
```

If total files > 80:
```bash
node cleanup-soniox.js
```

**Review Logs**:
```bash
railway logs --since 7d > weekly-logs.txt
```

Analyze for patterns:
- Frequent timeouts
- Repeated API errors
- Traffic spikes

**Check API Costs**:
- OpenAI: https://platform.openai.com/account/usage
- Soniox: https://console.soniox.com
- WhatsApp: https://business.facebook.com/billing

### Monthly Maintenance

**API Key Rotation** (every 90 days):
1. Generate new key in platform
2. Update Railway:
   ```bash
   railway variables --set OPENAI_API_KEY=new_key
   ```
3. Deployment auto-restarts
4. Revoke old key after 24 hours

**Update Dependencies**:
```bash
npm audit                # Check for security issues
npm update               # Update non-breaking changes
npm start                # Test locally
git commit -am "chore: Update dependencies"
git push origin main     # Deploy
```

**Backup Configuration**:
```bash
railway variables > backup-vars-2025-11.txt
# Encrypt and store securely
zip -e backup.zip backup-vars-2025-11.txt
```

---

## Monitoring & Alerts

### Current Monitoring

**Railway Dashboard**:
- CPU/memory usage
- Request rate
- Error rate
- Deployment history

**Log Analysis**:
```bash
# Error count
railway logs | grep "ERROR" | wc -l

# Average response time (manual parsing)
railway logs | grep "response time"

# Specific user issues
railway logs | grep "923001234567"
```

### Recommended Additions

**Uptime Monitoring**: UptimeRobot, Pingdom
- Ping `/` endpoint every 5 minutes
- Alert on downtime

**Error Tracking**: Sentry, Rollbar
- Capture exceptions
- Track error rates
- User context

**Analytics**: Mixpanel, Amplitude
- Message volume
- Feature usage
- User engagement

---

## Security Considerations

### Current Implementation

✅ **Webhook Verification**: Prevents unauthorized POST requests
✅ **Environment Variables**: No hardcoded secrets
✅ **HTTPS Only**: Enforced by Railway and Meta
✅ **Message Deduplication**: Prevents replay attacks
✅ **Temporary File Cleanup**: No sensitive data retention

### Production Recommendations

🔲 **Add Rate Limiting**:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each user to 100 requests per windowMs
});

app.post('/webhook', limiter, async (req, res) => {
  // ...
});
```

🔲 **Implement Request Signing**: Verify webhook authenticity

🔲 **Add User Authentication**: Verify teacher identity

🔲 **IP Whitelisting**: Restrict webhook sources

🔲 **Conversation Encryption**: Encrypt history at rest

🔲 **PII Redaction**: Remove sensitive data from logs

---

## Alternative Hosting Options

### Render.com

**Setup**:
1. Create account at https://render.com
2. Connect GitHub repository
3. Create Web Service
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables

**Cost**: Free tier (sleeps after 15 min inactivity)

**Pros**: Simple, good free tier
**Cons**: Cold starts on free tier

### Heroku

**Setup**:
```bash
heroku create digital-coach-bot
heroku config:set WHATSAPP_TOKEN=...
git push heroku main
```

**Cost**: $7/month minimum (no free tier as of 2023)

**Pros**: Mature platform, many add-ons
**Cons**: More expensive than Railway

### AWS EC2

**Setup** (Advanced):
1. Launch EC2 instance (Ubuntu 22.04)
2. Install Node.js 18+
3. Clone repository
4. Set up systemd service
5. Configure nginx reverse proxy
6. Set up SSL with Let's Encrypt

**Cost**: ~$5-10/month (t3.micro instance)

**Pros**: Full control, scalable
**Cons**: Complex setup, more maintenance

---

## Disaster Recovery

### Backup Strategy

**What to Backup**:
- Environment variables
- Code (git handles this)
- Conversation history (if using database)

**Railway Variable Backup**:
```bash
railway variables > backup-vars-2025-11.txt
gpg --encrypt backup-vars-2025-11.txt
# Store in 1Password, LastPass, etc.
```

### Recovery Procedures

**Railway Downtime**:
1. Deploy to alternative hosting (Render, Heroku)
2. Update webhook URL in Meta Console
3. Restore environment variables

**API Key Compromise**:
1. Immediately revoke compromised key
2. Generate new key
3. Update Railway variables
4. Monitor for unauthorized usage

**Code Corruption**:
1. Revert to last known good commit:
   ```bash
   git revert HEAD
   git push origin main
   ```
2. Railway auto-deploys fixed version

---

## Performance Benchmarks

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Text response time | 3-10s | <15s | 90th percentile |
| Voice response time | 10-40s | <30s | 90th percentile |
| Lesson plan time | 40-110s | <120s | 90th percentile |
| Error rate | ~0.5% | <1% | Excluding Soniox queue |
| Uptime | 99.5% | >99% | Railway SLA |
| Concurrent users | 100-200 | 500+ | Single instance |

---

## Deployment Checklist

Before deploying to production:

### Database Setup
- [ ] All migrations applied in Supabase (001, 002, 003, audio_id, coaching_jobs)
- [ ] RPC functions verified (queue, claim, complete, fail)
- [ ] coaching_sessions.audio_id column exists
- [ ] Row-level security policies enabled

### Web Server (whatsapp-bot.js)
- [ ] All environment variables set in Railway
- [ ] Webhook URL updated in Meta Console
- [ ] Test message sent successfully
- [ ] Voice message tested successfully
- [ ] Lesson plan generation tested
- [ ] Error logging verified

### Background Worker (coaching-processor.js)
- [ ] Separate Railway service created
- [ ] Worker environment variables set
- [ ] Worker deployed and running
- [ ] Health endpoint accessible (/health)
- [ ] Worker claiming jobs successfully
- [ ] Test coaching session completed end-to-end

### External Services
- [ ] Supabase project active with service_role key
- [ ] Cloudflare R2 bucket created and accessible
- [ ] Soniox account has payment method
- [ ] OpenAI account has sufficient credits
- [ ] WhatsApp Business account verified

### Monitoring & Backups
- [ ] Rate limits understood
- [ ] Backup of environment variables stored (encrypted)
- [ ] Health check monitoring set up (optional)
- [ ] Error tracking configured (optional: Sentry)

### Testing
- [ ] Text message conversation works
- [ ] Voice message transcription works
- [ ] Classroom coaching full cycle tested:
  - [ ] Audio upload and confirmation
  - [ ] Transcription job completes
  - [ ] Analysis job completes
  - [ ] Reflective conversation works
  - [ ] Report generation job completes
  - [ ] PDF and voice sent to user

### Post-Deployment Verification

```bash
# Check web server
curl https://your-app.railway.app/

# Check worker
curl https://coaching-worker.railway.app/health

# Monitor logs
railway logs --service whatsapp-bot --tail 50
railway logs --service coaching-worker --tail 50

# Check queue status in Supabase
SELECT status, COUNT(*) FROM coaching_jobs GROUP BY status;
```

---

## Recent Changes Summary (November 2025)

### Database Changes
1. Added `audio_id` column to `coaching_sessions` table
   - Purpose: Store WhatsApp media ID for audio download
   - Migration: `add-audio-id-column.sql`

2. Created `coaching_jobs` table for background job queue
   - Replaces: `coaching_processing_queue` (deprecated)
   - Migration: `create-coaching-jobs-table.sql`

3. Added 5 RPC functions for distributed job processing
   - `queue_coaching_job` - Add jobs to queue
   - `claim_next_coaching_job` - Atomic job claiming with SKIP LOCKED
   - `complete_coaching_job` - Mark job complete
   - `fail_coaching_job` - Handle failures with exponential backoff
   - `get_pending_jobs_count` - Monitor queue health

### Code Changes
1. Fixed `CoachingService.handleConfirmation` to retrieve and pass `audio_id` in job payload
2. Fixed `CoachingService.processTranscription` to create `/app/temp/` directory before writing files
3. Fixed user field queries to use `first_name`/`last_name` instead of non-existent `full_name`
4. Fixed audio duration to round to integer for database compatibility

### Deployment Changes
1. Background worker deployed as separate Railway service
2. Worker implements distributed locking with PostgreSQL SKIP LOCKED
3. Worker supports graceful shutdown and health checks
4. Worker scales independently from web server

---

**Next**: See [06_Known_Issues.md](06_Known_Issues.md) for current problems and troubleshooting.
