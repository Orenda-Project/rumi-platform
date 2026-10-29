# limits — Cost and abuse guards: inbound rate limit, daily caps by tier, model budget breaker

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/limits kg=c81800d36720 gen=bd417668c693 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `inbound-rate-limit.js` — per-sender limit applied in handleWebhookPost
- `daily-caps.js` — per-tier daily caps; an empty env var means no cap
- `model-budget.js` — trips on provider credit refusal, wraps llm-client
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `daily-caps.js` | Per-tier daily usage caps (registered vs unregistered, env-driven, empty means none) checked by handlers |
| `model-budget.js` | Circuit breaker for model credit/quota refusals; says busy once and alerts the operator; wraps llm-client calls |
| `inbound-rate-limit.js` | Per-sender messages-per-minute limit applied in handleWebhookPost before any model call; one polite notice |

## Who reads this (generated)
- `daily-caps.js` ← imported by `bot/shared/handlers/text-message.handler.js:2:b079cc59` · `bot/shared/handlers/voice-message.handler.js:4:b079cc59` (+6)
- `model-budget.js` ← imported by `bot/shared/services/llm-client.js:22:18c8469f` · `bot/shared/services/messaging/index.js:35:f5b131b5` (+2)
- `inbound-rate-limit.js` ← imported by `bot/whatsapp-bot.js:14:a185eda7`
- env read here: `MODEL_BUDGET_COOLDOWN_SECONDS` · `RATE_LIMIT_BYPASS_NUMBERS`

## Never (human)
- An empty cap env var must keep meaning no cap, so unconfigured deployments behave as before (bot/shared/services/limits/daily-caps.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/limits/limits-units.test.js` (daily-caps.js, inbound-rate-limit.js, model-budget.js)
- `tests/limits/worker-budget.test.js` (model-budget.js)

## Related (generated)
- docs: `bot/shared/services/CLAUDE.md`? · `docs/features/public-limits.md`?
