# Rumi Platform - AI Teaching Assistant

This is the open-source Rumi platform for deploying AI-powered educational chatbots on WhatsApp.

## Quick Start

Run `/setup` to start the automated setup process, or follow SETUP.md for manual instructions.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `bot/` | WhatsApp Bot (Node.js, Express) |
| `bot/shared/config/` | Branding, feature tiers, capabilities |
| `bot/shared/services/` | AI, queue, database services |
| `bot/workers/` | BullMQ background job worker |
| `bot/scripts/` | CLI simulator, validators |
| `dashboard/` | Observability Portal (Phase 2) |
| `portal/` | Teacher Portal (Phase 2) |
| `infrastructure/` | Database schema, deployment configs |
| `tests/` | Test suites for all sprints |
| `docs/` | Architecture, setup, customization |

## Feature Tiers

Set `RUMI_TIER` in your `.env`:

- **minimal**: AI Chat + Registration (1 API key: OpenRouter)
- **recommended**: + Coaching + Reading Assessment (2 keys: + Soniox)
- **full**: All features (5 keys: + ElevenLabs, Azure, Gamma)

## Key Configuration Files

- `.env.template` - Copy to `.env` and fill in values
- `bot/shared/config/branding.js` - Customize bot name, org, languages
- `bot/shared/config/feature-tiers.js` - Feature tier definitions
- `bot/shared/services/llm-client.js` - LLM provider (OpenRouter/OpenAI)

## Running Tests

```bash
npm test              # All tests
npm run test:security # Sprint 0: Security scan
npm run test:sprint1  # Sprint 1: Core features
npm run test:schema   # Sprint 2: Schema validation
npm run validate:env  # Check environment variables
```

## Customization

For deep customization (swapping frameworks, changing assessments, adding features), see:
- `docs/agent-customization.md` — Agent-first guide with file maps for every change type
- `docs/customization.md` — Basic branding, tiers, LLM provider
- `docs/monitoring.md` — Observability, dashboards, debugging

## Important Rules

1. Never commit `.env` files
2. Use `bot/shared/config/branding.js` for customization, not hardcoded values
3. All LLM calls go through `bot/shared/services/llm-client.js`
4. Background jobs use BullMQ (Redis), not SQS
