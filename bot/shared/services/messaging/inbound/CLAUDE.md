# inbound — Adapters turning each channel's events into webhook-shaped payloads
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/messaging/inbound kg=067c6f7593ff gen=fc661cb64668 overflow=7 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `baileys-socket.adapter.js` — the pattern the others mirror, feeding handleWebhookPost
- `matrix-events.adapter.js` — largest adapter: sync events, media, button-reply mapping
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `matrix-events.adapter.js` | Converts Matrix sync events, media and button replies into webhook-shaped payloads for handleWebhookPost |
| `slack-events.adapter.js` | Express handlers turning Slack events and block_actions into webhook-shaped payloads; mounted by the gateway |
| `CLAUDE.md` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |
| `baileys-socket.adapter.js` | Converts Baileys message events into Meta-webhook-shaped payloads for handleWebhookPost in whatsapp-bot |
| `discord-events.adapter.js` | Converts Discord Gateway events into Meta-webhook-shaped payloads dispatched into handleWebhookPost |

## Who reads this (generated)
- `matrix-events.adapter.js` ← imported by `bot/shared/services/messaging/matrix-channel.service.js:164:c64feb03` · `bot/whatsapp-bot.js:1975:a455635d` (+1)
- `slack-events.adapter.js` ← imported by `bot/gateway/adapters/slack.js:24:138e6f6a` · `bot/shared/routes/slack-interactions.routes.js:29:a2c45bb5`
- `baileys-socket.adapter.js` ← imported by `bot/whatsapp-bot.js:1937:ad25cb1c`
- `discord-events.adapter.js` ← imported by `bot/whatsapp-bot.js:1956:d0599a29`
- env read here: `MATRIX_WELCOME_ROOM_ALIAS`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/gateway/differential.test.js` (slack-events.adapter.js)
- `tests/messaging/baileys-socket-adapter.test.js` (baileys-socket.adapter.js)
- `tests/messaging/discord-events-adapter.test.js` (discord-events.adapter.js)
- … 7 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/messaging/CLAUDE.index.md`? · `bot/shared/services/messaging/CLAUDE.md`? · `bot/shared/services/messaging/inbound/CLAUDE.index.md`? · `bot/shared/services/messaging/inbound/CLAUDE.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/gateway/CLAUDE.md`? (+1)
