# gateway — Channel-agnostic webhook ingress: WhatsApp and Slack adapters, queue mode
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/gateway kg=27a1358e5403 gen=528c1a17ec82 overflow=12 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `index.js` — exports setupGateway plus createWhatsAppRouter/createSlackRouter; whatsapp-bot.js mounts the routers directly
- `adapters/whatsapp.js` — Meta handshake, signature check, validation, dedup
- `webhook.routes.js` — queue mode: envelope then enqueue for inbound-message.worker
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `adapters/` | → (no door; 2 files) |
| `ingress-dispatcher.js` | Dispatches inbound envelopes to a registered handler (in-process now, queue publish later) |
| `envelope.js` | Defines the channel-agnostic inbound envelope and converts a WhatsApp request into it |
| `webhook.routes.js` | Queue-mode webhook routes: turns a verified WhatsApp POST into an envelope and enqueues it for inbound-message.worker |
| `server.js` | Standalone rumi-gateway microservice: /health plus WhatsApp webhook that enqueues envelopes (SQS/other queue driver) |
| … | 4 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `ingress-dispatcher.js` ← imported by `bot/gateway/server.js:33:9ee24ba1` · `bot/gateway/webhook.routes.js:19:9ee24ba1`
- `webhook.routes.js` ← imported by `bot/whatsapp-bot.js:45:0545e109` · `bot/gateway/server.js:32:6be687c9`
- `envelope.js` ← imported by `bot/gateway/webhook.routes.js:20:57e55739`
- `index.js` ← imported by `bot/whatsapp-bot.js:44:fe716357`
- … 1 more → `CLAUDE.index.md`

## Never (human)
- Slack must stay in-process: its modals need the live trigger_id (bot/gateway/webhook.routes.js:12-13)
- Always mount raw-body routers before express.json() so signatures verify on wire bytes (bot/whatsapp-bot.js:60)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/gateway/adversarial-stress.test.js` (envelope.js, ingress-dispatcher.js, server.js, webhook.routes.js)
- `tests/gateway/empirical-adversarial-challenger.test.js` (envelope.js, ingress-dispatcher.js, server.js, webhook.routes.js)
- … 7 more → `CLAUDE.index.md`

## Related (generated)
- docs: `TEST_READY.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/gateway/CLAUDE.index.md`? · `bot/gateway/CLAUDE.md`? · `docs/intent/webhook-gateway-modernization.md`? (+3)
