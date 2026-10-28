# bot — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `.github/` | → (no door; 1 files) |
| `06_MMS_Inference_Service/` | Separate Python ASR microservice for Balochi, Sindhi and Pashto speech → `06_MMS_Inference_Service/CLAUDE.md` |
| `assets/` | → (no door; 1 files) |
| `console/` | Operator web console: setup, feature switches, pipeline and live activity → `console/CLAUDE.md` |
| `dashboard/` | Legacy Express admin dashboard (login, users, conversations) over Supabase → `dashboard/CLAUDE.md` |
| `database/` | Reference SQL for a bot database: an old base schema plus hand-run migrations → `database/CLAUDE.md` |
| `fonts/` | Bundled fonts loaded by file name by PDF, card and image renderers → `fonts/CLAUDE.md` |
| `gateway/` | Channel-agnostic webhook ingress: WhatsApp and Slack adapters, queue mode → `gateway/CLAUDE.md` |
| `marketing/` | → (no door; 1 files) |
| `scripts/` | Operator and maintainer scripts: setup CLI, Meta registration, one-offs, demos → `scripts/CLAUDE.md` |
| `shared/` | Shared bot code: handlers, routes, config, services, templates, utils → `shared/CLAUDE.md` |
| `test-assets/` | → (no door; 4 files) |
| `tests/` | Jest tests for bot handlers, services, menu, registration and video flows → `tests/CLAUDE.md` |
| `vendor/` | Vendored first-party libraries kept hermetic, currently the lp-v9 diagram engine → `vendor/CLAUDE.md` |
| `workers/` | Background workers: SQS job consumer, cron sweeps, per-job-type handlers → `workers/CLAUDE.md` |
| `.gitignore` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `Procfile` | Declares the web (whatsapp-bot.js), worker (sqs-worker.js) and dashboard processes for Procfile-based hosts |
| `README.md` | Describes the bot's quick start, folder architecture and the process split between webhook server and workers |
| `jest.config.js` | Jest config: node env, matches tests/**/*.test.js, excludes e2e, collects coverage from shared/ |
| `package.json` | Bot package manifest (rumi-bot): start scripts for web, worker, dashboard, simulator and the jest dependency set |
| `railway.json` | Railway deploy config for the bot web service: Nixpacks build, restart on failure, health check on / |
| `whatsapp-bot.js` | Web entry point: Express server mounting /webhook, /health and portal endpoints, routing inbound messages to handlers |

