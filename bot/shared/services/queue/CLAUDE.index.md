# queue — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/queue -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `bullmq-queue.service.js` | BullMQ/Redis queue driver with the same method surface as the SQS driver (QUEUE_DRIVER=bullmq, needs only REDIS_URL) |
| `dedup-variant.js` | Computes the dedup suffix beyond session+jobType (report phase, debrief nonce) shared by SQS and BullMQ drivers |
| `index.js` | Selects the queue driver from QUEUE_DRIVER (sqs default, bullmq); every producer and worker requires this |
| `memory-queue.service.js` | In-memory implementation of the 16-method queue contract for tests and zero-dependency local runs |
| `sqs-queue.service.js` | AWS SQS driver: FIFO send, dedup, DLQ, long-poll pull/ack and retry backoff for coaching/LP/video jobs |

## Who reads this (all, generated)
- `bullmq-queue.service.js` ← imported by `bot/gateway/server.js:74:02852785` · `bot/shared/services/queue/index.js:17:6dd34b59`
- `dedup-variant.js` ← imported by `bot/shared/services/queue/bullmq-queue.service.js:30:3bdad588` · `bot/shared/services/queue/sqs-queue.service.js:24:3bdad588`
- `index.js` ← imported by `bot/gateway/server.js:76:b2b8ead3` · `bot/gateway/webhook.routes.js:30:b19ffdae` · `bot/shared/routes/homework-request-endpoint.js:21:12f2ae3c` · `bot/shared/services/coaching/coaching-job-queue.service.js:91:75453fe6` (+16: `python3 kg/kg.py who-reads index.js`)
- `memory-queue.service.js` ← imported by `bot/gateway/server.js:71:38173b54` · `bot/shared/services/queue/index.js:19:ea651b1d`
- `sqs-queue.service.js` ← imported by `bot/shared/services/queue/index.js:27:72d57016`
- env `AWS_ACCESS_KEY_ID` read at `bot/shared/services/queue/sqs-queue.service.js:31:b1d05116`
- env `AWS_REGION` read at `bot/shared/services/queue/sqs-queue.service.js:30:2c79605f`
- env `AWS_SECRET_ACCESS_KEY` read at `bot/shared/services/queue/sqs-queue.service.js:32:2d6a8510`
- env `BULLMQ_MAIN_QUEUE` read at `bot/shared/services/queue/bullmq-queue.service.js:35:9801981e`
- env `BULLMQ_QUIZ_QUEUE` read at `bot/shared/services/queue/bullmq-queue.service.js:37:3d390258`
- env `BULLMQ_VIDEO_QUEUE` read at `bot/shared/services/queue/bullmq-queue.service.js:36:e05f2f9c`
- env `NODE_ENV` read at `bot/shared/services/queue/sqs-queue.service.js:720:d8e24952`
- env `QUEUE_DRIVER` read at `bot/shared/services/queue/index.js:14:710952b9`
- env `REDIS_URL` read at `bot/shared/services/queue/bullmq-queue.service.js:46:d78719e9`
- env `SQS_DLQ_URL` read at `bot/shared/services/queue/sqs-queue.service.js:39:a5cf1989`
- env `SQS_QUEUE_URL` read at `bot/shared/services/queue/sqs-queue.service.js:36:5f8b2a33`
- env `SQS_QUIZ_QUEUE_URL` read at `bot/shared/services/queue/sqs-queue.service.js:38:db4f9149`
- env `SQS_VIDEO_QUEUE_URL` read at `bot/shared/services/queue/sqs-queue.service.js:37:b69a4676`

## Tests (all, generated)
- `bullmq-queue.service.js` ← `tests/queue/bullmq-queue.test.js` · `tests/queue/queue-driver-index.test.js` · `tests/queue/queue-driver-parity.test.js`
- `index.js` ← `tests/queue/queue-driver-index.test.js` · `tests/quiz/lesson-quiz-bullmq-poll.test.js` · `tests/quiz/lesson-quiz-fifo-delay.test.js` · `tests/quiz/quiz-lesson-providers.test.js` · `tests/quiz/quiz-menu.test.js` · `tests/quiz/transcript-quiz-handoff.test.js` (+3: `python3 kg/kg.py who-reads bot/shared/services/queue/index.js`)
- `memory-queue.service.js` ← `tests/gateway/adversarial-edge-cases.test.js` · `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js` · `tests/gateway/microservice-edge-reproduction.test.js` (+4: `python3 kg/kg.py who-reads bot/shared/services/queue/memory-queue.service.js`)
- `sqs-queue.service.js` ← `tests/queue/coaching-job-dedup-phase.test.js` · `tests/queue/queue-driver-index.test.js` · `tests/queue/queue-driver-parity.test.js` · `tests/queue/sqs-cancel-by-group.test.js` · `tests/quiz/sqs-queue-quiz.test.js` · `tests/quiz/transcript-quiz-generate.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/queue/sqs-queue.service.js`)

## Related (all, generated)
- docs: `CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/README.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/queue/CLAUDE.index.md`? · `bot/shared/services/queue/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/onboarding/sandbox-production-design.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/queue/CLAUDE.md`? · `tests/quiz/CLAUDE.index.md`?
