# Rumi Platform — Agent Guide (L0)

Open-source AI teaching companion on WhatsApp: 24/7 coaching, reading assessments, lesson plans, quizzes,
and PD — in the teacher's own language. This file is the **entry point for AI coding agents**. (Other tools:
see [AGENTS.md](AGENTS.md), which points here.)

## How to navigate

Read only as deep as the task needs: this file → the Map below → `<dir>/CLAUDE.md` door → the file (skills: `.claude/skills/`).
Set up: [SETUP.md](SETUP.md) · `npm run doctor`. Console: [docs/console.md](docs/console.md). Customize: [docs/agent-customization.md](docs/agent-customization.md).
Architecture, cost, monitoring: [docs/architecture.md](docs/architecture.md) · [docs/cost-guide.md](docs/cost-guide.md) · [docs/monitoring.md](docs/monitoring.md).

## Architecture facts that change how you write code

1. **Feature gating is presence-based.** A feature is ON iff its env keys are present —
   `bot/shared/config/feature-availability.js` (`FEATURES` maps feature → env key) is the single source of truth.
   No `RUMI_TIER`, no tiers. `RUMI_FEATURE_<ID>=off` (`feature-overrides.js`) can only turn a feature OFF.
2. **Queue and channel are pluggable** — `QUEUE_DRIVER` (`sqs` default, `bullmq` on Redis) and `CHANNEL_DRIVER`
   (`meta` = WhatsApp Cloud API, production; `baileys` = a linked device, for trying Rumi). Always require the
   index (`bot/shared/services/queue/`, `bot/shared/services/messaging/`), never a driver. Meta-only surfaces
   (Flows, templates, carousels) degrade to text via `messaging/text-flow-definitions.js`.
3. **All LLM calls go through** `bot/shared/services/llm-client.js` (OpenRouter).
4. **Region behaviour is config-driven** (`region_features` table, fail-open) — never hardcode a country,
   phone-number-id, or region name.
5. **No credentials in code.** Everything comes from `.env` (copy `.env.template`). The repo is public —
   no secrets, no internal phone numbers, no internal ticket refs in source or any CLAUDE.md (CI enforces all three).

## Working rules

- **TDD**: tests live at repo-root `tests/<domain>/` and require bot code via `../../bot/shared/...`; `npm test`.
  Root CI runs before `bot/ npm ci`, so mock bot-only deps virtually (see `tests/CLAUDE.md`).
- **Conformance guards** (`tests/setup/`): every `.from()` table / `.rpc()` / column exists in the schema, every
  schema table is referenced, entry files parse, no secrets or internal refs ship. Keep them green.
- **DB bootstrap**: `npm run bootstrap:db` applies schema → RLS → seed → every `V*.sql` migration (idempotent,
  recorded in `schema_versions`).

## Map (generated)
<!-- kg:map repo=rumi-platform gen=9ce21ef157d0 -->
| dir | what it is |
|---|---|
| `.claude/` | Claude Code config and agent skills for working on this open-source repo → `.claude/CLAUDE.md` |
| `.cursor/` | (no door; 1 files) |
| `.github/` | Repo community files and CI workflows (see workflows/ for what each gate checks) → `.github/CLAUDE.md` |
| `bin/` | (no door; 1 files) |
| `bot/` | The WhatsApp bot service: web entry point, workers, services, setup CLI and tests → `bot/CLAUDE.md` |
| `brief/` | Morning Brief: renders the daily/weekly programme-health panels and manifest → `brief/CLAUDE.md` |
| `curriculum/` | Textbook-to-lesson-plan pipeline (stages A-F): gates, briefs, graph, sample → `curriculum/CLAUDE.md` |
| `dashboard/` | Operator dashboard (Express + EJS) and teacher-portal API, one deployable → `dashboard/CLAUDE.md` |
| `docs/` | Public docs: architecture, customization, setup guides, feature pages, Flow JSON → `docs/CLAUDE.md` |
| `infrastructure/` | Install-time infra: DB schema and migrations, scripts, local stack, Railway → `infrastructure/CLAUDE.md` |
| `kg/` | (no door; 21 files) |
| `pinokio/` | One-click Pinokio launcher: install, setup, start, update scripts, GUI wizard → `pinokio/CLAUDE.md` |
| `portal/` | Open-source teacher portal: React/Vite SPA, also wrapped as an Android app → `portal/CLAUDE.md` |
| `scripts/` | Standalone sample-report renderers for docs images (no DB, no PII) → `scripts/CLAUDE.md` |
| `tests/` | Root Jest suite for bot, dashboard and portal; one folder per feature area → `tests/CLAUDE.md` |
| `tools/` | (no door; 3 files) |

Deeper: `python3 kg/kg.py find <words>` · `python3 kg/kg.py file <path>`
