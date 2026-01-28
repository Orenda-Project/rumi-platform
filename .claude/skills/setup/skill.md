# /setup - Rumi Platform Setup

Automated setup for deploying the Rumi AI Teaching Assistant. This skill guides you through the complete setup interactively.

## What This Does

1. **Pre-flight checks**: Verifies Node.js 18+, git, npm
2. **Tier selection**: Asks which feature tier (minimal/recommended/full)
3. **Environment configuration**: Creates `.env` from template, prompts for each key
4. **Database setup**: Guides through Supabase project creation and schema execution
5. **Redis setup**: Railway Redis or local Docker
6. **Deploy**: Set env vars, deploy to Railway (or run locally)
7. **WhatsApp config**: Set webhook URL, verify handshake
8. **E2E test**: Send test message, verify response

## Usage

```
/setup
```

The agent will guide you through each step interactively.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works) — [supabase.com](https://supabase.com)
- A Railway account (free tier works) — [railway.app](https://railway.app)
- An OpenRouter API key — [openrouter.ai/keys](https://openrouter.ai/keys)
- WhatsApp Business credentials (from Meta Business Manager)

## Tier Options

When asked "Which tier?":

1. **Minimal** — AI Chat + Registration. 1 API key (OpenRouter).
2. **Recommended** — + Coaching + Reading Assessment. 2 API keys (+ Soniox).
3. **Full** — All features (voice, video, lesson plans, attendance, exams). 5 API keys.

## Setup Steps (Detailed)

### Step 1: Pre-flight Checks

```bash
node --version  # Must be 18+
npm --version
git --version
```

### Step 2: Environment Setup

```bash
cp .env.template .env
```

Then set MINIMUM required values:

```env
# REQUIRED - All Tiers
RUMI_TIER=minimal
NODE_ENV=production
PORT=3000

# LLM Provider
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Redis
REDIS_URL=redis://...

# WhatsApp
WHATSAPP_TOKEN=EAA...
PHONE_NUMBER_ID=...
WEBHOOK_VERIFY_TOKEN=your-random-string
WABA_ID=...

# Branding (Optional - defaults to Rumi)
BOT_NAME=YourBotName
ORG_NAME=Your Organization
```

### Step 3: Database Setup

```bash
# In Supabase SQL Editor, run these files in order:
# 1. infrastructure/supabase/00_complete-schema.sql
# 2. infrastructure/supabase/01_rls-policies.sql
# 3. infrastructure/supabase/02_seed-data.sql
# 4. infrastructure/supabase/verify-schema.sql (verify)
```

### Step 4: Install & Validate

```bash
cd bot && npm install && cd ..
npm run validate:env
```

### Step 5: Deploy

```bash
# Option A: Railway (production)
railway login
railway init
railway up

# Option B: Local (development)
cd bot && node whatsapp-bot.js
```

### Step 6: WhatsApp Webhook

1. Go to Meta Business Manager > WhatsApp > Configuration > Webhook
2. Set URL: `https://your-app.up.railway.app/webhook`
3. Set verify token: same as `WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`

### Step 7: Test

Send "Hi" to your WhatsApp number. Expected: welcome message + registration flow.

## Resuming

If setup fails partway through, run `/setup` again. It reads `.setup-state.json` and resumes from the last completed step.

## After Setup: Customization

Once running, see these docs for customization:

| Want to... | Read |
|-----------|------|
| Swap coaching framework (OECD to Teach) | [docs/agent-customization.md](../../docs/agent-customization.md) section 1 |
| Change reading assessment method | [docs/agent-customization.md](../../docs/agent-customization.md) section 2 |
| Add new languages | [docs/agent-customization.md](../../docs/agent-customization.md) section 4 |
| Set up monitoring | [docs/monitoring.md](../../docs/monitoring.md) |
| Change branding | [docs/customization.md](../../docs/customization.md) |
| Add new features | [docs/agent-customization.md](../../docs/agent-customization.md) section 7 |

## Manual Alternative

If you prefer manual setup, follow [SETUP.md](../../SETUP.md) instead.
