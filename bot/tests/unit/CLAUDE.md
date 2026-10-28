# unit — Unit tests for lesson-plan storage and worker idempotency and logging utilities

<!-- kg:meta repo=rumi-platform dir=bot/tests/unit kg=868bb2abb817 gen=0eeb2f964877 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `lesson-plan-worker.test.js` — duplicate-delivery guard
- `structured-logger.test.js` — correlated logging
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lesson-plan-worker.test.js` | Pins LessonPlanGenerationWorker idempotency so a lesson plan is delivered only once |
| `logger.test.js` | Tests logToFile attaching the correlation id from structured-logger |
| `CLAUDE.md` | (unmapped) |
| `tracing.test.js` | Tests withSpan in utils/tracing recording span duration and logging through structured-logger |
| `bot-helpers-lesson-plan.test.js` | Pins storeLessonPlan so an existing lesson-plan record is reused instead of duplicated |
| `structured-logger.test.js` | Tests logEvent and runWithCorrelation in structured-logger emitting correlated structured logs |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/database/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.md`? · `bot/tests/CLAUDE.md`? (+2)