## Who reads this (all, generated)
- `package.json` ← imported by `bot/scripts/setup/telemetry-consent.js:109:0c026821` · `bot/shared/utils/version.js:8:66ff7182`
- `whatsapp-bot.js` ← imported by `bot/workers/inbound-message.worker.js:117:63c96f3a`
- column `coaching_sessions.conversation_state` (written by `whatsapp-bot.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` · `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` (+4: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.reminder_sent_at` (written by `whatsapp-bot.js`) ← read by `bot/workers/stale-session.worker.js:103:d1b8cac4`
- column `coaching_sessions.status` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:734:a69ef692` · `dashboard/routes/portal.routes.js:739:a69ef692` · `dashboard/services/coach-observations.service.js:135:8424f2a9` · `bot/scripts/generate-coaching-excel.js:41:48a3661d` (+25: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `reading_assessments.comprehension_answers` (written by `whatsapp-bot.js`) ← read by `bot/shared/services/redis-comprehension.service.js:85:64fad2d6`
- column `reading_assessments.comprehension_score` (written by `whatsapp-bot.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- table `coaching_sessions` whole row (`*`) (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:733:7a0c163a`? · `dashboard/routes/portal.routes.js:960:d2b02c3e`? · `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+11: `python3 kg/kg.py who-reads coaching_sessions`)
- table `reading_assessments` whole row (`*`) (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:749:7a0c163a`? · `dashboard/routes/portal.routes.js:1534:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:448:d2b02c3e`? · `bot/shared/services/feature-registration.service.js:236:7a0c163a`? (+2: `python3 kg/kg.py who-reads reading_assessments`)
- table `broadcast_logs` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:1741:d5d1db20`?
- table `broadcast_messages` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:1850:5e6ab800`?
- table `coaching_sessions` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:732:5911672a`? · `dashboard/index.js:1518:5911672a`? · `dashboard/routes/portal.routes.js:735:5911672a`? · `dashboard/services/coach-observations.service.js:134:5911672a`? (+49: `python3 kg/kg.py who-reads coaching_sessions`)
- table `reading_assessments` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:748:4337985e`? · `dashboard/routes/portal.routes.js:1458:4337985e`? · `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? (+10: `python3 kg/kg.py who-reads reading_assessments`)
- env `CONSOLE_BIND` read at `bot/whatsapp-bot.js:85:9c32309b`
- env `GATEWAY_QUEUE_MODE` read at `bot/whatsapp-bot.js:286:04305bc4`
- env `NODE_ENV` read at `bot/whatsapp-bot.js:1907:3d55fed5`
- env `PORT` read at `bot/whatsapp-bot.js:85:9c32309b`

## Tests (all, generated)
- `jest.config.js` ← `tests/jest.config.js`?
- `whatsapp-bot.js` ← `tests/characterization/differential-verification.test.js` · `tests/characterization/legacy-baseline.test.js` · `tests/gateway/characterization.test.js` · `tests/limits/inbound-limits-wiring.test.js` · `tests/quiz/lesson-quiz-router.test.js` · `tests/testpaper/live-wiring-webhook.test.js`

## Related (all, generated)
- skills: `coaching`? · `debugging`? · `digital-coach`? · `feature-tracer`? · `pinokio-launcher`? · `video-generation`? · `whatsapp-flows`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `README.md`? · `SECURITY.md`? · `SETUP.md`? · `TEST_READY.md`? · `bot/06_MMS_Inference_Service/CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/README.md`? · `bot/console/CLAUDE.index.md`? · `bot/console/CLAUDE.md`? · `bot/dashboard/CLAUDE.md`? · `bot/database/CLAUDE.index.md`? · `bot/database/CLAUDE.md`? · `bot/fonts/CLAUDE.md`? · `bot/gateway/CLAUDE.index.md`? · `bot/gateway/CLAUDE.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/messaging/CLAUDE.index.md`? · `bot/shared/services/messaging/CLAUDE.md`? · `bot/shared/services/queue/CLAUDE.index.md`? · `bot/shared/services/queue/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.md`? · `bot/tests/CLAUDE.md`? · `bot/vendor/CLAUDE.md`? · `bot/vendor/lp-v9/CLAUDE.md`? · `bot/vendor/lp-v9/README.md`? · `bot/workers/CLAUDE.index.md`? · `bot/workers/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/CLAUDE.md`? · `docs/architecture.md`? · `docs/architecture/gateway-modernization-roadmap.md`? · `docs/channels/matrix.md`? · `docs/console.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/CLAUDE.md`? · `docs/features/attendance.md`? · `docs/features/exam-checker.md`? · `docs/features/lesson-quiz.md`? · `docs/features/observe.md`? · `docs/features/public-limits.md`? · `docs/features/test-papers.md`? · `docs/flows/CLAUDE.index.md`? · `docs/flows/CLAUDE.md`? · `docs/intent/webhook-gateway-modernization.md`? · `docs/onboarding/CLAUDE.md`? · `docs/onboarding/sandbox-production-design.md`? · `pinokio/CLAUDE.index.md`? · `pinokio/CLAUDE.md`? · `pinokio/README.md`? · `pinokio/onboarding/CLAUDE.index.md`? · `pinokio/onboarding/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/characterization/CLAUDE.md`? · `tests/console/CLAUDE.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/gateway/CLAUDE.md`? · `tests/limits/CLAUDE.md`? · `tests/quiz/CLAUDE.index.md`? · `tests/quiz/CLAUDE.md`? · `tests/testpaper/CLAUDE.index.md`? · `tests/testpaper/CLAUDE.md`?
- service: `railway.json` · `web`

## Previous notes (human, unverified — moved here from the old CLAUDE.md)
**Parent:** [../CLAUDE.md](../CLAUDE.md) · Node/Express WhatsApp bot. Entry point: `whatsapp-bot.js`
(webhook + button/message routing).

## Layout

| Path | What's there |
|------|--------------|
| `whatsapp-bot.js` | Express webhook, interactive-button router, message dispatch |
| `shared/handlers/` | Message handlers (text, voice, image, flow-response, …) — 10 files |
| `shared/services/` | Domain services (45) — AI, coaching, reading, quiz, pic-to-LP, whatsapp, R2, … |
| `shared/services/queue/` | **Pluggable queue** — `index.js` selects driver by `QUEUE_DRIVER` (sqs\|bullmq) |
| `shared/services/messaging/` | **Pluggable channel** — `index.js` selects driver by `CHANNEL_DRIVER` (meta\|baileys); `inbound/` normalizes either into one shape; `text-flow*.js` renders Meta Flows as chat |
| `shared/routes/` | WhatsApp Flow endpoints (registration, attendance, settings, status, …) |
| `shared/config/` | `feature-availability.js` (presence gating), `branding.js`, `region-config.js` |
| `shared/utils/` | logger, structured-logger (correlation IDs), constants, phone-validation |
| `workers/` | Background job workers (9) — `sqs-worker.js` is the poll loop; one handler per job type |
| `scripts/` | CLI simulator, validators, and `scripts/setup/` — the `rumi` wizard, doctor, pairing, flow registration |
| `console/` | **Operator web console** — mounted at `/console` by `whatsapp-bot.js`, and runnable alone via `rumi console`. Self-contained; see [docs/console.md](../docs/console.md) |

## Things to know before editing

- **Queue:** never import a specific driver. Require `shared/services/queue` (the index); both drivers
  expose the same surface (`queueJob`/`receiveJobs`/`completeJob`/`extendJobTimeout`/`cancelByGroupId`/…).
  Adding a job type = add a `case` in `workers/sqs-worker.js`'s `executeJob` switch + a handler.
- **Feature gating:** check `feature-availability.js`, not env vars directly; a feature is on iff its keys exist.
- **Shared-service edits are high-blast-radius** — grep consumers, verify imports, run the suite. See the
  `cross-agent-safety` skill.
- **LLM:** all model calls go through `shared/services/llm-client.js`.
- **Console:** nothing under `console/` may require `shared/config/supabase`, `shared/utils/constants`,
  `shared/services/llm-client` or `shared/services/messaging` at module scope — the first exits the process
  at require time, the rest freeze env at load, and either breaks `rumi console` on the broken deployment it
  exists to repair. `tests/console/boot-independence.test.js` enforces it.
- **Flows:** a new Flow = `shared/routes/<x>-endpoint.js` + mount in `flow-endpoint.routes.js` + `<X>_FLOW_ID`
  in `shared/utils/constants.js` + `.env.template` + a `/command` trigger in `shared/handlers/text-message.handler.js`
  + sanitized JSON in `docs/flows/`. See the `whatsapp-flows` skill.

## Deep-dive skills

`.claude/skills/` — `coaching`, `reading-assessment`, `registration`, `whatsapp-flows`, `feature-tracer`
(trace a feature end-to-end), `debugging`, `cross-agent-safety`, `qa-testing`, `video-generation`,
`pre-merge-checklist`, `database-analysis`, `digital-coach` (full technical KB).
