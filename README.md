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
  <a href="docs/features/">Features</a> &middot;
  <a href="SETUP.md">Setup</a> &middot;
  <a href="docs/agent-customization.md">Customize</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/Orenda-Project/rumi-platform/actions/workflows/ci.yml"><img src="https://github.com/Orenda-Project/rumi-platform/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/platform-WhatsApp-25D366.svg" alt="WhatsApp" />
</p>

<p align="center">
  <img src="docs/images/features/hero.jpg" alt="A teacher and students using Rumi on WhatsApp" width="100%" />
</p>

---

Rumi is an open-source AI teaching companion that runs on **WhatsApp** — giving teachers 24/7 access to classroom coaching, reading assessments, lesson-plan generation, and professional development, in their own language, on the device they already carry.

It is built to be **cloned and run by anyone, anywhere**: set your own API keys, point it at your own WhatsApp number, and you have a teaching assistant for your schools — no commissioning, no vendor lock-in.

---

## Why Rumi Exists

Across the world, **millions of teachers work in isolation** — in rural schools, multigrade classrooms, and under-resourced systems where instructional coaches simply don't exist. Traditional professional development reaches teachers once or twice a year at best. The gap between what teachers need and what the system provides is enormous.

Rumi fills that gap. By meeting teachers on WhatsApp — the world's most widely used messaging app — Rumi provides:

- **Instant coaching feedback** on real classroom recordings, using research-backed pedagogical frameworks
- **Reading-fluency assessments** so teachers can measure student progress with the same rigor as standardized tests
- **Evidence-based lesson plans** adapted to local curriculum and context
- **Multilingual support** — teachers interact in the language they think in, not just the language of instruction

The core insight: **the best time to coach a teacher is right after they teach**, and the best tool is the one already in their pocket.

### Why it's open source

Good teaching support shouldn't depend on which country or company you happen to work for. We open-sourced Rumi so any ministry, NGO, school network, or research team can stand up their own instance — adapt the frameworks to their curriculum, run it in their languages, keep their data in their own systems, and improve it for everyone. The whole platform is designed to be set up by a non-technical operator working alongside an AI coding agent (Claude Code, Cursor, Codex, …). See [Setup](SETUP.md).

---

## What Rumi Does

Every feature below lives on WhatsApp. Click any feature for its own page — what it is, how it works, and the one or two API keys that switch it on.

| Feature | What it does | Switches on when you set |
|---|---|---|
| 💬 **[AI Chat](docs/features/ai-chat.md)** | Teachers ask any teaching question by text or voice and get expert, pedagogy-grounded answers | core (uses `OPENROUTER_API_KEY`); voice questions need `SONIOX_API_KEY` |
| 📝 **[Registration](docs/features/registration.md)** | Friendly WhatsApp onboarding — name, school, grade, language | _Always on_ (core) |
| 🎯 **[Classroom Coaching](docs/features/coaching.md)** | Teacher sends a class recording; Rumi transcribes, scores it against a pedagogical framework, has a reflective conversation, and returns a scored PDF report | `SONIOX_API_KEY` |
| 📖 **[Reading Assessment](docs/features/reading-assessment.md)** | A student reads aloud into WhatsApp; Rumi measures fluency, accuracy, pronunciation, and comprehension against benchmarks | `SONIOX_API_KEY` |
| 📋 **[Lesson Plans](docs/features/lesson-plans.md)** | Teacher names a topic and grade; Rumi generates a full lesson plan as a downloadable PDF | `GAMMA_API_KEY` |
| 🗣️ **[Voice Messages](docs/features/voice.md)** | Full spoken interaction in many languages — teachers speak, Rumi listens and replies in text and voice | `SONIOX_API_KEY` + `ELEVENLABS_API_KEY` |
| 🎬 **[Video Generation](docs/features/video.md)** | Teacher requests a topic; Rumi produces a short narrated educational video | `VIDEO_GENERATION_ENABLED` + `KIE_API_KEY` |
| ✅ **[Attendance](docs/features/attendance.md)** | Voice- or tap-based student attendance via WhatsApp Flows | _Always on_ (core) |
| 🧮 **[Exam Checker](docs/features/exam-checker.md)** | Teacher photographs answer sheets; Rumi grades them with vision OCR + AI | `MISTRAL_API_KEY` |

