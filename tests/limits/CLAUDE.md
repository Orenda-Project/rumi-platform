# limits — Tests for public-deployment limits: rate limits, daily caps, model budget

<!-- kg:meta repo=rumi-platform dir=tests/limits kg=e6fac1af650d gen=6a8d67335bee overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `limits-units.test.js` — Redis counters, in-process fallbacks, env parsing
- `inbound-limits-wiring.test.js` — live wiring in handleWebhookPost
- `expensive-job-caps.test.js` — caps for unregistered accounts on lesson plans and coaching
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lesson-plan-availability.test.js` | Pins quiz next-topic and pic-to-LP lesson plans telling the teacher when GAMMA_API_KEY is absent, nothing queued |
| `inbound-limits-wiring.test.js` | Pins inbound rate limits, media bucket and model budget in handleWebhookPost across channels |
| `CLAUDE.md` | (unmapped) |
| `expensive-job-caps.test.js` | Pins daily caps for unregistered accounts on lesson plans and coaching starts, via the real handleTextMessage |
| `userid-gates.test.js` | Pins cap gates by account id on pic-to-LP and class quiz paths for unregistered accounts |
| `worker-budget.test.js` | Pins sqs-worker processJob sending one "busy" to the teacher when the model budget refuses a job, no apology |
| `limits-units.test.js` | Unit-tests limits/: Redis counters and in-process fallbacks for rate limit and caps, plus env parsing |
| `voice-lesson-plan-unavailable.test.js` | Pins handleVoiceMessage telling a voice-note lesson-plan request it is unavailable without GAMMA_API_KEY, nothing queued |

## Who reads this (generated)
- (none)

## Never (human)
- With Redis down, fall back to an in-process window, never fail open (tests/limits/limits-units.test.js)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/limits/CLAUDE.md`? (+8)
