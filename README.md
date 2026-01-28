# Rumi - AI Teaching Assistant for WhatsApp

Rumi is an open-source platform for deploying AI-powered educational chatbots on WhatsApp. Built for teachers in emerging markets, it provides classroom coaching, reading assessments, lesson plan generation, and more.

## Features

| Feature | Description | Tier |
|---------|-------------|------|
| AI Chat | Teachers ask any teaching question, get expert AI responses | Minimal |
| Registration | Automated teacher onboarding via WhatsApp | Minimal |
| Classroom Coaching | Upload classroom audio, receive OECD-framework feedback | Recommended |
| Reading Assessment | Test student fluency with DIBELS-normed benchmarks | Recommended |
| Lesson Plans | Generate evidence-based lesson plans (9-section PDF) | Full |
| Voice Messages | Send and receive voice in 9+ languages | Full |
| Video Generation | AI-generated educational videos | Full |

## Quick Start

### Option A: Automated Setup (Recommended)

```bash
git clone https://github.com/taleemabad/rumi-platform.git
cd rumi-platform
```

Open in [Cursor](https://cursor.com) or any IDE with Claude Code, then type:

```
/setup
```

The setup agent will guide you through everything interactively.

### Option B: Manual Setup

See [SETUP.md](SETUP.md) for step-by-step manual instructions.

## Architecture

```
rumi-platform/
├── bot/                    # WhatsApp Bot (Node.js + Express)
│   ├── whatsapp-bot.js     # Main entry point
│   ├── shared/             # Shared config, services, handlers
│   │   ├── config/         # Branding, feature tiers, capabilities
│   │   ├── services/       # AI (LLM), queue, database, audio
│   │   └── handlers/       # Message, webhook, media handlers
│   ├── workers/            # BullMQ background job worker
│   └── scripts/            # CLI simulator, env validator
├── dashboard/              # Observability Portal (Phase 2)
├── portal/                 # Teacher Portal (Phase 2)
├── infrastructure/         # Database schema, deployment configs
│   ├── supabase/           # SQL schema, RLS policies, seed data
│   └── railway/            # Procfile, deployment config
├── tests/                  # Test suites
├── docs/                   # Documentation
└── .claude/                # Claude Code config + /setup skill
```

## Feature Tiers

Choose your tier based on which API keys you have:

| Tier | Features | API Keys | Monthly Cost |
|------|----------|----------|-------------|
| **Minimal** | AI Chat + Registration | 1 (OpenRouter) | ~$15 |
| **Recommended** | + Coaching + Reading | 2 (+ Soniox) | ~$50 |
| **Full** | All features | 5 (+ ElevenLabs, Azure, Gamma) | ~$200+ |

Set your tier in `.env`:

```
RUMI_TIER=minimal
```

## Technology Stack

- **Runtime**: Node.js 18+
- **Messaging**: WhatsApp Business API
- **AI/LLM**: OpenRouter (GPT-4o, Claude, Gemini, 500+ models)
- **Database**: Supabase (PostgreSQL)
- **Job Queue**: BullMQ (Redis)
- **Deployment**: Railway
- **Speech-to-Text**: Soniox (multi-language), OpenAI Whisper (fallback)

## Customization

Override branding via environment variables:

```env
BOT_NAME=MyAssistant
ORG_NAME=My School District
SUPPORT_CONTACT=help@myschool.org
```

Or edit `bot/shared/config/branding.js` directly.

## Testing

```bash
npm test              # All tests
npm run test:security # Security scan
npm run test:sprint1  # Feature tests
npm run test:schema   # Schema validation
npm run test:setup    # Setup tooling
npm run simulate      # CLI simulator (no WhatsApp needed)
npm run validate:env  # Check environment variables
```

## Documentation

| Doc | Description |
|-----|-------------|
| [SETUP.md](SETUP.md) | Manual setup guide |
| [docs/architecture.md](docs/architecture.md) | System architecture |
| [docs/customization.md](docs/customization.md) | Basic customization (branding, tiers, LLM) |
| [docs/agent-customization.md](docs/agent-customization.md) | Agent-first deep customization (swap frameworks, change assessments, add features) |
| [docs/monitoring.md](docs/monitoring.md) | Observability, monitoring, and debugging |
| [docs/cost-guide.md](docs/cost-guide.md) | Cost estimates per tier |

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

Apache License 2.0 - See [LICENSE](LICENSE).

Built by [Taleemabad](https://taleemabad.com) (Oraan Education Pvt. Ltd.)