> **No tiers, no toggles to hunt for.** Rumi turns features on by **presence**: set a feature's API key and it switches on automatically; leave it blank and that feature stays off cleanly — the bot never crashes over a missing key. Run **`npm run doctor`** anytime to see exactly which features are live for your current configuration.

**→ Browse the full [feature library](docs/features/).**

---

## Quick Start

```bash
# 1. Fork this repo on GitHub, then clone YOUR fork
git clone https://github.com/YOUR-ORG/rumi-platform.git
cd rumi-platform

# 2. Install dependencies
npm install && cd bot && npm install && cd ..

# 3. Configure environment — copy the template and fill the 8 REQUIRED values
cp .env.template .env
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, REDIS_URL,
#    WHATSAPP_TOKEN, PHONE_NUMBER_ID, WABA_ID, WEBHOOK_VERIFY_TOKEN
#    (each optional feature's keys are documented inline, grouped by feature)

# 4. Check your configuration — pings every service you configured and prints
#    a green/red matrix of which features are live
npm run doctor

# 5. Set up the database (schema + seed on a fresh Supabase project)
npm run bootstrap:db          # coming in v2 setup; see SETUP.md today

# 6. Deploy (Railway, Docker, or any Node host) and point your WhatsApp
#    webhook at your deployment. Then send "Hi" to your bot number.
```

The whole flow is designed to be driven by an **AI setup agent**: open the repo in Claude Code / Cursor / Codex and ask it to set you up — `AGENTS.md` and the bundled skills tell it exactly what to do. See **[SETUP.md](SETUP.md)** for the complete walkthrough (including getting a WhatsApp number from scratch).

### What you need

