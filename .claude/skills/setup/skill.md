# /setup - Rumi Platform Setup

Automated setup for deploying the Rumi AI Teaching Assistant.

## What This Does

1. **Pre-flight checks**: Verifies Node.js 18+, git, Docker (for local Redis)
2. **Tier selection**: Asks which feature tier (minimal/recommended/full)
3. **Service authentication**: Supabase login, Railway login, OpenRouter key
4. **Parallel setup**:
   - Track A: Supabase database (via MCP) — create project, run schema, seed data
   - Track B: Railway deployment (via CLI) — create project, add Redis
   - Track C: Validate API keys
5. **Deploy**: Set env vars, deploy to Railway
6. **WhatsApp config**: Set webhook URL, verify handshake
7. **E2E test**: Send test message, verify response

## Usage

```
/setup
```

The agent will guide you through each step interactively.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)
- A Railway account (free tier works)
- An OpenRouter API key (openrouter.ai/keys)
- WhatsApp Business credentials (from your admin)

## Tier Options

When asked "Which tier?":

1. **Minimal** — AI Chat + Registration. 1 API key. Setup in ~15 min.
2. **Recommended** — + Coaching + Reading Assessment. 2 API keys. Setup in ~20 min.
3. **Full** — All features. 5 API keys. Setup in ~30 min.

## Resuming

If setup fails partway through, run `/setup` again. It reads `.setup-state.json` and resumes from the last completed step.

## Manual Alternative

If you prefer manual setup, follow SETUP.md instead.
