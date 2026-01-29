# /setup - Rumi Platform Setup

Automated setup for deploying the Rumi AI Teaching Assistant. This skill guides you through the complete setup interactively.

## What This Does

1. **Pre-flight checks**: Verifies Node.js 18+, git, npm
2. **Tier selection**: Asks which feature tier (minimal/recommended/full)
3. **Auto-provision infrastructure**: Calls provisioner API to create Supabase + Railway + Redis + API keys
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

**That's it!** The provisioner automatically creates:
- Supabase project + schema
- Railway project + Redis
- OpenRouter API key ($10/mo, 180-day expiry)
- Soniox temp key (Tier 2+)
- ElevenLabs shared key (Tier 3)
- Azure Speech shared key (Tier 3)

## Tier Options

When asked "Which tier?":

| Tier | Features | Auto-Provisioned Services |
|------|----------|--------------------------|
| **Minimal** | AI Chat + Registration | Supabase, Railway, Redis, OpenRouter |
| **Recommended** | + Coaching + Reading Assessment | + Soniox STT (24hr temp key) |
| **Full** | All features (voice, video, lesson plans, attendance) | + ElevenLabs TTS, Azure Speech |

## Setup Steps (Detailed)

### Step 1: Pre-flight Checks

```bash
node --version  # Must be 18+
npm --version
git --version
```

### Step 2: Auto-Provision Infrastructure

Run the provisioner script to automatically create all infrastructure:

```bash
# Tier 2 (Recommended) - Coaching + Reading Assessment
node bot/scripts/setup/provision-infrastructure.js --name my-school-name --tier recommended

# Tier 1 (Minimal) - Just AI Chat
node bot/scripts/setup/provision-infrastructure.js --name my-school-name --tier minimal

# Tier 3 (Full) - All features including TTS
node bot/scripts/setup/provision-infrastructure.js --name my-school-name --tier full
```

This automatically:
- Creates Supabase project with full schema
- Creates Railway project with Redis
- Provisions OpenRouter key ($10/mo, 180-day)
- Provisions Soniox temp key (Tier 2+)
- Adds shared ElevenLabs key (Tier 3)
- Adds shared Azure Speech key (Tier 3)
- Writes all credentials to `.env`

### Step 3: Add WhatsApp Credentials

Edit `.env` and add your WhatsApp credentials (from Meta Business Manager):

```env
WHATSAPP_TOKEN=EAA...
PHONE_NUMBER_ID=123456789
WABA_ID=987654321
WEBHOOK_VERIFY_TOKEN=your-random-string
```

### Step 4: Install & Deploy

```bash
cd bot && npm install && cd ..
railway login
railway up
```

### Step 5: Configure WhatsApp Webhook

1. Go to Meta Business Manager > WhatsApp > Configuration > Webhook
2. Set URL: `https://your-app.up.railway.app/webhook`
3. Set verify token: same as `WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`

### Step 5.5: Register WhatsApp Flows & Templates

After deploying, register the WhatsApp Flows (interactive forms) and Message Templates (carousel menus) with Meta:

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-app.up.railway.app
```

The script will:
1. Generate RSA-2048 encryption keys
2. Register 3 flows: Reading Assessment, Attendance Setup, Attendance Marking
3. Submit 2 templates: Video Style Selection, Feature Menu Carousel

**Output**: Flow IDs and env var values to set in Railway:
- `READING_ASSESSMENT_FLOW_ID`
- `ATTENDANCE_SETUP_FLOW_ID`
- `ATTENDANCE_MARKING_FLOW_ID`
- `FLOW_PRIVATE_KEY` (base64-encoded)

**Note**: Templates need Meta approval (1-24 hours). The bot uses fallback interactive lists until approved.

Set the output values as Railway env vars:

```bash
railway variables set READING_ASSESSMENT_FLOW_ID=<value>
railway variables set ATTENDANCE_SETUP_FLOW_ID=<value>
railway variables set ATTENDANCE_MARKING_FLOW_ID=<value>
railway variables set FLOW_PRIVATE_KEY=<base64-value>
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
