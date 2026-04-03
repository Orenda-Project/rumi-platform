# /setup - Rumi Platform Setup

Automated setup guide for deploying the Rumi AI Teaching Assistant. This skill walks through the complete setup interactively.

## What This Does

1. **Pre-flight checks**: Verifies Node.js 18+, git, npm
2. **Tier selection**: Asks which feature tier (minimal/recommended/full)
3. **Infrastructure setup**: Creates Supabase project + Railway project + Redis manually
4. **WhatsApp config**: Set webhook URL, verify handshake
5. **Register flows**: WhatsApp Flows for interactive forms
6. **E2E test**: Send test message, verify response

## Usage

```
/setup
```

The agent will guide you through each step interactively.

## Prerequisites

- Node.js 18+ installed
- WhatsApp Business credentials (from Meta Business Manager)
- Supabase account (free tier works)
- Railway account (free tier works)

## Tier Options

When asked "Which tier?":

| Tier | Features | Required Services |
|------|----------|------------------|
| **Minimal** | AI Chat + Registration | Supabase, Railway, Redis, OpenRouter |
| **Recommended** | + Coaching + Reading Assessment | + Soniox STT |
| **Full** | All features (voice, video, lesson plans, attendance) | + ElevenLabs TTS, Azure Speech |

## Setup Steps (Detailed)

### Step 1: Pre-flight Checks

```bash
node --version  # Must be 18+
npm --version
git --version
```

### Step 2: Create Infrastructure

Follow [SETUP.md](../../SETUP.md) to manually create:
- Supabase project (copy URL + service role key)
- Railway project + Redis plugin
- OpenRouter API key

Copy the credentials into `.env` based on `.env.template`.

### Step 3: Run Database Schema

```bash
# Apply schema to your Supabase project
psql $DATABASE_URL -f infrastructure/supabase/00_complete-schema.sql
psql $DATABASE_URL -f infrastructure/supabase/01_rls-policies.sql
psql $DATABASE_URL -f infrastructure/supabase/02_seed-data.sql
```

### Step 4: Add WhatsApp Credentials

Edit `.env` and add your WhatsApp credentials (from Meta Business Manager):

```env
WHATSAPP_TOKEN=EAA...
PHONE_NUMBER_ID=123456789
WABA_ID=987654321
WEBHOOK_VERIFY_TOKEN=your-random-string
```

### Step 5: Install & Deploy

```bash
cd bot && npm install && cd ..
railway login
railway up
```

### Step 6: Configure WhatsApp Webhook

1. Go to Meta Business Manager > WhatsApp > Configuration > Webhook
2. Set URL: `https://your-app.up.railway.app/webhook`
3. Set verify token: same as `WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`

### Step 7: Register WhatsApp Flows & Templates

After deploying, register the WhatsApp Flows (interactive forms) and Message Templates with Meta:

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-app.up.railway.app
```

The script will:
1. Generate RSA-2048 encryption keys
2. Register flows: Reading Assessment, Attendance Setup, Attendance Marking
3. Submit message templates

**Output**: Flow IDs and env var values to set in Railway:
- `READING_ASSESSMENT_FLOW_ID`
- `ATTENDANCE_SETUP_FLOW_ID`
- `ATTENDANCE_MARKING_FLOW_ID`
- `FLOW_PRIVATE_KEY` (base64-encoded)

Set the output values as Railway env vars:

```bash
railway variables set READING_ASSESSMENT_FLOW_ID=<value>
railway variables set ATTENDANCE_SETUP_FLOW_ID=<value>
railway variables set ATTENDANCE_MARKING_FLOW_ID=<value>
railway variables set FLOW_PRIVATE_KEY=<base64-value>
```

### Step 8: Test

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

## Full Manual Setup

For detailed step-by-step instructions, follow [SETUP.md](../../SETUP.md).
