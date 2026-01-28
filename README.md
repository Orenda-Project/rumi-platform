<p align="center">
  <img src=".github/rumi-logo.png" alt="Rumi" width="120" />
</p>

<h1 align="center">Rumi</h1>

<p align="center">
  <strong>AI Teaching Assistant for WhatsApp</strong><br>
  You're not teaching alone.
</p>

<p align="center">
  <a href="https://hellorumi.ai">Website</a> &middot;
  <a href="https://hellorumi.ai/research">Research</a> &middot;
  <a href="docs/agent-customization.md">Customization Guide</a> &middot;
  <a href="SETUP.md">Setup</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/hyasin270/rumi-platform/actions/workflows/ci.yml"><img src="https://github.com/hyasin270/rumi-platform/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/tests-158%20passing-brightgreen.svg" alt="Tests" />
  <img src="https://img.shields.io/badge/platform-WhatsApp-25D366.svg" alt="WhatsApp" />
</p>

---

Rumi is an open-source AI teaching companion that runs on WhatsApp, giving teachers 24/7 access to classroom coaching, reading assessments, lesson plan generation, and professional development — in their own language, on the device they already have.

---

## Why Rumi Exists

Across the developing world, **millions of teachers work in isolation** — in rural schools, multigrade classrooms, and under-resourced systems where instructional coaches simply don't exist. Traditional professional development reaches teachers once or twice a year at best. The gap between what teachers need and what the system provides is enormous.

Rumi fills that gap. By meeting teachers on WhatsApp — the world's most widely used messaging app — Rumi provides:

- **Instant coaching feedback** on real classroom recordings, using research-backed pedagogical frameworks
- **Reading fluency assessments** so teachers can measure student progress with the same rigor as standardized tests
- **Evidence-based lesson plans** generated from templates adapted to local curriculum and context
- **Multilingual support** — teachers interact in the language they think in, not just the language of instruction

The core insight: **the best time to coach a teacher is right after they teach**, and the best tool is the one already in their pocket.

---

## What Rumi Does

| Feature | How It Works | Tier |
|---------|-------------|------|
| **AI Chat** | Teachers ask any teaching question via text or voice; get expert responses grounded in pedagogy | Minimal |
| **Registration** | Automated teacher onboarding via WhatsApp — name, school, grade, language | Minimal |
| **Classroom Coaching** | Teacher uploads classroom audio; Rumi transcribes, analyzes against OECD teaching quality standards, conducts a reflective conversation, and generates a scored PDF report | Recommended |
| **Reading Assessment** | Students read aloud into WhatsApp; Rumi measures fluency (WCPM), pronunciation accuracy, and comprehension against grade-level benchmarks | Recommended |
| **Lesson Plans** | Teacher describes a topic and grade; Rumi generates a comprehensive 9-section lesson plan as a downloadable PDF | Full |
| **Voice Messages** | Full voice interaction in 9 languages — teachers speak, Rumi listens, transcribes, responds in both text and voice | Full |
| **AI Video Generation** | Teacher requests a topic; Rumi generates an educational video with narration, images, and animations | Full |
| **Attendance** | Voice or text-based student attendance tracking via WhatsApp | Full |
| **Exam Checker** | Teacher photographs student exam papers; Rumi grades them using OCR and AI-based assessment | Full |

### Classroom Coaching: How It Works

1. **Teacher records** their classroom (audio or video) and sends it to Rumi on WhatsApp
2. **Rumi transcribes** the recording using Soniox (supporting multilingual and code-switched speech)
3. **Rumi analyzes** the transcript against the **OECD Framework for High-Quality Teaching** — scoring 19 criteria across 5 goals: Formative Assessment, Student Engagement, Quality Content, Classroom Interaction, and Classroom Management (118 total marks)
4. **Rumi conducts a reflective conversation** — 3 voice-delivered questions prompting the teacher to reflect on specific moments from their lesson
5. **Rumi generates a PDF report** — with scores per goal, evidence from the transcript, growth areas, actionable recommendations, and performance charts
6. **Prior feedback tracking** — each session builds on previous ones, so recommendations evolve over time

