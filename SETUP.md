# Rumi Platform — Setup Guide

Two commands take a fresh clone to a WhatsApp conversation with Rumi, in about fifteen minutes:

```bash
./install.sh     # tools, dependencies, and the `rumi` command
rumi setup       # guided, one question at a time
```

`rumi setup` asks in plain language, checks every value against the real service as you enter it, and saves
each answer as it goes — so Ctrl+C is safe, and running it again picks up where you stopped. Anything already
working is not asked about twice.

## What you'll need

| For | Where to get it | Cost |
|-----|-----------------|------|
| **A database** — where Rumi remembers teachers, lessons and assessments | [supabase.com](https://supabase.com) | free tier is plenty |
| **The AI** — one key, many models | [openrouter.ai/keys](https://openrouter.ai/keys) | a few dollars goes a long way |
| **WhatsApp** | your own phone | — |

Node.js 22+ and git need to be installed. Redis is required too, but the wizard offers to start one for you
with Docker if you have it — otherwise paste any reachable address (Railway, Upstash, your own server).

> **You do not need a Meta WhatsApp Business account to try Rumi.** The wizard's default links your own
> WhatsApp the way WhatsApp Web does: scan a QR code and Rumi answers on your number. Nothing to register,
> nothing to get approved. When you're ready for a real deployment, `rumi graduate` moves you to an official
> WhatsApp Business number — teachers, conversations and past assessments all carry over, because Rumi
> identifies people by phone number rather than by channel.

## The `rumi` command

| Command | What it does |
|---------|--------------|
| `rumi setup` | Connect Rumi to your accounts. Start here. `--reconfigure` re-asks everything. |
| `rumi start` | Start the bot |
| `rumi status` | Is Rumi running, which WhatsApp number it answers as, and what's switched on |
| `rumi console` | Open the web console in a browser. Works even when the bot won't start. |
| `rumi doctor` | Check every connection in detail, with where to get anything missing |
| `rumi pair` | Link (or re-link) WhatsApp — sessions do expire |
| `rumi graduate` | Move to an official WhatsApp Business number |

If `install.sh` couldn't put `rumi` on your PATH (it needs npm permissions it may not have), use
`node bin/rumi.js <command>` — identical in every way.

## Then what?

```bash
rumi start
```

Message the number the wizard linked, from any phone, and try **Hi**, then `/menu`, `/reading test`, a voice
note, or a photo of a worksheet.

Then open **<http://localhost:3000/console>** — the web console. It shows whether every service is
answering, which features are on and which key each one is waiting for, the speech-to-text → AI →
text-to-speech pipeline with the model behind each layer, and a live feed of what Rumi is doing. You
can change any setting there instead of editing `.env` by hand. On your own machine it opens without
a password; anywhere else it stays locked until you set one. See
[docs/console.md](docs/console.md).

## What the wizard does, and what it can't

It collects and live-checks your database, AI and Redis credentials; creates all 76 tables, the row-level
security policies and the seed data; switches on any optional abilities you give it keys for; and links
WhatsApp.

One step it cannot do for you: Supabase offers no API for running arbitrary SQL, so the tiny `exec_sql`
helper that the schema is applied through has to be pasted into the SQL editor once, by hand. The wizard
detects this, prints the helper SQL (including GRANT and NOTIFY), and links straight to the right page of your project. It will not continue until the `users` table exists.

For a **production** deployment there is more to do than the wizard covers — hosting, the Meta webhook,
registering WhatsApp Flows, and the background worker. That's what the rest of this guide is for.

---

# Manual setup and production reference

Everything below can be done by hand instead of running the wizard, and steps 7 onward (deployment, webhook,
Flows, workers) are needed for a real deployment either way.

## Prerequisites

| Requirement | Where to Get It |
|------------|----------------|
| Node.js 22+ | [nodejs.org](https://nodejs.org) |
| GitHub account | [github.com](https://github.com) (to fork the repo) |
| Supabase account | [supabase.com](https://supabase.com) (free tier works) |
| Railway account | [railway.app](https://railway.app) (for hosting + Redis) |
| OpenRouter API key | [openrouter.ai/keys](https://openrouter.ai/keys) (for LLM access) |
| WhatsApp Business credentials | [Meta Business Manager](https://business.facebook.com) — production only |

> **New to any of these?** Two step-by-step guides walk you through the slow parts:
> - **[docs/onboarding/whatsapp.md](docs/onboarding/whatsapp.md)** — get a working WhatsApp connection in ~10 minutes (free test number), then go to production.
> - **[docs/onboarding/api-keys.md](docs/onboarding/api-keys.md)** — how to get every API key, what each unlocks, and which 8 you actually need to start.

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

> **No Supabase account?** For a laptop, demo or test setup you can skip this step and Step 3:
> `bash infrastructure/local/up.sh` starts a private Postgres, PostgREST and Redis (no Docker), applies
> the schema, and prints the `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `REDIS_URL` lines for `.env`.
> Not for production. See [docs/local-stack.md](docs/local-stack.md).

1. **Create account** at [supabase.com](https://supabase.com) (free tier is sufficient)
2. **Create a new project** — choose a region closest to your users
3. **Run the schema.** Two ways:

   **Option A — one command (recommended):** First create the tiny `exec_sql` helper that `npm run bootstrap:db` uses to apply SQL. A brand-new Supabase project does not have it, so paste this **once** in the SQL Editor (ALTER OWNER gives it extension-creation rights; search_path includes `extensions` because uuid-ossp lives there; REVOKE keeps anyone holding your public anon key from calling it, since it runs any SQL as the database owner; GRANT and NOTIFY make PostgREST see it):
   ```sql
   CREATE OR REPLACE FUNCTION public.exec_sql(query text)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, extensions
   AS $$ BEGIN EXECUTE query; END; $$;

   ALTER FUNCTION public.exec_sql(text) OWNER TO postgres;
   REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
   NOTIFY pgrst, 'reload schema';
   ```
   Then run `npm run bootstrap:db` — it applies all three SQL files in order, statement by statement, and fails if the `users` table is still missing. (`rumi setup` does the same and will not continue without the tables.)

   **Option B — manual paste:** In the SQL Editor, run these three files in order:
   - `infrastructure/supabase/00_complete-schema.sql` — all 76 tables, 40 functions, 29 triggers, 200+ indexes
   - `infrastructure/supabase/01_rls-policies.sql` — enables Row Level Security on all tables
   - `infrastructure/supabase/02_seed-data.sql` — adds reading assessment benchmarks
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

### Lesson-plan fidelity (optional, off by default)

With Soniox set, classroom coaching can also check whether a lesson followed the teacher's plan, move by move. It
needs no new key — it uses `OPENROUTER_API_KEY` and Soniox's timestamped transcripts:

```env
LP_FIDELITY_ENABLED=true
```

`rumi doctor` then shows how many recent classroom recordings came back with speech timings. See
[docs/features/lesson-plan-fidelity.md](docs/features/lesson-plan-fidelity.md).

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

## Sharing Usage Stats (Optional, Off by Default)

`rumi setup` asks whether you are comfortable sharing basic usage stats with the project. The prompt reads
`[Y/n]`, so pressing Enter accepts; answering `n` declines. Declining changes nothing about how Rumi works,
and nothing is ever sent unless you accept. If you configure by hand instead of running the wizard, the
default is the opposite: a blank `RUMI_TELEMETRY` sends nothing.

If you say yes, your deployment posts three numbers once a day — how many teachers are registered, how many
were active that week, and how many lesson plans were made in the last 30 days — plus a random ID for the
deployment, the version you run, and which features you have switched on.

**Nothing about any individual is ever sent.** No names, no phone numbers, no teacher or student records, no
message content, no lesson plans, no recordings, no scores, no API keys. The full outbound payload is one
function you can read: `buildPayload` in `bot/shared/utils/telemetry.js`.

Two keys in `.env` control it, and **both** must be set for anything to be sent:

| Key | Meaning |
|-----|---------|
| `RUMI_TELEMETRY` | `on` to share, `off` or blank to stay quiet |
| `RUMI_DEPLOYMENT_ID` | a random UUID generated when you say yes; identifies the deployment and nothing else |
| `RUMI_TELEMETRY_URL` | optional — point the daily push at your own receiver instead |

To turn it off at any time, set `RUMI_TELEMETRY=off` and restart. To become a brand-new deployment, delete
`RUMI_DEPLOYMENT_ID` as well.

---

## Adding Features

There are **no tiers** — each feature turns on the moment its key(s) are present in your environment, and
`npm run doctor` shows you which are live. To add one, set its key(s) and redeploy. For example:

### Add voice transcription (coaching, reading, voice notes)

1. Get a Soniox API key at [soniox.com](https://soniox.com)
2. Add to your environment: `SONIOX_API_KEY=your-key`
3. Set up the stale session cron job (Step 11)
4. Redeploy

### Set test papers from your own textbooks

Test papers (`/testpaper`) are on with the LLM key you already have; teachers can build them from their own
lesson plans or an uploaded chapter straight away. To let them pick chapters of **your** textbooks, run the
[curriculum pipeline](curriculum/README.md) over the books, then load its page-truth output:

```bash
node bot/scripts/testpaper/import-curriculum-corpus.js path/to/curriculum-project --dry-run   # what it would write
node bot/scripts/testpaper/import-curriculum-corpus.js path/to/curriculum-project
```

Printing needs Chromium on the bot's host (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), and papers are written by
the background worker. Existing databases: apply `infrastructure/supabase/migrations/V2.4.0__test_papers.sql`.
See [docs/features/test-papers.md](docs/features/test-papers.md).
### Add staff attendance for a head teacher (optional)

Class attendance needs nothing. For a head teacher's **staff** attendance and register:

1. Apply the attendance migration on an existing database: `node infrastructure/scripts/migrate.js`
   (fresh installs already have it from `00_complete-schema.sql`)
2. Set the school's timezone: `ATTENDANCE_TZ=Africa/Nairobi` (any IANA name; default UTC)
3. Link the school, its head teacher and staff (from `bot/`):
   `node scripts/attendance/link-school.js --school "Your School" --head <phone or channel id> --staff <…> --staff-name "…"`
4. The head teacher says "attendance". See [docs/features/attendance.md](docs/features/attendance.md).

### Add teacher nudges (optional)

1. Set `TEACHER_NUDGES_ENABLED=true` (and `TEACHER_NUDGES_TZ` to your timezone)
2. Run the worker (`node bot/workers/sqs-worker.js`) — it sweeps every `TEACHER_NUDGES_SWEEP_MINUTES` — or
   schedule `node bot/workers/teacher-nudges.worker.js` from cron. See [docs/features/teacher-nudges.md](docs/features/teacher-nudges.md).

### Add Observe — the coach's assistant

1. Make sure voice transcription is on (`SONIOX_API_KEY`, above) and the background worker runs (Step 11).
2. Existing database: apply `infrastructure/supabase/migrations/V2.6.0__observe_coach_assistant.sql`
   (fresh installs already have it from `00_complete-schema.sql`).
3. Add to your environment: `OBSERVE_ENABLED=true` (optionally `OBSERVE_FRAMEWORK`, default `teach`).
   Set `OBSERVE_ENABLED=true` on the dashboard service as well: the portal's coach view ("My observations") reads its own environment and stays off without it.
4. Give your coaches their schools and teachers:
   `node bot/scripts/observe-roster.js import roster.csv` (columns `coach_phone,school_ext_id,school_name,teacher_phone,teacher_name`),
   or one at a time with `grant-coach`, `add-school` and `add-teacher`.
5. Redeploy. A coach types `/observe`. Details: [docs/features/observe.md](docs/features/observe.md).
6. Optional: send each coach their portal invite on the channel they use:
   `node bot/scripts/observe-roster.js portal-invite <coach-phone>` (needs the portal, below).

### Add the teacher portal (optional)

1. Build it into the dashboard: `cd portal && npm ci && npm run build && cp -R dist ../dashboard/portal-frontend/dist`.
2. Run the dashboard on an `https://` address (its session cookie is `Secure`).
3. Set `PORTAL_URL` (the dashboard's address) on the bot, and `MAIN_BOT_URL` plus the same random
   `INTERNAL_API_KEY` on both services, so reset codes reach each teacher's own chat.
4. A teacher types `/portal`. Details, including Rumi Messenger users: [docs/features/teacher-portal.md](docs/features/teacher-portal.md).

### Run Rumi in public (optional)

For a link anyone can sign up on:

1. Set the daily caps in `.env` (`DAILY_MESSAGE_CAP_UNREGISTERED=40`, `DAILY_LESSON_PLAN_CAP_UNREGISTERED=3`,
   `DAILY_COACHING_CAP_UNREGISTERED=0`, `DAILY_QUIZ_CAP_UNREGISTERED=2`) and `SCHOOL_TIMEZONE`. The per-sender
   rate limit (`INBOUND_RATE_LIMIT_PER_MINUTE`, 30) is already on.
2. Use an OpenRouter key made for this deployment, with a credit limit, and make sure Redis is running.
3. On Matrix, harden the homeserver too. Checklist: [docs/running-in-public.md](docs/running-in-public.md).

### Add regional-language speech-to-text (optional)

Speech-to-text for regional Pakistani languages (Balochi, Sindhi, Pashto) uses Meta's MMS-ASR model deployed on [Modal.com](https://modal.com).

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

## Optional: your own Android app

Teachers can reach Rumi on an app you own instead of WhatsApp. Two separate apps, both optional:

1. **Rumi Messenger** (chat with Rumi and colleagues): first run Rumi on a Matrix server
   ([docs/channels/matrix.md](docs/channels/matrix.md)), then brand, build and publish the Android app —
   [docs/android-app.md](docs/android-app.md).
2. **Portal app** (the teacher dashboard): on the dashboard service set `PORTAL_APP_ENABLED=true` (and
   `ANDROID_APP_PACKAGE` + `ANDROID_APP_SHA256_FINGERPRINTS` for tapped links), then
   `cd portal && cp .env.app.example .env.app && npm run android:debug` — full guide in
   [portal/ANDROID.md](portal/ANDROID.md). Needs JDK 21 and the Android SDK.

---

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

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
