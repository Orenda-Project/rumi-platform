# gateway — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/gateway -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `adapters/` | → (no door; 2 files) |
| `dashboard.html` | Static page documenting the gateway architecture and its verification results (design artefact, not served) |
| `envelope.js` | Defines the channel-agnostic inbound envelope and converts a WhatsApp request into it |
| `index.js` | Gateway hub: composes the WhatsApp and Slack routers; setupGateway(app) mounts /webhook and /api/slack |
| `ingress-dispatcher.js` | Dispatches inbound envelopes to a registered handler (in-process now, queue publish later) |
| `server.js` | Standalone rumi-gateway microservice: /health plus WhatsApp webhook that enqueues envelopes (SQS/other queue driver) |
| `webhook.routes.js` | Queue-mode webhook routes: turns a verified WhatsApp POST into an envelope and enqueues it for inbound-message.worker |

## Who reads this (all, generated)
- `envelope.js` ← imported by `bot/gateway/webhook.routes.js:20:57e55739`
- `index.js` ← imported by `bot/whatsapp-bot.js:44:fe716357`
- `ingress-dispatcher.js` ← imported by `bot/gateway/server.js:33:9ee24ba1` · `bot/gateway/webhook.routes.js:19:9ee24ba1`
- `webhook.routes.js` ← imported by `bot/whatsapp-bot.js:45:0545e109` · `bot/gateway/server.js:32:6be687c9`
- env `APP_SECRET` read at `bot/gateway/index.js:144:be48d63f`
- env `GATEWAY_CORS_ORIGIN` read at `bot/gateway/server.js:28:17c840e6`
- env `GATEWAY_PORT` read at `bot/gateway/server.js:26:c0a1238e`
- env `PORT` read at `bot/gateway/server.js:26:c0a1238e`
- env `QUEUE_DRIVER` read at `bot/gateway/server.js:69:710952b9`
- env `SLACK_SIGNING_SECRET` read at `bot/gateway/index.js:137:7182018c`
- env `WEBHOOK_VERIFY_TOKEN` read at `bot/gateway/index.js:143:5549bcf7`
- env `WHATSAPP_APP_SECRET` read at `bot/gateway/index.js:144:be48d63f`

## Tests (all, generated)
- `envelope.js` ← `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js` · `tests/gateway/microservice-edge-reproduction.test.js` · `tests/gateway/webhook-gateway.test.js`
- `index.js` ← `tests/gateway/differential.test.js`
- `ingress-dispatcher.js` ← `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js` · `tests/gateway/standalone-server.test.js` · `tests/gateway/webhook-gateway.test.js`
- `server.js` ← `tests/characterization/differential-verification.test.js` · `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js` · `tests/gateway/microservice-edge-reproduction.test.js`
- `webhook.routes.js` ← `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js` · `tests/gateway/webhook-gateway.test.js`

## Related (all, generated)
- docs: `TEST_READY.md`? · `bot/CLAUDE.md`? · `docs/intent/webhook-gateway-modernization.md`?
