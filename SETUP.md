# Rumi Platform - Setup Guide

## Prerequisites

| Requirement | Where to Get It |
|------------|----------------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| GitHub account | [github.com](https://github.com) (to fork the repo) |
| Supabase account | [supabase.com](https://supabase.com) (free tier works) |
| Railway account | [railway.app](https://railway.app) (for hosting + Redis) |
| OpenRouter API key | [openrouter.ai/keys](https://openrouter.ai/keys) (for LLM access) |
| WhatsApp Business credentials | [Meta Business Manager](https://business.facebook.com) |

## Step 1: Fork, Clone, and Install

**First, fork the repo** on GitHub — click the **Fork** button at [github.com/Orenda-Project/rumi-platform](https://github.com/Orenda-Project/rumi-platform). This creates your own independent copy.

```bash
# Clone YOUR fork (replace YOUR-ORG with your GitHub username or org)
git clone https://github.com/YOUR-ORG/rumi-platform.git
cd rumi-platform

# Add the original repo as upstream (for pulling future updates)
git remote add upstream https://github.com/Orenda-Project/rumi-platform.git

# Install dependencies
npm install
cd bot && npm install && cd ..
```

> **Important:** Do NOT clone directly from `Orenda-Project/rumi-platform`. Each deployment needs its own fork so you can push changes independently.

## Step 2: Create Supabase Database

1. **Create account** at [supabase.com](https://supabase.com) (free tier is sufficient)
2. **Create a new project** — choose a region closest to your users
3. **Run the schema** in SQL Editor (Settings > SQL Editor):
   - Copy and paste the contents of `infrastructure/supabase/00_complete-schema.sql` — this creates all 60 tables, 38 functions, 27 triggers, and 186+ indexes
   - Then run `infrastructure/supabase/01_rls-policies.sql` — enables Row Level Security on all tables
   - Then run `infrastructure/supabase/02_seed-data.sql` — adds reading assessment benchmarks
4. **Verify** by running `infrastructure/supabase/verify-schema.sql` — all checks should show PASS
5. **Copy credentials** from Settings > API:
   - `SUPABASE_URL` — your project URL (e.g., `https://abcdefgh.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** key (NOT the anon key)

> **Tip:** If you get a timeout running the schema, split it into sections. The SQL file has clear section headers.

## Step 3: Set Up Redis

Redis is required for session management, caching, and registration flow state.

### Option A: Railway Redis (Recommended)

If you're using Railway for hosting (Step 7), add a Redis plugin to your project:

1. Go to your Railway project dashboard
2. Click **+ New** > **Database** > **Redis**
3. Copy the `REDIS_URL` from the Redis service's Variables tab

### Option B: Upstash (Serverless, Free Tier)

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database (choose region closest to your server)
3. Copy the Redis URL from the dashboard

### Option C: Local Docker (Development Only)

```bash
docker run -d -p 6379:6379 redis:7
# REDIS_URL=redis://localhost:6379
```

## Step 4: Get AI API Keys

### OpenRouter (Required)

OpenRouter provides access to GPT-4o and other models through a single API key.

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and create an API key
3. Add credits — Rumi costs approximately $0.01-0.05 per conversation

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
LLM_PROVIDER=openrouter
```

### Soniox (Tier 2 — Recommended for Voice)

Required if you want voice message support (Urdu, English, Arabic, Spanish).

1. Sign up at [soniox.com](https://soniox.com)
2. Create an API key from your dashboard

```env
SONIOX_API_KEY=your-soniox-key
```

### ElevenLabs (Tier 3 — Full, for Voice Responses)

Required if you want the bot to respond with voice messages.

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Create an API key

```env
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=cgSgspJ2msm6clMCkdW9
```

## Step 5: Set Up WhatsApp Business

### 5a: Create Meta Developer Account

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **My Apps** > **Create App**
3. Select **Business** as the app type
4. Add the **WhatsApp** product to your app

### 5b: Get API Credentials

1. In your Meta App, go to **WhatsApp** > **API Setup**
2. You'll see a **Temporary access token** — for production, create a **System User Token**:
   - Go to [business.facebook.com](https://business.facebook.com) > **Settings** > **Users** > **System Users**
   - Create a system user, assign it the **WhatsApp Business** asset
   - Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions
3. Copy:
   - **Phone Number ID** — from API Setup page
   - **WhatsApp Business Account ID (WABA ID)** — from Business Account Settings

### 5c: Get a Phone Number

You need a phone number for the bot. Options:

- **Test number** — Meta provides a free test number (limited to 5 recipients)
- **Your own number** — Register a real phone number in WhatsApp Business API
  - The number must NOT be registered on WhatsApp (personal or business app)
  - You'll verify via SMS or voice call

## Step 6: Configure Environment

```bash
cp .env.template .env
```

Fill in the required values:

```env
# Core
NODE_ENV=production
PORT=3000
RUMI_TIER=minimal

# Database (from Step 2)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis (from Step 3)
REDIS_URL=redis://your-redis-url

# AI (from Step 4)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your-key

# WhatsApp (from Step 5)
WHATSAPP_TOKEN=your-whatsapp-token
PHONE_NUMBER_ID=your-phone-number-id
WABA_ID=your-waba-id
WEBHOOK_VERIFY_TOKEN=pick-any-random-string
```

Validate your environment:

```bash
npm run validate:env
```

## Step 7: Deploy to Railway

### 7a: Create Railway Project

1. Sign up at [railway.app](https://railway.app)
2. Create a new project
3. Add a new service from your GitHub fork
4. Set the **Root Directory** to `bot`
5. Add all environment variables from your `.env` file to the Railway service

### 7b: Add Redis Plugin

1. In your Railway project, click **+ New** > **Database** > **Redis**
2. The `REDIS_URL` is automatically available to your service

### 7c: Deploy

Railway auto-deploys from your GitHub repo. Or deploy manually:

```bash
cd bot
railway up --service bot
```

Your bot will be available at a URL like `https://your-project.up.railway.app`.

## Step 8: Configure WhatsApp Webhook

1. Go to [Meta Business Manager](https://developers.facebook.com/apps/) > Your App > WhatsApp > Configuration
2. Click **Edit** on the Webhook section
3. **Callback URL:** `https://your-railway-domain.up.railway.app/webhook`
4. **Verify token:** same as `WEBHOOK_VERIFY_TOKEN` in your `.env`
5. Click **Verify and Save**
6. Subscribe to the `messages` webhook field

## Step 9: Test Your Bot

Send **"Hi"** to your WhatsApp bot number. You should receive a welcome message.

If you don't get a response:
1. Check Railway logs: `railway logs --service bot --follow`
2. Verify webhook is subscribed to `messages`
3. Verify `WEBHOOK_VERIFY_TOKEN` matches between Meta and Railway

## Step 10: Register WhatsApp Flows (Optional)

WhatsApp Flows are interactive forms for reading assessments, attendance, and registration. The bot works without them (using text-based alternatives), but Flows provide a better UX.

### Automated Setup

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-railway-url.up.railway.app
```

This registers:
- **4 Flows**: Reading Assessment, Attendance Setup, Attendance Marking, Registration
- **2 Templates**: Video Style Selection, Feature Menu Carousel
- **Encryption**: RSA keypair for encrypted flow endpoints

Set the resulting environment variables in Railway:
- `READING_ASSESSMENT_FLOW_ID`
- `ATTENDANCE_SETUP_FLOW_ID`
- `ATTENDANCE_MARKING_FLOW_ID`
- `REGISTRATION_FLOW_ID`
- `FLOW_PRIVATE_KEY`

### Manual Fallback

If the automated script fails:
1. **Encryption**: Run `node bot/scripts/setup/setup-encryption.js` separately
2. **Flows**: Register each flow at [Meta Business Manager > WhatsApp > Flows](https://business.facebook.com/)
3. **Templates**: Create templates at WhatsApp > Message Templates
4. Set the resulting IDs as environment variables in Railway

## Step 11: Set Up Background Worker (Optional)

If you're using the coaching feature, you need a background worker for generating coaching reports.

### Stale Session Cron

The stale session worker cleans up stuck coaching sessions:

**Railway Cron (Recommended):**
1. Add a **Cron Service** to your Railway project
2. Schedule: `*/15 * * * *` (every 15 minutes)
3. Start command: `node bot/workers/stale-session.worker.js`
4. Use the same environment variables as your bot service

**External Cron:**
```bash
# Run every 15 minutes
node bot/workers/stale-session.worker.js
```

---

## Upgrading Tiers

### Minimal to Recommended

1. Get a Soniox API key at [soniox.com](https://soniox.com)
2. Add to your environment: `SONIOX_API_KEY=your-key`
3. Update: `RUMI_TIER=recommended`
4. Set up the stale session cron job (Step 11)
5. Redeploy

### Recommended to Full (Regional Language Support)

The full tier adds speech-to-text for regional Pakistani languages (Balochi, Sindhi, Pashto) using Meta's MMS-ASR model deployed on [Modal.com](https://modal.com).

**Prerequisites:** Python 3.10+, a Modal.com account

```bash
cd bot/06_MMS_Inference_Service
pip install modal && modal setup
modal secret create mms-api-key MMS_API_KEY=your-secret-key-here
modal deploy modal_app.py
```

Set environment variables:
```env
MMS_SERVICE_URL=https://your-workspace--mms-asr-service-web-app.modal.run
MMS_API_KEY=your-secret-key-here
RUMI_TIER=full
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check Railway logs: `railway logs --service bot --follow` |
| Database errors | Re-run `verify-schema.sql` in Supabase SQL Editor |
| Redis connection failed | Verify `REDIS_URL` is correct and Redis is running |
| WhatsApp webhook fails | Verify `WEBHOOK_VERIFY_TOKEN` matches between Meta and Railway |
| Schema too large to paste | Split `00_complete-schema.sql` at section headers and run each section separately |
| `validate:env` fails | Check that all REQUIRED variables in `.env.template` are filled in |

## Pulling Updates

```bash
git fetch upstream
git merge upstream/main
git push origin main

# Apply any new database migrations
node infrastructure/scripts/migrate.js

# Redeploy
cd bot && railway up --service bot
```

---

## Appendix: Auto-Provisioner (Advanced)

> **Note:** The auto-provisioner is an optional convenience tool. The manual setup above is the recommended approach.

If you have access to the Rumi provisioner API, you can auto-provision Supabase, Railway, and OpenRouter with a single command:

```bash
node bot/scripts/setup/provision-infrastructure.js --name my-school-name
```

Options:
- `--name` (required) — A name for your deployment
- `--tier` (optional) — `minimal` (default), `recommended`, or `full`
- `--region` (optional) — `ap-south-1` (default), `us-east-1`, `eu-west-1`

This creates your Supabase database, Railway project with Redis, and generates an OpenRouter API key automatically. You still need to add WhatsApp credentials manually.

---

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
