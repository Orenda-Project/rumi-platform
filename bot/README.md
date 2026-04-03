# Rumi WhatsApp Bot (Phase 1 - Core)

This is the core WhatsApp bot — the primary component of the Rumi platform. It handles all WhatsApp messaging, AI chat, coaching analysis, reading assessments, and lesson plan generation.

## Quick Start

```bash
cd bot
npm install

# Copy and fill environment variables
cp ../.env.template ../.env

# Start in development mode
npm run dev

# Or use the CLI simulator (no WhatsApp needed)
cd .. && npm run simulate
```

## Architecture

```
bot/
├── whatsapp-bot.js          # Main Express server + webhook handler
├── workers/
│   └── sqs-worker.js        # Background job processor
├── shared/
│   ├── config/               # Branding, feature tiers, capabilities
│   ├── services/             # AI (LLM), queue, coaching, reading, etc.
│   ├── handlers/             # Message routing, flow responses, media
│   ├── database/             # Supabase data access layer
│   ├── utils/                # Shared utilities
│   └── middleware/           # Express middleware
├── scripts/
│   ├── simulate.js           # CLI simulator for local testing
│   └── validate-env.js       # Environment variable validator
└── docs/                     # Feature-specific documentation
```

## Key Services

| Service | File | Description |
|---------|------|-------------|
| LLM Client | `shared/services/llm-client.js` | OpenRouter/OpenAI integration |
| Queue | `shared/services/queue/sqs-queue.service.js` | AWS SQS job queue |
| Coaching | `shared/services/coaching.service.js` | OECD coaching analysis |
| Reading | `shared/services/reading-assessment.service.js` | Fluency assessment |
| WhatsApp | `shared/services/whatsapp.service.js` | Message send/receive |

## License

Apache License 2.0 — See [LICENSE](../LICENSE).