The coaching framework is fully customizable. Teams can swap the OECD rubric for **Teach** (World Bank), **Danielson**, **ISTEP**, or any other classroom observation tool. See [docs/agent-customization.md](docs/agent-customization.md#1-swap-the-coaching-framework).

### Reading Assessment: How It Works

1. **Teacher selects a student** and initiates an assessment
2. **Rumi generates** an age-appropriate reading passage (adaptive difficulty based on prior results)
3. **Student reads aloud** into WhatsApp
4. **Rumi measures**: Words Correct Per Minute (WCPM), reading accuracy, pronunciation quality, and comprehension (via follow-up questions)
5. **Results are compared** against grade-level benchmarks (DIBELS/EGRA-normed, L2-adjusted for non-English readers)
6. **Teacher receives** a detailed fluency report with diagnostic feedback and recommended next steps

Assessment methodology is customizable — teams can swap to **ASER**, **EGRA**, or custom benchmarks. See [docs/agent-customization.md](docs/agent-customization.md#2-change-reading-assessment-methodology).

### Languages Supported

Rumi supports **9 languages** for voice and text interaction:

| Language | Code | Script | Voice (TTS) | Speech Recognition |
|----------|------|--------|-------------|-------------------|
| English | en | LTR | ElevenLabs | Soniox, Whisper |
| Urdu | ur | RTL | ElevenLabs | Soniox |
| Arabic | ar | RTL | ElevenLabs | Soniox |
| Spanish | es | LTR | ElevenLabs | Soniox |
| Balochi | bal-PK | RTL | — | Modal MMS-ASR |
| Sindhi | sd-PK | RTL | — | Modal MMS-ASR |
| Pashto | ps-PK | RTL | — | Modal MMS-ASR |
| Punjabi | pa-PK | RTL | — | Modal MMS-ASR |
| Tamil | ta-LK | LTR | — | Soniox |

Adding a new language requires updates to 7 configuration files. See [docs/agent-customization.md](docs/agent-customization.md#4-add-or-change-languages).

---

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

The setup agent guides you through Supabase, Redis, Railway, WhatsApp, and API key configuration interactively.

### Option B: Manual Setup

See [SETUP.md](SETUP.md) for step-by-step instructions.

### What You Need

| Requirement | Where to Get It |
|------------|----------------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| Supabase account (free tier) | [supabase.com](https://supabase.com) |
| Railway account (free tier) | [railway.app](https://railway.app) |
| OpenRouter API key | [openrouter.ai/keys](https://openrouter.ai/keys) |
| WhatsApp Business credentials | [Meta Business Manager](https://business.facebook.com) |

---

## Architecture

```
rumi-platform/
├── bot/                    # WhatsApp Bot (Node.js + Express)
│   ├── whatsapp-bot.js     # Main entry point (webhook, message routing)
│   ├── shared/
│   │   ├── config/         # Branding, feature tiers, capabilities, languages
│   │   ├── services/       # 39+ service modules (LLM, coaching, reading, video...)
│   │   ├── handlers/       # Message handlers (text, voice, image, flow, exam, attendance)
│   │   └── constants/      # Scoring rubrics, media IDs
│   ├── workers/            # 8 background workers (coaching, video, lesson plans, exams)
│   └── scripts/            # CLI simulator, env validator, deployment helpers
├── dashboard/              # Observability Portal — analytics, session history, system health
├── portal/                 # Teacher Portal — React web app for coaching/reading history
├── infrastructure/
│   ├── supabase/           # SQL schema (52+ tables), RLS policies, seed data
│   └── railway/            # Procfile for web + worker processes
├── tests/                  # 158 tests across 11 suites
├── docs/                   # Architecture, customization, monitoring, cost guide
└── .claude/                # Claude Code config + /setup skill
```

### How Messages Flow

```
Teacher on WhatsApp
  → Meta Cloud API → POST /webhook → Express handler
    → User lookup (Supabase) → Language detection → Feature routing
      → Text | Voice | Image | Flow handler
        → LLM Service (OpenRouter) → Response generation
        → BullMQ Queue → Background workers → Reports / media
          → WhatsApp delivery back to teacher
```

---

## Feature Tiers

| Tier | Features | API Keys Needed | Est. Monthly Cost |
|------|----------|----------------|-------------------|
| **Minimal** | AI Chat + Registration | 1 (OpenRouter) | ~$15 |
| **Recommended** | + Coaching + Reading Assessment | 2 (+ Soniox) | ~$50 |
| **Full** | All features (voice, video, lesson plans, attendance, exams) | 5 (+ ElevenLabs, Azure, Gamma) | ~$200+ |

Cost estimates assume 50–100 teachers, ~500 messages/day. See [docs/cost-guide.md](docs/cost-guide.md).

```env
RUMI_TIER=minimal
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 18+ | Server-side JavaScript |
| Web Framework | Express.js | Webhook handling, API routes |
| Messaging | WhatsApp Business Cloud API | Messages, media, interactive flows |
| AI/LLM | OpenRouter (500+ models) | Chat, analysis, content generation |
| Database | Supabase (PostgreSQL) | 52+ tables with Row Level Security |
| Job Queue | BullMQ (Redis) | 7 async job types with retry and checkpointing |
| Speech-to-Text | Soniox, Whisper, Modal MMS-ASR | 9-language transcription |
| Text-to-Speech | ElevenLabs | Voice responses in 4+ languages |
| PDF Generation | pdfkit, pdfmake | Coaching reports, lesson plans |
| Video Assembly | FFmpeg, Kie.ai, DALL-E | Educational video generation |
| OCR | AWS Textract, Surya | Exam paper scanning |
| Deployment | Railway | Hosting with auto-scaling |
| Monitoring | Axiom (optional) | Structured log aggregation |

---

## Customization

### Quick (Environment Variables)

```env
BOT_NAME=MyAssistant
ORG_NAME=My School District
SUPPORT_CONTACT=help@myschool.org
LLM_MODEL=anthropic/claude-sonnet-4
```

### Deep (Agent-First Guide)

This repo is designed to be customized by teams using **Cursor**, **Claude Code**, or similar AI-assisted IDEs. The [Agent Customization Guide](docs/agent-customization.md) maps every customization goal to exact files and step-by-step instructions:

| I want to... | Guide Section |
|-------------|---------------|
| Swap OECD coaching for Teach / Danielson / custom framework | [Section 1](docs/agent-customization.md#1-swap-the-coaching-framework) |
| Use ASER instead of DIBELS for reading | [Section 2](docs/agent-customization.md#2-change-reading-assessment-methodology) |
| Change lesson plan format (5E, UbD, etc.) | [Section 3](docs/agent-customization.md#3-modify-lesson-plan-templates) |
| Add a new language | [Section 4](docs/agent-customization.md#4-add-or-change-languages) |
| Switch LLM provider (Claude, Gemini, local) | [Section 5](docs/agent-customization.md#5-switch-llm-provider-or-model) |
| Add a new feature | [Section 7](docs/agent-customization.md#7-add-a-new-feature) |
| Rebrand the entire bot | [Section 11](docs/agent-customization.md#11-rebrand-the-bot) |

---

## Testing

```bash
npm test              # All 158 tests (11 suites)
npm run test:security # No hardcoded secrets
npm run test:sprint1  # Core feature tests
npm run test:schema   # Database schema validation
npm run test:setup    # Setup tooling verification
npm run test:docs     # Documentation completeness
npm run simulate      # CLI simulator (test without WhatsApp)
npm run validate:env  # Environment variable check
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [SETUP.md](SETUP.md) | Manual setup guide (8 steps) |
| [docs/architecture.md](docs/architecture.md) | System architecture and message flow |
| [docs/agent-customization.md](docs/agent-customization.md) | Agent-first deep customization (12 sections) |
| [docs/customization.md](docs/customization.md) | Basic customization (branding, tiers, LLM) |
| [docs/monitoring.md](docs/monitoring.md) | Observability, dashboards, debugging |
| [docs/cost-guide.md](docs/cost-guide.md) | Monthly cost estimates by tier |
| [bot/docs/](bot/docs/) | 15+ detailed feature and technical guides |
| [bot/database/SCHEMA_GUIDE.md](bot/database/SCHEMA_GUIDE.md) | Database schema explained (52+ tables) |

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup, code style, testing, and PR guidelines.

---

## About

Rumi is built by [Taleemabad](https://taleemabad.com), Pakistan's leading EdTech company. The name comes from Jalaluddin Rumi, the 13th-century poet and teacher who believed that education is not the filling of a vessel but the kindling of a flame.

**Website**: [hellorumi.ai](https://hellorumi.ai) | **Research**: [hellorumi.ai/research](https://hellorumi.ai/research)

## License

Apache License 2.0 — See [LICENSE](LICENSE).

You are free to use, modify, and distribute this software. We encourage contributing improvements back to the community.
