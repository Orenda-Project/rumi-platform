<p align="center">
  <img src=".github/rumi-logo.png" alt="Rumi" width="120" />
</p>

<h1 align="center">Rumi</h1>

<p align="center">
  <strong>The open-source AI Teaching Assistant that runs on WhatsApp</strong><br>
  You're not teaching alone.
</p>

<p align="center">
  <a href="#what-rumi-does">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#-built-to-be-run-by-an-ai-agent">Agent-Native</a> &middot;
  <a href="#customization">Customize</a> &middot;
  <a href="#documentation">Docs</a> &middot;
  <a href="https://hellorumi.ai">Website</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/Orenda-Project/rumi-platform/actions/workflows/ci.yml"><img src="https://github.com/Orenda-Project/rumi-platform/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/platform-WhatsApp-25D366.svg" alt="WhatsApp" />
  <img src="https://img.shields.io/badge/setup-AI--agent--native-7C3AED.svg" alt="Agent-native" />
</p>

<p align="center">
  <img src="docs/images/features/hero.jpg" alt="A teacher and students using Rumi on WhatsApp" width="100%" />
</p>

---

Rumi is an open-source AI teaching companion that runs on **WhatsApp** — giving teachers 24/7 access to classroom coaching, reading assessments, lesson plans, quizzes, and professional development, in their own language, on the device they already carry.

It's built to be **cloned and run by anyone, anywhere**: set your own API keys, point it at your own WhatsApp number, and you have a teaching assistant for your schools — no commissioning, no vendor lock-in. And because the whole repo is **agent-native**, you can set it up and adapt it by talking to an AI coding agent — [see how ↓](#-built-to-be-run-by-an-ai-agent).

---

## Why Rumi Exists

Across the world, **millions of teachers work in isolation** — in rural schools, multigrade classrooms, and under-resourced systems where instructional coaches simply don't exist. Traditional professional development reaches teachers once or twice a year at best. The gap between what teachers need and what the system provides is enormous.

Rumi fills that gap. By meeting teachers on WhatsApp — the world's most widely used messaging app — Rumi provides instant coaching on real lessons, reading-fluency assessment, curriculum-aligned content, and multilingual support, all on the phone already in their pocket. The core insight: **the best time to coach a teacher is right after they teach**, and the best tool is the one they already have.

**Why open source?** Good teaching support shouldn't depend on which country or company you happen to work for. Any ministry, NGO, school network, or research team can stand up their own instance — adapt the frameworks to their curriculum, run it in their languages, keep their data in their own systems, and improve it for everyone.

---

## What Rumi Does

Every feature lives on WhatsApp. Click any feature for its own page — what it is, how it works, and the API key(s) that switch it on.

| Feature | What it does | Switches on when you set |
|---|---|---|
| 💬 **[AI Chat](docs/features/ai-chat.md)** | Ask any teaching question by text or voice; get an expert, pedagogy-grounded answer | core (uses `OPENROUTER_API_KEY`); voice needs `SONIOX_API_KEY` |
| 📝 **[Registration](docs/features/registration.md)** | Friendly WhatsApp onboarding for teachers | _always on (core)_ |
| 🎯 **[Classroom Coaching](docs/features/coaching.md)** | A class recording → framework-scored report + reflective conversation | `SONIOX_API_KEY` |
| 📖 **[Reading Assessment](docs/features/reading-assessment.md)** | A student reads aloud → fluency, accuracy, pronunciation, comprehension | `SONIOX_API_KEY` |
| 📋 **[Lesson Plans](docs/features/lesson-plans.md)** | A topic + grade → a full lesson-plan PDF | `GAMMA_API_KEY` |
| 📸 **[Pic-to-LP](docs/features/pic-to-lp.md)** | A photo of a textbook page → an illustrated 2-page lesson plan | `KIE_API_KEY` |
| 📚 **[Homework](docs/features/homework.md)** | Pick a class + chapters → a curriculum homework bundle PDF | `HOMEWORK_FLOW_ID` |
| 🧠 **[Quiz](docs/features/quiz.md)** | Teacher sends a topic quiz to a class; students answer on their parents' WhatsApp, teacher gets a results report | _core (uses `OPENROUTER_API_KEY`)_ |
| 🗣️ **[Voice Messages](docs/features/voice.md)** | Full spoken interaction in many languages | `SONIOX_API_KEY` + `ELEVENLABS_API_KEY` |
| 🎬 **[Video Generation](docs/features/video.md)** | A topic → a short narrated educational video | `VIDEO_GENERATION_ENABLED` + `KIE_API_KEY` |
| ✅ **[Attendance](docs/features/attendance.md)** | Voice- or tap-based attendance via WhatsApp Flows | _always on (core)_ |
| 🧮 **[Exam Checker](docs/features/exam-checker.md)** | Photograph answer sheets → vision OCR + AI grading | `MISTRAL_API_KEY` |