| Requirement | Where to get it | For |
|---|---|---|
| GitHub account | [github.com](https://github.com) | Fork the repo |
| Node.js 18+ | [nodejs.org](https://nodejs.org) | Run the bot |
| Supabase project | [supabase.com](https://supabase.com) (free tier works) | Database |
| Redis | [Railway](https://railway.app) / [Upstash](https://upstash.com) | Sessions + job queue |
| OpenRouter key | [openrouter.ai/keys](https://openrouter.ai/keys) | All AI text |
| WhatsApp Business | [Meta Business Manager](https://business.facebook.com) | The channel |

Optional feature keys (Soniox, ElevenLabs/Uplift, Gamma, Kie.ai, Azure, Mistral) are only needed for the features that use them — each is documented in [`.env.template`](.env.template).

---

## Architecture

```
rumi-platform/
├── bot/                    # WhatsApp Bot (Node.js + Express)
│   ├── whatsapp-bot.js     # Entry point — webhook, message routing
│   ├── shared/
│   │   ├── config/         # Branding, capabilities, languages, regions
│   │   ├── services/       # LLM, coaching, reading, lesson plans, video, …
│   │   ├── handlers/       # text / voice / image / flow / exam / attendance
│   │   └── constants/      # Scoring rubrics, media IDs
│   ├── workers/            # Background workers (coaching, video, lesson plans, …)
│   ├── docs/flows/         # WhatsApp Flow JSON (registered to your WABA)
│   └── scripts/setup/      # doctor, flow registration, encryption, state
├── dashboard/              # Observability portal — analytics, health
├── portal/                 # Teacher web portal (React)
├── infrastructure/
│   └── supabase/           # SQL schema, RLS policies, seed data
├── docs/                   # Architecture, features, customization, cost
└── .claude/                # Agent config + setup skills
```

### How a message flows

```
Teacher on WhatsApp
  → Meta Cloud API → POST /webhook → Express handler
    → user lookup (Supabase) → language detection → feature routing
      → text | voice | image | flow handler
        → LLM (OpenRouter) → response
        → async job queue (Redis) → background workers → reports / media
          → delivered back to the teacher on WhatsApp
```

See [docs/architecture.md](docs/architecture.md) for the full picture.

---

## Customization

Rumi is meant to be **adapted to your context** — your curriculum, your frameworks, your languages, your brand.

**Quick (environment variables):**

```env
BOT_NAME=MyAssistant
ORG_NAME=My School Network
SUPPORT_CONTACT=help@example.org
LLM_MODEL=anthropic/claude-sonnet-4
```

**Deep (agent-first):** this repo is designed to be customized by AI-assisted IDEs. The [Agent Customization Guide](docs/agent-customization.md) maps each goal to exact files:

| I want to… | Guide |
|---|---|
| Swap the coaching framework (TEACH / Danielson / custom) | [Section 1](docs/agent-customization.md#1-swap-the-coaching-framework) |
| Use ASER / EGRA instead of DIBELS for reading | [Section 2](docs/agent-customization.md#2-change-reading-assessment-methodology) |
| Change the lesson-plan format (5E, UbD, …) | [Section 3](docs/agent-customization.md#3-modify-lesson-plan-templates) |
| Add a language | [Section 4](docs/agent-customization.md#4-add-or-change-languages) |
| Switch LLM provider/model | [Section 5](docs/agent-customization.md#5-switch-llm-provider-or-model) |
| Add a region with its own feature gating | [docs/features/](docs/features/) |
| Rebrand the bot | [Section 11](docs/agent-customization.md#11-rebrand-the-bot) |

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 18+ | Server-side JavaScript |
| Web | Express.js | Webhook + API routes |
| Messaging | WhatsApp Business Cloud API | Messages, media, interactive Flows |
| AI / LLM | OpenRouter (500+ models) | Chat, analysis, content |
| Database | Supabase (PostgreSQL) | Tables with Row-Level Security |
| Queue | Redis-backed async job queue | Transcription, reports, video, exams |
| Speech-to-Text | Soniox, Whisper, Modal MMS-ASR | Multilingual transcription |
| Text-to-Speech | ElevenLabs (+ Uplift for Urdu/regional) | Voice replies, reflective questions |
| PDF | PDFKit / pdfmake | Coaching & reading reports |
| Images / Video | Kie.ai (Nano Banana Pro), FFmpeg | Educational visuals & video |
| OCR | Mistral vision (+ Chandra, Surya) | Exam-sheet scanning |
| Pronunciation | Azure Speech (optional) | Reading-assessment scoring |
| Hosting | Railway / Docker / any Node host | Deployment |
| Observability | Axiom (optional, recommended) | Structured logs + tracing |

---

## Testing

```bash
npm test               # full suite
npm run test:security  # secret scan — no hardcoded credentials
npm run test:schema    # database schema validation
npm run test:setup     # setup tooling
npm run doctor         # live preflight: which services + features are configured
npm run simulate       # CLI simulator (test without WhatsApp)
```

Every push and PR is gated by CI, including an automated **secret scan** (gitleaks) so credentials can never be committed.

---

## Documentation

| Doc | Description |
|---|---|
| [SETUP.md](SETUP.md) | Full setup, incl. WhatsApp number from scratch |
| [docs/features/](docs/features/) | Per-feature deep dives (what / how / enable) |
| [docs/architecture.md](docs/architecture.md) | System architecture & message flow |
| [docs/agent-customization.md](docs/agent-customization.md) | Agent-first deep customization |
| [docs/cost-guide.md](docs/cost-guide.md) | Monthly cost estimates by feature |
| [docs/monitoring.md](docs/monitoring.md) | Observability & debugging |

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup, code style, testing, and PR guidelines.

---

## About

Rumi is built by [Taleemabad](https://taleemabad.com) and shared with the world as open source. The name comes from Jalaluddin Rumi, the 13th-century poet and teacher who believed that education is not the filling of a vessel but the kindling of a flame.

**Website**: [hellorumi.ai](https://hellorumi.ai) · **Research**: [hellorumi.ai/research](https://hellorumi.ai/research)

## License

Apache License 2.0 — see [LICENSE](LICENSE). You are free to use, modify, and distribute this software. We encourage contributing improvements back to the community.
