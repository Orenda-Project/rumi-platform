# workers — Background workers: SQS job consumer, cron sweeps, per-job-type handlers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/workers kg=586531c8ccf0 gen=984ee360dff9 overflow=77 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `sqs-worker.js` — consumer; executeJob switch at line 300 routes every jobType
- `inbound-message.worker.js` — queued webhook envelopes to handlers
- `stale-session.worker.js` — 15-minute cron sweep
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `sqs-worker.js` | Main SQS consumer: routes jobs by jobType, runs stale-request recovery and health endpoint (node workers/sqs-worker.js) |
| `lesson-plan-generation.worker.js` | SQS lesson-plan generation job with retries and an apology message after permanent failure |
| `inbound-message.worker.js` | Dequeues queued inbound envelopes, dedups, then runs the text/voice/image/button/flow handler (gateway queue mode) |
| `stale-session.worker.js` | Railway Cron (15 min) sweep: nudges coaching sessions stuck in conversation and untapped observe invites |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `lesson-plan-extraction.worker.js` (+2)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+52)
- column `coaching_sessions.status` (written by `sqs-worker.js` (+1)) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` (+28)
- … 54 more → `CLAUDE.index.md`

## Never (human)
- Every new job type must be routed in the executeJob switch (bot/workers/sqs-worker.js:300); unrouted types are not run
- The Procfile must always run node workers/sqs-worker.js as the worker process (bot/Procfile:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/gateway/gateway-queue-integration.test.js` (inbound-message.worker.js, sqs-worker.js)
- `tests/nudges/teacher-nudges-worker-wiring.test.js` (sqs-worker.js, teacher-nudges.worker.js)
- … 26 more → `CLAUDE.index.md`

## Related (generated)
- skills: `coaching`? · `morning-brief`? · `video-generation`?
- docs: `CHANGELOG.md`? · `bot/CLAUDE.md`? · `docs/LP_PATHS.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/features/homework.md`? (+5)
- … 1 more → `CLAUDE.index.md`
