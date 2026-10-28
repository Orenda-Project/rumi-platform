# gateway — Tests for the webhook ingestion gateway: unit, stress, differential and standalone
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/gateway kg=01adfc0fba49 gen=f9c16a0efad8 overflow=2 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `webhook-gateway.test.js` — envelope factory, dispatcher, adapters, router unit tests
- `gateway-queue-integration.test.js` — ack under 100ms, enqueue, worker dispatch
- `standalone-server.test.js` — rumi-gateway boots alone on its own port
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `gateway-queue-integration.test.js` | Pins gateway ack under 100ms, envelope normalization, MemoryQueue enqueue and InboundMessageWorker dispatch |
| `empirical-adversarial-challenger.test.js` | Challenger suite for the gateway: concurrency bursts, sustained waves, dedup flood and fault injection |
| `iteration2-empirical-adversarial-verification.test.js` | Verifies gateway fixes: queue errors give HTTP 500 QUEUE_ERROR, Slack via InboundMessageWorker, dedup under bursts |
| `adversarial-stress.test.js` | Stress suite for the gateway: 100-request bursts under 100ms, duplicate floods, worker races, queue faults |
| `differential.test.js` | Differential runner proving legacy ingress and the modular bot/gateway pipeline give identical responses |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `microservice-edge-reproduction.test.js` | Reproduces gateway edge bugs: null metadata in envelope factory, null button_reply, Slack modal without Supabase |
| `webhook-gateway.test.js` | Unit-tests the canonical InboundMessageEnvelope, ingress dispatcher, WhatsApp/Slack adapters and gateway router |
| `standalone-server.test.js` | Pins the standalone rumi-gateway server: port env precedence, health probes, CORS, Meta and Slack wire compat |
| … | 2 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `HOME` · `PATH` · `WEBHOOK_VERIFY_TOKEN`

## Never (human)
- The standalone gateway must boot with no Supabase, AWS or Redis credentials (tests/gateway/adversarial-edge-cases.test.js)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `TEST_READY.md`? · `bot/CLAUDE.index.md`? · `bot/gateway/CLAUDE.index.md`? · `bot/gateway/CLAUDE.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? (+12)
