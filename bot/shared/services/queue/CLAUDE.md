# queue — Job queue drivers (SQS, BullMQ, in-memory) behind one interface
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/queue kg=30a4bc4806f5 gen=aa2530aa71ab overflow=27 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `index.js` — picks the driver from QUEUE_DRIVER (sqs default); every producer and worker requires this
- `sqs-queue.service.js` — AWS SQS driver: FIFO, dedup, DLQ, pull/ack, retry backoff
- `dedup-variant.js` — extra dedup identity for jobs that legitimately run more than once per session
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `index.js` | Selects the queue driver from QUEUE_DRIVER (sqs default, bullmq); every producer and worker requires this |
| `memory-queue.service.js` | In-memory implementation of the 16-method queue contract for tests and zero-dependency local runs |
| `sqs-queue.service.js` | AWS SQS driver: FIFO send, dedup, DLQ, long-poll pull/ack and retry backoff for coaching/LP/video jobs |
| … | 2 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `index.js` ← imported by `bot/gateway/server.js:76:b2b8ead3` · `bot/gateway/webhook.routes.js:30:b19ffdae` (+18)
- `bullmq-queue.service.js` ← imported by `bot/gateway/server.js:74:02852785` · `bot/shared/services/queue/index.js:17:6dd34b59`
- `dedup-variant.js` ← imported by `bot/shared/services/queue/bullmq-queue.service.js:30:3bdad588` · `bot/shared/services/queue/sqs-queue.service.js:24:3bdad588`
- … 15 more → `CLAUDE.index.md`

## Never (human)
- Every driver must expose the identical method surface so consumers stay driver-agnostic (bot/shared/services/queue/index.js:7)
- Multi-run jobs must stay distinct via dedupVariant or the later job is dropped as a duplicate (bot/shared/services/queue/dedup-variant.js:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/queue/queue-driver-index.test.js` (bullmq-queue.service.js, index.js, memory-queue.service.js, sqs-queue.service.js)
- `tests/queue/queue-driver-parity.test.js` (bullmq-queue.service.js, memory-queue.service.js, sqs-queue.service.js)
- … 22 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CLAUDE.md`? · `bot/README.md`? · `bot/shared/services/CLAUDE.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/onboarding/sandbox-production-design.md`?
