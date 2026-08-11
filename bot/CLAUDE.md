# bot/ — WhatsApp Bot codebase (L1)

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

## Things to know before editing

- **Queue:** never import a specific driver. Require `shared/services/queue` (the index); both drivers
  expose the same surface (`queueJob`/`receiveJobs`/`completeJob`/`extendJobTimeout`/`cancelByGroupId`/…).
  Adding a job type = add a `case` in `workers/sqs-worker.js`'s `executeJob` switch + a handler.
- **Feature gating:** check `feature-availability.js`, not env vars directly; a feature is on iff its keys exist.
- **Shared-service edits are high-blast-radius** — grep consumers, verify imports, run the suite. See the
  `cross-agent-safety` skill.
- **LLM:** all model calls go through `shared/services/llm-client.js`.
- **Flows:** a new Flow = `shared/routes/<x>-endpoint.js` + mount in `flow-endpoint.routes.js` + `<X>_FLOW_ID`
  in `shared/utils/constants.js` + `.env.template` + a `/command` trigger in `shared/handlers/text-message.handler.js`
  + sanitized JSON in `docs/flows/`. See the `whatsapp-flows` skill.

## Deep-dive skills

`.claude/skills/` — `coaching`, `reading-assessment`, `registration`, `whatsapp-flows`, `feature-tracer`
(trace a feature end-to-end), `debugging`, `cross-agent-safety`, `qa-testing`, `video-generation`,
`pre-merge-checklist`, `database-analysis`, `digital-coach` (full technical KB).
