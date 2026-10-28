# cache — Redis client shared by rate limits, dedup, sessions, locks and observe state

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/cache kg=db4688dc82a4 gen=6fcd221f1a69 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `railway-redis.service.js` — the one exported instance; check isAvailable() paths before assuming Redis is up
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `railway-redis.service.js` | Redis client for rate limiting, webhook dedup, session cache and distributed locks; handlers share one instance |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- `railway-redis.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:23:52aaec2d` · `bot/shared/handlers/text-message.handler.js:9:52aaec2d` (+50)
- env read here: `NODE_ENV` · `REDIS_URL`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/menu/issue-56-reading-assessment.test.js` (railway-redis.service.js)
- `bot/tests/menu/issue-57-lesson-plan-state.test.js` (railway-redis.service.js)
- `bot/tests/video/issue-58-ttl-logging.test.js` (railway-redis.service.js)
- `tests/messaging/text-flow-definitions.test.js` (railway-redis.service.js)
- `tests/observe/observe-state.test.js` (railway-redis.service.js)
- `tests/quiz/quiz-intent-router-confirmation.test.js` (railway-redis.service.js)
- `tests/quiz/quiz-menu.test.js` (railway-redis.service.js)
- `tests/quiz/transcript-quiz-language-ask-list.test.js` (railway-redis.service.js)
- `tests/quiz/video-quiz-join-guess-limit.test.js` (railway-redis.service.js)
- `tests/quiz/video-quiz-offer-share.test.js` (railway-redis.service.js)
- `tests/registration/registration-endpoint.test.js` (railway-redis.service.js)
- `tests/student-video-feedback.test.js` (railway-redis.service.js)

## Related (generated)
- skills: `cross-agent-safety`?
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/tests/video/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? (+6)
