# Rumi Platform - AI Teaching Assistant

> Universal agent configuration for AI coding assistants.
> See [agents.md](https://agents.md) for the specification.

## Project Overview

Open-source AI teaching companion on WhatsApp. Teachers get 24/7 coaching, reading assessments, lesson plans, and professional development — in their own language.

## Tech Stack

- **Runtime**: Node.js 18+ (Express.js)
- **Database**: Supabase (PostgreSQL, 52+ tables, Row Level Security)
- **Queue**: BullMQ (Redis) — 7 async job types
- **AI**: OpenRouter (500+ models via single API)
- **Messaging**: WhatsApp Business Cloud API

## Project Structure

```
rumi-platform/
├── bot/                    # WhatsApp Bot (main application)
│   ├── whatsapp-bot.js     # Entry point (webhook, message routing)
│   ├── shared/config/      # Branding, feature tiers, capabilities
│   ├── shared/services/    # 39+ service modules
│   ├── shared/handlers/    # Message handlers (text, voice, image, flow)
│   ├── workers/            # 8 background workers
│   └── scripts/            # CLI simulator, validators
├── infrastructure/
│   ├── supabase/           # SQL schema, RLS policies, seed data
│   └── railway/            # Deployment configs
├── tests/                  # 158 tests across 11 suites
├── docs/                   # Architecture, customization, monitoring
└── .claude/                # Claude Code config + /setup skill
```

## Commands

```bash
npm install               # Install root dependencies
cd bot && npm install     # Install bot dependencies
npm test                  # Run all 158 tests
npm run test:security     # Security scan (no hardcoded secrets)
npm run test:sprint1      # Core feature tests
npm run test:schema       # Database schema validation
npm run validate:env      # Check environment variables
npm run simulate          # CLI simulator (test without WhatsApp)
```

## Key Rules

1. **No credentials in code** — use `.env` (copy from `.env.template`)
2. **Branding via config** — edit `bot/shared/config/branding.js`, not hardcoded values
3. **LLM calls via service** — all AI calls go through `bot/shared/services/llm-client.js`
4. **Background jobs use BullMQ** (Redis), not SQS
5. **Feature tiers** — set `RUMI_TIER` to `minimal`, `recommended`, or `full`

## Key Configuration Files

| File | Purpose |
|------|---------|
| `.env.template` | Copy to `.env` and fill in values |
| `bot/shared/config/branding.js` | Bot name, org, languages |
| `bot/shared/config/feature-tiers.js` | Feature tier definitions |
| `bot/shared/services/llm-client.js` | LLM provider (OpenRouter/OpenAI) |

## Testing

Tests run via Jest. The test runner (`tests/run.js`) handles Node.js 22+ compatibility automatically.

All tests are designed to run without external services (no Supabase, Redis, or WhatsApp credentials needed).

## Customization

See `docs/agent-customization.md` for deep customization:
- Swap coaching frameworks (OECD, Teach, Danielson)
- Change reading assessment methodology (DIBELS, ASER, EGRA)
- Add new languages (9 currently supported)
- Switch LLM providers
- Add new features
