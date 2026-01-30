# Rumi Platform - Manual Setup Guide

This guide walks through setting up Rumi manually. For automated setup, use `/setup` in Claude Code.

## Prerequisites

- Node.js 18+ ([nodejs.org](https://nodejs.org))
- A Supabase account ([supabase.com](https://supabase.com))
- A Railway account ([railway.app](https://railway.app))
- An OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys))
- WhatsApp Business credentials (from your admin)

## Step 1: Clone and Configure

```bash
git clone https://github.com/taleemabad/rumi-platform.git
cd rumi-platform
cp .env.template .env
```

Edit `.env` and fill in your values. Start with:

```env
RUMI_TIER=minimal
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

## Step 2: Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Run `infrastructure/supabase/00_complete-schema.sql`
4. Run `infrastructure/supabase/01_rls-policies.sql`
5. Run `infrastructure/supabase/02_seed-data.sql`
6. Run `infrastructure/supabase/verify-schema.sql` to confirm

Copy your project URL and service role key to `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Step 3: Set Up Redis

### Option A: Railway Redis (Recommended)

```bash
railway login
railway init
railway add --plugin redis
```

Railway auto-sets `REDIS_URL`. Copy it to your `.env`.

### Option B: Local Redis

```bash
docker run -d -p 6379:6379 redis:7
```

```env
REDIS_URL=redis://localhost:6379
```

## Step 4: Install Dependencies

```bash
cd bot && npm install
cd ..
```

## Step 5: Validate Environment

```bash
npm run validate:env
npm run validate:connections
```

Both should show all green.

## Step 6: Deploy to Railway

```bash
cd infrastructure/railway
railway up
```

Or for local development:

```bash
cd bot && node whatsapp-bot.js
```

## Step 7: Configure WhatsApp

1. Go to [Meta Business Manager](https://developers.facebook.com/apps/)
2. Navigate to WhatsApp > Configuration > Webhook
3. Set webhook URL: `https://your-railway-url.up.railway.app/webhook`
4. Set verify token: (same as `WEBHOOK_VERIFY_TOKEN` in your `.env`)
5. Subscribe to: `messages`

## Step 7.5: Set Up Stale Session Cron Job (Recommended+ Tier)

If you are using the coaching feature (recommended tier or higher), you need a cron job to clean up stuck coaching sessions. Without this, sessions that error mid-way or where the teacher stops responding will stay stuck indefinitely, preventing those teachers from starting new sessions.

The worker at `bot/workers/stale-session.worker.js` handles this by:
- Sending a reminder after 2 hours of inactivity
- Auto-generating a partial coaching report after 12 hours of inactivity

### Option A: Railway Cron (Recommended)

1. In Railway dashboard, add a **Cron Service** to your project
2. Set the schedule to `*/15 * * * *` (every 15 minutes)
3. Set the start command to `node bot/workers/stale-session.worker.js`
4. Use the same environment variables as your main bot service (same Supabase, Redis, WhatsApp credentials)

### Option B: External Cron

If not using Railway, any cron scheduler that runs the following command every 15 minutes will work:

```bash
node bot/workers/stale-session.worker.js
```

The worker process runs once and exits (it is not a long-running server).

## Step 7.6: Register WhatsApp Flows & Templates

Rumi uses WhatsApp Flows (interactive forms) and Message Templates (carousel menus). These must be registered with your WABA.

### Automated (Recommended)

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-railway-url.up.railway.app
```

This registers:
- **3 Flows**: Reading Assessment, Attendance Setup, Attendance Marking
- **2 Templates**: Video Style Selection, Feature Menu Carousel
- **Encryption**: RSA keypair for encrypted flow endpoints

The script outputs environment variables to set in Railway:
- `READING_ASSESSMENT_FLOW_ID`
- `ATTENDANCE_SETUP_FLOW_ID`
- `ATTENDANCE_MARKING_FLOW_ID`
- `FLOW_PRIVATE_KEY`

Templates require Meta review (1-24 hours). The bot uses fallback interactive lists until templates are approved.

### Manual Fallback

If the automated script fails:

1. **Encryption**: Run `node bot/scripts/setup/setup-encryption.js` separately
2. **Flows**: Register each flow at [Meta Business Manager > WhatsApp > Flows](https://business.facebook.com/)
3. **Templates**: Create templates at WhatsApp > Message Templates
4. Set the resulting IDs as environment variables in Railway

See `bot/scripts/setup/assets/README.md` for template asset requirements.

## Step 8: Test

Send "Hi" to your WhatsApp bot number. You should receive a welcome message and registration flow.

## Step 9: Set Up for Ongoing Development

If you plan to modify the bot and deploy updates, complete these additional steps.

### Save Your Deploy Token

If you used the provisioner, your response includes a `deploy_token`. Set it as an environment variable:

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc)
export RAILWAY_TOKEN=your-deploy-token-here
```

This enables CLI operations without re-authenticating each time.

### Set Up Auto-Deploy with GitHub Actions (Recommended)

For automatic deployments on every `git push`, use the included GitHub Actions workflow:

1. Push your forked repo to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR-ORG/rumi-platform.git
   git push -u origin main
   ```

2. Add your Railway token to GitHub Secrets:
   - Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**
   - Click **New repository secret**
   - Name: `RAILWAY_TOKEN`
   - Value: Paste the deploy token from your provisioning response

3. The workflow file is already included at `.github/workflows/deploy.yml`

Now every push to `main` automatically deploys to Railway!

### Alternative: Railway UI Integration

If you have Railway dashboard access (requires team invite), you can also connect via UI:

1. Go to your Railway project dashboard
2. Click **bot** service > **Settings** > **Source**
3. Click **Connect Repository** and select your repo
4. Set **Root Directory** to `bot`

### Manual Deployment

If not using auto-deploy:

```bash
cd bot
# Make your changes
railway up --service bot  # Deploy to the bot service on Railway
```

**Important**: Always include `--service bot` to target the correct service.

### View Logs

```bash
railway logs --service bot --follow
```

### Manage Environment Variables

```bash
# View all for bot service
railway variables --service bot

# Set a variable
railway variables --service bot --set KEY=value
```

### Accessing Railway Dashboard (UI)

The deploy token allows CLI operations but not UI access. To access the web dashboard:

1. **Request a team invite** from your Rumi administrator
2. Create a Railway account at [railway.app](https://railway.app)
3. Accept the invitation email
4. Access your project via the dashboard

See [docs/railway-operations.md](docs/railway-operations.md) for the complete Railway operations guide.

## Upgrading Tiers

### Minimal to Recommended

1. Get a Soniox API key at [soniox.com](https://soniox.com)
2. Add to `.env`: `SONIOX_API_KEY=your-key`
3. Update: `RUMI_TIER=recommended`
4. Redeploy
5. Set up the stale session cron job (see Step 7.5 above)

### Recommended to Full (Regional Language Support)

The full tier adds speech-to-text for regional Pakistani languages (Balochi, Sindhi, Pashto) using Meta's MMS-ASR model. This requires deploying a separate GPU-powered Python service on [Modal.com](https://modal.com).

**Prerequisites:**

- Python 3.10+
- A Modal.com account ([modal.com](https://modal.com))
- `pip install modal` and `modal setup` (one-time auth)

**Deploy the MMS-ASR service:**

```bash
cd bot/06_MMS_Inference_Service
modal secret create mms-api-key MMS_API_KEY=your-secret-key-here
modal deploy modal_app.py
```

After deployment, Modal will print the service URL (e.g., `https://your-workspace--mms-asr-service-web-app.modal.run`).

**Set environment variables in your bot:**

```env
MMS_SERVICE_URL=https://your-workspace--mms-asr-service-web-app.modal.run
MMS_API_KEY=your-secret-key-here
RUMI_TIER=full
```

**Cost and scaling:** The Modal service uses a T4 GPU (~$0.0005/second) and scales to zero when idle. Cold starts take 4-8 seconds. The bot's MMS client has a 15-second health check timeout to accommodate this.

**Verify the deployment:**

```bash
curl https://your-modal-url/health
# Should return: {"status": "ok", "model_loaded": true, "gpu_available": true, ...}
```

If you do not need regional language support, skip this step. The bot works without MMS -- it will use Soniox for Urdu/English transcription at the recommended tier.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check Railway logs: `railway logs` |
| Database errors | Re-run `verify-schema.sql` in Supabase |
| Redis connection failed | Verify `REDIS_URL` is correct |
| WhatsApp webhook fails | Verify `WEBHOOK_VERIFY_TOKEN` matches |

## Pulling Updates

To receive bug fixes and new features from the upstream Rumi repository:

```bash
# One-time: add upstream remote
git remote add upstream https://github.com/taleemabad/rumi-platform.git

# Pull latest
git fetch upstream
git merge upstream/main

# Apply any new database migrations
node infrastructure/scripts/migrate.js

# Restart your bot
railway up
```

See `docs/pulling-updates.md` for the full migration guide.

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
