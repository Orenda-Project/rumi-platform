# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-07

**Rumi no longer requires a Meta WhatsApp Business account to run.** The messaging
channel is now pluggable: the default links your own WhatsApp by QR the way
WhatsApp Web does, so a clone goes from `git clone` to a working conversation in
about fifteen minutes with no Business account, no app review and no waiting.
When you're ready for a real deployment, `rumi graduate` moves you to an official
number and every teacher, conversation and past assessment carries over.

Alongside it, setup stopped being an eleven-step document and became two
commands.

### BREAKING (vs v1.2.0)

- **Node 20 is now the minimum** (was 18). The Baileys sandbox driver refuses to
  install on 18 — its own preinstall check reports "This package requires
  Node.js 20+ to run reliably" — so `npm ci` in `bot/` fails outright rather
  than degrading. Node 18 has also been end-of-life since April 2025. `engines`
  is set on both packages, `install.sh` checks for 20, and the CI matrix is now
  20 and 22.
- **`npm run setup` now launches the interactive setup wizard.** It previously
  ran the preflight (`doctor.js`). If you had it in a script or a deploy step,
  switch to **`npm run doctor`** (or `rumi doctor`) — same output, unchanged.
- **`.env` is read from the repo root, not the process working directory.**
  `bot/whatsapp-bot.js`, `bin/rumi.js` and `bot/scripts/setup/doctor.js` now
  resolve it relative to the repository. If you kept a `bot/.env`, move it to the
  repo root. Railway is unaffected — its Procfile already runs from the root.
  This fixed a real failure: `cd bot && npm start` loaded **zero** variables and
  aborted with "Missing REQUIRED env var(s)" on a fully configured deployment.
- **`REQUIRED_VARS` is now core-only** (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `REDIS_URL`); the channel's
  own variables come from `CHANNEL_REQUIRED_VARS[CHANNEL_DRIVER]`. **Existing Meta
  deployments need no change** — with `CHANNEL_DRIVER` unset and the four Meta
  variables present, the driver is inferred as `meta`.
- **`CHANNEL_STATE_DIR` (default `.channel-state`) resolves against the repo**,
  not the working directory. Only affects the new sandbox driver, but it is the
  reason a bot started from `bot/` registered a *second* WhatsApp device and
  re-synced endlessly until WhatsApp invalidated the first.

### Added

- **A two-layer CLI.** `./install.sh` does the mechanical bootstrap (tool check,
  dependencies, `.env`, puts `rumi` on your PATH) and offers to run the wizard;
  `rumi` does everything else: `setup`, `start`, `status`, `doctor`, `pair`,
  `graduate`.
- **`rumi setup` — a five-step guided wizard.** Asks in plain language rather
  than by variable name ("where should Rumi keep its memory", not
  `SUPABASE_URL`), checks every value against the real service as you type it
  using the same probes `rumi doctor` runs, writes each answer to `.env`
  immediately (so Ctrl+C costs nothing), and skips anything already working on a
  re-run. Creates the full database — 76 tables, RLS policies and seed data —
  inline.
- **Pluggable messaging channels** via `CHANNEL_DRIVER`. A registry
  (`bot/shared/services/messaging/channel-registry.js`) with an explicit
  production-tier allowlist; `whatsapp.service.js` is now a one-line facade over
  it, so all ~40 existing call sites are untouched. Adding a channel later is a
  new registry key plus a service file.
- **The Baileys sandbox driver** — QR pairing, text, reactions, typing
  indicators, images, audio, documents, video and stickers, plus an inbound
  adapter that normalizes a socket event into the same shape Meta's webhook
  produces, so the existing dispatch runs unchanged.
- **WhatsApp Flows, rendered as a conversation.** A Flow is only a renderer; the
  endpoint holds the logic. The new text-flow engine drives those *same*
  endpoints over chat, so `/settings`, `/video`, reading assessment and class
  setup work on a channel that has no Flows — with the field names pinned by
  tests against their real consumers.
- **`rumi graduate`** — collects the target channel's credentials, validates them
  against the live service *before* touching `.env`, retires (never deletes) the
  outgoing session, and prints the checklist for what only you can do in Meta's
  console.
- **`rumi status`** — is Rumi running, which WhatsApp number it answers as, and
  what's switched on. Reads the connection module's own lock rather than
  inventing a second source of truth.