> **No tiers, no toggles to hunt for.** Rumi gates features by **presence**: set a feature's API key and it switches on; leave it blank and it stays off cleanly — the bot never crashes over a missing key. Run **`npm run doctor`** anytime to see which features are live for your configuration.

**Go deeper:** browse the full **[feature library](docs/features/)** · understand how lesson plans get routed in **[LP_PATHS.md](docs/LP_PATHS.md)** · or look at a real **[sample coaching report (PDF)](docs/samples/coaching-report-sample.pdf)** rendered by the actual pipeline.

Utility flows round it out — **settings** (language + framework), **status** (your active sessions), **edit-class** (roster), and a **student-video** library — each presence-gated on its WhatsApp Flow id.

### 🌐 Languages — now with a full Indian-language suite

Rumi meets teachers in their own language — for **text chat, voice-note transcription (STT), and spoken replies (TTS)** alike. Alongside English, Urdu, Arabic, Spanish, and Pakistan's regional languages, Rumi now ships a complete **Indian-language suite**:

> **🇮🇳 हिन्दी Hindi · বাংলা Bengali · मराठी Marathi · తెలుగు Telugu · தமிழ் Tamil · ಕನ್ನಡ Kannada**

Every one works end to end — teachers can chat and send voice notes in their language, get spoken and written replies back, and generate **lesson plans localized to Indian classrooms** (₹ money problems, locally familiar names and contexts). Pick a language anytime with **`/language`**, or just message Rumi in your own script. Which languages appear is driven per-region by config (`region_features`), so a deployment shows only what it serves.

---

## 🤖 Built to be run by an AI agent

Rumi is **agent-native**: the repository is structured so a coding agent (Claude Code, Cursor, Codex, …) can read it, set it up, debug it, and customize it with you. This is what makes "clone and run it yourself" realistic for a small, non-specialist team.

- **Progressive-disclosure context.** A root [`CLAUDE.md`](CLAUDE.md) (and [`AGENTS.md`](AGENTS.md)) orients the agent, then routes it down to folder guides ([`bot/CLAUDE.md`](bot/CLAUDE.md), [`infrastructure/CLAUDE.md`](infrastructure/CLAUDE.md)) and, on demand, to **16 operational skills** under [`.claude/skills/`](.claude/skills/) — coaching, reading-assessment, registration, lesson-plan routing, whatsapp-flows, debugging, logging, database analysis, QA, the pre-merge checklist, and more. The agent loads only what the task needs.
- **Just ask.** Open the repo in your agent and say *"set me up"* — it reads the guides, walks the [`/setup`](.claude/skills/setup/SKILL.md) flow, runs `npm run doctor` and `npm run bootstrap:db`, and registers your WhatsApp Flows. Or say *"swap the coaching framework to TEACH"* and it follows the [customization guide](docs/agent-customization.md) to the exact files.
- **Guard-railed for safety.** CI runs a secret scan (gitleaks) plus conformance guards that keep the schema, the docs, and the agent skills honest — so an agent's changes can't silently break a clone or leak a credential.

Start at [`CLAUDE.md`](CLAUDE.md) → it points the way.

---

## Quick Start

```bash
# 1. Fork this repo on GitHub, then clone YOUR fork
git clone https://github.com/YOUR-ORG/rumi-platform.git
cd rumi-platform

# 2. Install dependencies
npm install && cd bot && npm install && cd ..

# 3. Configure environment — copy the template and fill the REQUIRED values
#    (8 required services: 7 ship as placeholders you must set; REDIS_URL defaults to a local instance.
#     `npm run doctor` lists exactly what's still missing.)
cp .env.template .env
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, REDIS_URL,
#    WHATSAPP_TOKEN, PHONE_NUMBER_ID, WABA_ID, WEBHOOK_VERIFY_TOKEN
#    (each optional feature's keys are documented inline, grouped by feature)

# 4. Check your configuration — pings every service you configured and prints
#    a green/red matrix of which features are live
npm run doctor

# 5. Set up the database (applies schema + RLS + seed to a fresh Supabase project)
npm run bootstrap:db

# 6. Deploy (Railway, Docker, or any Node host), point your WhatsApp webhook at
#    your deployment, then send "Hi" to your bot number.
```

