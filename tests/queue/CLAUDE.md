# queue — Tests for the queue drivers (SQS, BullMQ, memory) and job dedup

<!-- kg:meta repo=rumi-platform dir=tests/queue kg=37e99791cfaa gen=dca50b3fe378 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `queue-driver-parity.test.js` — all drivers expose the same method surface
- `queue-driver-index.test.js` — which driver is selected
- `coaching-job-dedup-phase.test.js` — dedup identity includes phase
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `queue-driver-index.test.js` | Pins queue/index driver selection: sqs by default, bullmq on request, unknown falls back to sqs |
| `queue-driver-parity.test.js` | Pins that SQS, BullMQ and memory queue singletons expose the same method surface producers and the worker loop use |
| `CLAUDE.md` | (unmapped) |
| `bullmq-queue.test.js` | Pins the BullMQ driver emulating SQS pull/ack on manual mode, with bullmq and ioredis virtually mocked |
| `coaching-job-dedup-phase.test.js` | Pins that coaching job dedup identity includes phase/nonce so observe preview and deliver jobs are not collapsed |
| `lesson-plan-generation-failure.test.js` | Pins lesson-plan-generation worker failure path: the teacher is always told |
| `sqs-cancel-by-group.test.js` | Regression: SQSQueueService.cancelByGroupId must exist and write the sqs:cancel Redis flag quiz-job-handler reads |
| `memory-queue.test.js` | Pins the in-memory queue driver against the SQS/BullMQ contract |

## Who reads this (generated)
- (none)

## Never (human)
- Any new queue method must be implemented by every driver (queue-driver-parity.test.js:2-4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `TEST_READY.md`? · `bot/shared/services/queue/CLAUDE.index.md`? · `bot/shared/services/queue/CLAUDE.md`? · `bot/workers/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? (+1)
