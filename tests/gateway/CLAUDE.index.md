# gateway — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/gateway -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `adversarial-edge-cases.test.js` | Adversarial gateway suite: subprocess boot on a stripped env, port precedence, module isolation, CORS probing |
| `adversarial-stress.test.js` | Stress suite for the gateway: 100-request bursts under 100ms, duplicate floods, worker races, queue faults |
| `characterization.test.js` | Behaviour-freeze baseline of the legacy webhook in whatsapp-bot.js before gateway extraction (GET handshake, POST) |
| `differential.test.js` | Differential runner proving legacy ingress and the modular bot/gateway pipeline give identical responses |
| `empirical-adversarial-challenger.test.js` | Challenger suite for the gateway: concurrency bursts, sustained waves, dedup flood and fault injection |
| `gateway-queue-integration.test.js` | Pins gateway ack under 100ms, envelope normalization, MemoryQueue enqueue and InboundMessageWorker dispatch |
| `iteration2-empirical-adversarial-verification.test.js` | Verifies gateway fixes: queue errors give HTTP 500 QUEUE_ERROR, Slack via InboundMessageWorker, dedup under bursts |
| `microservice-edge-reproduction.test.js` | Reproduces gateway edge bugs: null metadata in envelope factory, null button_reply, Slack modal without Supabase |
| `standalone-server.test.js` | Pins the standalone rumi-gateway server: port env precedence, health probes, CORS, Meta and Slack wire compat |
| `webhook-gateway.test.js` | Unit-tests the canonical InboundMessageEnvelope, ingress dispatcher, WhatsApp/Slack adapters and gateway router |

## Who reads this (all, generated)
- env `HOME` read at `tests/gateway/adversarial-edge-cases.test.js:106:1de47616`
- env `PATH` read at `tests/gateway/adversarial-edge-cases.test.js:105:633bbb77`
- env `WEBHOOK_VERIFY_TOKEN` read at `tests/gateway/differential.test.js:246:c46c81ca` · `tests/gateway/webhook-gateway.test.js:124:b0353cc3`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `TEST_READY.md`? · `bot/CLAUDE.index.md`? · `bot/gateway/CLAUDE.index.md`? · `bot/gateway/CLAUDE.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/messaging/inbound/CLAUDE.index.md`? · `bot/shared/services/messaging/inbound/CLAUDE.md`? · `bot/shared/services/queue/CLAUDE.index.md`? · `bot/shared/services/queue/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `bot/workers/CLAUDE.md`? · `docs/architecture/gateway-modernization-roadmap.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/gateway/CLAUDE.md`?
