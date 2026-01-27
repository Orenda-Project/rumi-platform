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
SUPABASE_SERVICE_KEY=your-service-role-key
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

## Step 8: Test

Send "Hi" to your WhatsApp bot number. You should receive a welcome message and registration flow.

## Upgrading Tiers

To upgrade from Minimal to Recommended:

1. Get a Soniox API key at [soniox.com](https://soniox.com)
2. Add to `.env`: `SONIOX_API_KEY=your-key`
3. Update: `RUMI_TIER=recommended`
4. Redeploy

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check Railway logs: `railway logs` |
| Database errors | Re-run `verify-schema.sql` in Supabase |
| Redis connection failed | Verify `REDIS_URL` is correct |
| WhatsApp webhook fails | Verify `WEBHOOK_VERIFY_TOKEN` matches |

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