- **Field-shape validation with specific corrections.** Catches Supabase's
  **anon** key pasted instead of `service_role` (both are `eyJ…` JWTs on the same
  page — the anon key cannot see past RLS, so the bot runs and finds no data), a
  phone *number* in Meta's `PHONE_NUMBER_ID`, another vendor's `sk-…` in
  `OPENROUTER_API_KEY`, the Supabase dashboard URL instead of the API URL, and
  Upstash's `https://` endpoint as `REDIS_URL`.
- **An optional-abilities step** that describes each extra by what a teacher
  would notice, defaults to skipping, and only stores a multi-key feature when
  every key is given.

### Fixed

Most of these were pre-existing and affected Meta deployments too. Each failed
inside a `try/catch` that made it look transient.

- **`redisService.setNX` and `setexWithCeiling` never existed.** No quiz could
  ever be delivered and every image message failed. Added, with a conformance
  guard.
- **`quiz_class_*` replies had no handler**, despite a comment claiming one.
- **Five services bypassed `llm-client.js`** and called `OPENAI_API_KEY`
  directly.
- **`quiz_sessions` was missing six columns** on any database created before
  them — `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so they
  only ever reached fresh installs. Added to the `ALTER … ADD COLUMN IF NOT
  EXISTS` reconcile block.
- **`rumi doctor` reported a green tick for an OpenRouter key with no credit** —
  the worst kind of preflight, since it sends you hunting for a bug in the bot.
  It now reports the remaining balance.
- **Feature-intro videos and reading-passage backgrounds produced relative URLs**
  when no public asset host was configured, so the bot offered "want to see how?
  🎥", the teacher accepted, and nothing arrived. Both are presence-gated now,
  and the offer is only made when there is something to send.
- **Reading assessments leaked artifacts** — every run left an `.ogg` of a
  child's voice and a report PDF on disk forever.
- **A failure message claimed "our team has been notified"** when nobody had
  been. Replaced with an honest one.
- **A failed voice note apologised three times.**
- Baileys sessions are protected by a single-instance lock, and a QR shown when
  credentials already exist is treated as terminal rather than looping forever
  (which is how this project kept tripping WhatsApp's device-linking rate limit).
- Two tests read the repo's real channel state; one renamed a live WhatsApp
  session. Both now use throwaway directories.

### Changed

- **README and SETUP.md** lead with the two-command path; the manual walkthrough
  remains as the production reference. Both now state that **you need a second
  phone number to test from** — Rumi answers *as* your number, so messaging it
  from the same account looks exactly like a broken bot.
- **The `/setup` skill** documents both front doors: the human wizard, and the
  agent-driven "set me up" flow. The agent path calls the wizard's own modules
  (validators, `.env` patcher, doctor probes, schema bootstrap) so the two cannot
  drift, and the skill is explicit that `rumi setup`, `rumi pair` and
  `rumi graduate` are interactive TTY programs an agent must not launch.
- `rumi doctor` is channel-aware: it skips the Meta probe cleanly on a sandbox
  channel and names the address when Redis does not answer.
- `.env.template` opens by pointing at `./install.sh && rumi setup`.
- **Test suite: 170 suites / 1997 tests**, up from 155/1724.

## [1.2.0] - 2026-07-29

### Added
- **Video Quizzes + the Taleemabad Content Library** — the biggest content drop
  the platform has shipped. A teacher pulls a curriculum video with `/video`
  and is offered its quiz 3 s later: 15 questions one at a time with per-answer
  feedback, picture options served as a tappable WhatsApp Flow
  (`RadioButtonsGroup`, `media-size: large`) with a numbered-grid fallback,
  phonics questions asked by voice note (labels quoted-replied to the clip they
  name), a forwardable `wa.me` class link (each child plays 1:1, is remembered
  between quizzes, and can invite a friend), and a next-morning designed PDF
  report that names what to reteach and the wrong answer the class agreed on.
  Ships with the openly-hosted library: **890 curriculum videos, 858 with a
  quiz, 10,929 QA-certified questions, 15,557 studio voice clips, 3,217
  hand-drawn illustrations** (Pakistani national curriculum, English + Urdu),
  all served from a public CDN bucket — one import script
  (`bot/scripts/setup/import-video-quiz-library.js`) and zero media hosting.
  Region-gated via `region_features.video_quizzes_enabled` (seeded ON for
  `pakistan`). New services under `bot/shared/services/quiz/video-quiz-*.js`,
  student-videos endpoint v2 (clean titles, duplicate-hiding), two new Flows
  (`video-quiz-flow.json`, `student-join-flow.json`) in the registrar, a
  boot-time Flow-ID validator, and schema: `quiz_share_codes`,
  `video_quiz_deliveries`, `v_video_quiz_popularity`, plus media/feedback/
  render-pattern columns on `quiz_questions` and identity columns on
  `quiz_sessions`/`students`.

### Fixed
- `quiz_sessions.status` CHECK now includes `in_progress` (the value the
  session service actually writes — previously every start UPDATE failed
  silently).

## [1.1.0] - 2026-04-03

**BREAKING (vs v1.0.0):** The three-tier feature system (Minimal / Recommended /
Full) is removed. Features are now **presence-gated**: a feature is ON iff its
required env var(s) are set. There is no `RUMI_TIER` env var; `feature-availability.js`
is the single source of truth. `npm run doctor` shows a per-feature ON/OFF matrix
based on the keys you've provided.

### Added
- **Multi-framework coaching system** — OECD, HOTS, TEACH, and FICO frameworks selectable per teacher
- **HOTS framework** — aligned to PESRP/PECTAA official spec (16 indicators, 48 marks, 6 areas)
- **FICO framework** — 5 domains, 21 indicators, 84-mark scale (photo-aware indicators for 3.2 and 4.4)
- **TEACH framework** — behavior observation framework with teacher-student interaction analysis
- **Framework registry + selector** — lazy-loaded framework modules, user preference persistence
- **Classroom photo analysis** — AI-powered visual evidence for photo-aware coaching indicators
- **Coaching cards** — personalized PNG action cards generated after coaching sessions
- **Prioritized action service** — surfaces single highest-leverage action from coaching analysis
- **LP-coaching linker** — connects lesson plan feedback into the coaching session context
- **Report transformers** — per-framework PDF report generation (OECD, HOTS, TEACH, FICO)
- **Coaching flow helpers** — centralized state management for multi-step coaching flows
- **Centralized scoring constants** — `getFrameworkMaxMarks()` and `getFrameworkDisplayName()` for all frameworks
- 25 new coaching test scenarios across framework registry, HOTS, FICO, OECD, TEACH, report transformers, and coaching card generation (753 total tests, up from 728)

### Fixed
- HOTS report: empty PDF when no lesson plan linked — now uses raw analysis as fallback
- HOTS evidence: was English-only; now infers subject/topic from transcript context
- HOTS framework selector: wrong DB column used when reading user preference
- Coaching photo flow: state mismatch, missing `photo_yes` button handler, 2-minute timeout

### Infrastructure
- Added `pino` and `canvas` mocks to OSS test suite so tests run without native dependencies
- `jest.config.js`: added `moduleNameMapper` entries for `pino` and `canvas`
- `scoring.constants.js`: removed unnecessary `require('dotenv').config()` for OSS compatibility

## [1.0.0] - 2026-01-28

### Added
- Initial open-source release of Rumi AI Teaching Assistant
- WhatsApp bot with AI chat (AMA), registration, coaching, reading assessment, and lesson plans
- Three-tier feature system (Minimal, Recommended, Full)
- OpenRouter as unified AI gateway (one key for 500+ LLM models)
- BullMQ-based async job queue (coaching analysis, transcription, video generation)
- Supabase database schema with 52+ tables, RLS policies, and seed data
- Observability Dashboard for monitoring bot usage and coaching sessions
- Teacher Portal for classroom management (Phase 2)
- `/setup` Claude Code skill for automated one-hour deployment
- Railway deployment configuration (Procfile for web + worker processes)
- CLI simulator for local testing without WhatsApp
- Comprehensive documentation (architecture, setup, cost guide, customization)
- Environment validation and connection testing scripts
- CI pipeline with Node.js 18/20/22 matrix testing
- Apache 2.0 license

### Security
- All credentials parameterized via environment variables
- No hardcoded API keys, tokens, phone numbers, or personal paths in source
- Row-Level Security (RLS) enforced on all user-facing database tables
- Comprehensive .gitignore covering secrets, build artifacts, and IDE files
