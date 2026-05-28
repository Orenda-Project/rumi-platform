# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
