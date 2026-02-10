# Rumi Platform - Setup Guide

## What You Need

You only need **one thing** to get started: **WhatsApp Business credentials** from [Meta Business Manager](https://business.facebook.com).

Everything else (database, Redis, hosting, AI keys) is **automatically provisioned** for you.

| Credential | Where to Get It |
|-----------|----------------|
| WhatsApp Token | Meta Business Manager > WhatsApp > API Setup |
| Phone Number ID | Same WhatsApp API Setup page |
| WABA ID | WhatsApp > Business Account Settings |
| Webhook Verify Token | You choose this — any random string |

## Step 1: Fork, Clone, and Install

**First, fork the repo** on GitHub — click the **Fork** button at [github.com/taleemabad/rumi-platform](https://github.com/taleemabad/rumi-platform). This creates your own independent copy.

```bash
# Clone YOUR fork (replace YOUR-ORG with your GitHub username or org)
git clone https://github.com/YOUR-ORG/rumi-platform.git
cd rumi-platform

# Add the original repo as upstream (for pulling future updates)
git remote add upstream https://github.com/taleemabad/rumi-platform.git

# Install dependencies
npm install
cd bot && npm install && cd ..
```

> **Important:** Do NOT clone directly from `taleemabad/rumi-platform`. Each deployment needs its own fork so you can push changes independently without affecting other users.

## Step 2: Auto-Provision Infrastructure

This single command creates your Supabase database, Railway hosting (with Redis), and OpenRouter AI key:

```bash
node bot/scripts/setup/provision-infrastructure.js --name my-school-name
```

Options:
- `--name` (required) — A name for your deployment (e.g., `my-school`, `acme-education`)
- `--tier` (optional) — `minimal` (default), `recommended`, or `full`
- `--region` (optional) — `ap-south-1` (default), `us-east-1`, `eu-west-1`, `ap-southeast-1`

This will:
1. Create a Supabase project with the full database schema
2. Create a Railway project with a bot service, Redis, and a public domain
3. Generate an OpenRouter API key ($10/month budget, 6-month expiry)
4. Write all credentials to your `.env` file automatically

When it finishes, you'll see your Railway webhook URL (e.g., `https://rumi-my-school.up.railway.app/webhook`).

## Step 3: Add WhatsApp Credentials

Open your `.env` file and fill in the 4 WhatsApp values:

```env
WHATSAPP_TOKEN=your-whatsapp-token
PHONE_NUMBER_ID=your-phone-number-id
WABA_ID=your-waba-id
WEBHOOK_VERIFY_TOKEN=your-random-verify-token
```

## Step 4: Run Database Migrations

After provisioning, set up the database schema:

```bash
# Copy the SUPABASE_URL from your .env, open it in a browser,
# go to SQL Editor, and run these files in order:
```

1. `infrastructure/supabase/00_complete-schema.sql`
2. `infrastructure/supabase/01_rls-policies.sql`
3. `infrastructure/supabase/02_seed-data.sql`
4. `infrastructure/supabase/verify-schema.sql` (to confirm)

## Step 5: Deploy

```bash
cd bot
railway up --service bot
```

Or use the deploy token from provisioning:

```bash
cd bot && RAILWAY_TOKEN=your-deploy-token railway up --service bot
```

## Step 6: Configure WhatsApp Webhook

1. Go to [Meta Business Manager](https://developers.facebook.com/apps/)
2. Navigate to WhatsApp > Configuration > Webhook
3. Set webhook URL: `https://your-railway-domain.up.railway.app/webhook` (shown after provisioning)
4. Set verify token: same as `WEBHOOK_VERIFY_TOKEN` in your `.env`
5. Subscribe to: `messages`

## Step 7: Test

Send "Hi" to your WhatsApp bot number. You should receive a welcome message and registration flow.

## Step 8: Register WhatsApp Flows & Templates (Optional)

## Step 8.5: Set Up Stale Session Cron Job (Recommended+ Tier)

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

## Step 8.6: Register WhatsApp Flows & Templates

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

1. Push your changes to your fork:
   ```bash
   git push origin main
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
5. Set up the stale session cron job (see Step 8.5 above)

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
# If you haven't already (done in Step 1):
git remote add upstream https://github.com/taleemabad/rumi-platform.git

# Pull latest from upstream
git fetch upstream
git merge upstream/main

# Push the merged changes to your fork
git push origin main

# Apply any new database migrations
node infrastructure/scripts/migrate.js

# Redeploy (auto-deploys if GitHub Actions is set up)
cd bot && railway up --service bot
```

See `docs/pulling-updates.md` for the full migration guide.

---

## Appendix: Manual Setup (Without Provisioner)

If you prefer to set up each service manually or if the provisioner is unavailable:

### Supabase (Manual)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migration files from `infrastructure/supabase/`
3. Go to Settings > API and copy your project URL and service role key to `.env`

### Redis (Manual)

**Option A: Railway Redis**
```bash
railway login && railway init && railway add --plugin redis
```
Copy the `REDIS_URL` from Railway to your `.env`.

**Option B: Local Docker**
```bash
docker run -d -p 6379:6379 redis:7
```
Set `REDIS_URL=redis://localhost:6379` in your `.env`.

### OpenRouter (Manual)

1. Sign up at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create an API key
3. Set `OPENROUTER_API_KEY=sk-or-v1-...` in your `.env`

### Railway Hosting (Manual)

1. Sign up at [railway.app](https://railway.app)
2. Create a new project
3. Deploy: `cd bot && railway up --service bot`

---

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