The whole flow is designed to be driven by an **AI setup agent** — see [Built to be run by an AI agent](#-built-to-be-run-by-an-ai-agent) above, and **[SETUP.md](SETUP.md)** for the complete manual walkthrough (including getting a WhatsApp number from scratch).

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
├── bot/                    # WhatsApp bot (Node.js + Express)
│   ├── whatsapp-bot.js     # Entry point — webhook, message routing
│   ├── shared/
│   │   ├── config/         # Presence-based feature gating, branding, languages, regions
│   │   ├── services/       # LLM, coaching, reading, lesson plans, quiz, video, …
│   │   ├── handlers/       # text / voice / image / flow / exam / attendance
│   │   └── utils/          # Structured logging, correlation IDs, html-to-pdf
│   ├── workers/            # Async workers (coaching, video, lesson plans, quiz, exam, …)
│   └── scripts/setup/      # doctor, flow registration, encryption, state
├── dashboard/              # Observability portal — analytics, health
├── portal/                 # Teacher web portal (React)
├── infrastructure/
│   └── supabase/           # SQL schema, RLS policies, seed data + bootstrap script
├── docs/                   # Architecture, features, customization, cost, samples
└── .claude/                # Agent-native config — CLAUDE.md routers + 16 operational skills
```

### How a message flows

```
Teacher on WhatsApp
  → Meta Cloud API → POST /webhook → Express handler
    → user lookup (Supabase) → language detection → feature routing
      → text | voice | image | flow handler
        → LLM (OpenRouter) → response
        → async job queue (Redis or SQS) → background workers → reports / media
          → delivered back to the teacher on WhatsApp
```

A correlation id threads each request across the webhook, the queue, and the workers, so any flow can be traced end to end. See [docs/architecture.md](docs/architecture.md) for the full picture, and [LP_PATHS.md](docs/LP_PATHS.md) for the lesson-plan routing in particular.

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
| Queue | Redis or AWS SQS (pluggable via `QUEUE_DRIVER`) | Transcription, reports, video, exams |
| Speech-to-Text | Soniox, Whisper, Modal MMS-ASR | Multilingual transcription |
| Text-to-Speech | ElevenLabs (+ Uplift for Urdu/regional) | Voice replies, reflective questions |
| PDF | PDFKit / pdfmake / Playwright | Coaching & reading reports |
| Images / Video | Kie.ai (Nano Banana Pro), FFmpeg | Educational visuals & video |
| OCR | Mistral vision (+ Chandra, Surya) | Exam-sheet scanning |
| Pronunciation | Azure Speech (optional) | Reading-assessment scoring |
| Hosting | Railway / Docker / any Node host | Deployment |
| Observability | Console + correlation IDs; Axiom optional | Structured logs + tracing |

---

## Testing

```bash
npm test               # full suite (run via node tests/run.js)
npm run test:security  # secret scan — no hardcoded credentials
npm run test:schema    # database schema validation
npm run test:setup     # setup tooling
npm run doctor         # live preflight: which services + features are configured
npm run simulate       # CLI simulator (test without WhatsApp)
```

Every push and PR is gated by CI: an automated **secret scan** (gitleaks) plus conformance guards that verify the schema, the docs, the agent skills, and the link web all stay honest.

---

## Documentation

| Doc | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Full setup, incl. getting a WhatsApp number from scratch |
| [docs/features/](docs/features/) | Per-feature deep dives (what / how / enable) — one page each |
| [docs/LP_PATHS.md](docs/LP_PATHS.md) | How a lesson-plan request is routed (pre-generated vs Gamma vs photo) |
| [docs/architecture.md](docs/architecture.md) | System architecture & message flow |
| [CLAUDE.md](CLAUDE.md) + [.claude/](.claude/) | **Agent-native** context: the progressive-disclosure routers + the 16 operational skills |
| [docs/agent-customization.md](docs/agent-customization.md) | Agent-first deep customization (frameworks, languages, branding) |
| [docs/cost-guide.md](docs/cost-guide.md) | Monthly cost estimates — core baseline + per-feature add-ons |
| [docs/monitoring.md](docs/monitoring.md) | Observability & debugging |
| [docs/railway-operations.md](docs/railway-operations.md) | Running on Railway (scaling, logs, workers) |
| [docs/pulling-updates.md](docs/pulling-updates.md) | Keeping your fork in sync with upstream |
| [docs/samples/](docs/samples/) | Sample artifacts (e.g. a rendered coaching report) |
| [SECURITY.md](SECURITY.md) | Security policy & responsible disclosure |
| [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) | Development setup, code style, testing, PR guidelines |

---

## Contributing

Contributions are welcome. See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup, code style, testing, and PR guidelines.

---

## About

Rumi is built by [Taleemabad](https://taleemabad.com) and shared with the world as open source. The name comes from Jalaluddin Rumi, the 13th-century poet and teacher who believed that education is not the filling of a vessel but the kindling of a flame.

**Website**: [hellorumi.ai](https://hellorumi.ai) · **Research**: [hellorumi.ai/research](https://hellorumi.ai/research)

## License

Apache License 2.0 — see [LICENSE](LICENSE). You are free to use, modify, and distribute this software. We encourage contributing improvements back to the community.
