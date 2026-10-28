# messaging — Channel drivers (Meta, Baileys, Slack, Discord, Matrix) and their inbound adapters
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/messaging kg=3016c6314c03 gen=b9f82c875f33 overflow=79 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `index.js` — driver router behind whatsapp.service; picks driver by identifier prefix
- `meta-channel.service.js` — the production send surface; others mirror its method list
- `channel-registry.js` — which drivers exist and which are production-tier
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `inbound/` | Adapters turning each channel's events into webhook-shaped payloads → `inbound/CLAUDE.md` |
| `channel*` | 3 files; most used `channel-registry.js`: Static map of channel drivers and which are production-tier; read by feature-availability and setup scripts |
| … | 16 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `channel-registry.js` ← imported by `bot/scripts/setup/doctor.js:31:90458071` · `bot/scripts/setup/graduate.js:45:218140d6` (+20)
- `matrix-outbound-relay.js` ← imported by `bot/whatsapp-bot.js:1974:40b0ef8b` · `bot/workers/sqs-worker.js:40:a34259b4` (+5)
- … 23 more → `CLAUDE.index.md`

## Never (human)
- Only matrix-connection.js owns the Matrix sync client; workers go through the relay (bot/shared/services/messaging/matrix-connection.js:2, bot/shared/services/messaging/matrix-outbound-relay.js:2)
- New channel drivers must keep the Meta method list; a parity test covers it (tests/messaging/channel-driver-parity.test.js)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/messaging/channel-driver-parity.test.js` (baileys-channel.service.js, channel-registry.js, discord-channel.service.js, matrix-channel.service.js, meta-channel.service.js, none-channel.service.js, slack-channel.service.js)
- `tests/messaging/matrix-channel-service.test.js` (matrix-channel.service.js, matrix-outbound-relay.js, pending-options.js, text-flow.js)
- … 40 more → `CLAUDE.index.md`

## Related (generated)
- skills: `setup`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? (+15)
