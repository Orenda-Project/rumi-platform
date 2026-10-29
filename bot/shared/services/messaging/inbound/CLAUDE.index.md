# inbound — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/messaging/inbound -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `baileys-socket.adapter.js` | Converts Baileys message events into Meta-webhook-shaped payloads for handleWebhookPost in whatsapp-bot |
| `discord-events.adapter.js` | Converts Discord Gateway events into Meta-webhook-shaped payloads dispatched into handleWebhookPost |
| `matrix-events.adapter.js` | Converts Matrix sync events, media and button replies into webhook-shaped payloads for handleWebhookPost |
| `slack-events.adapter.js` | Express handlers turning Slack events and block_actions into webhook-shaped payloads; mounted by the gateway |

## Who reads this (all, generated)
- `baileys-socket.adapter.js` ← imported by `bot/whatsapp-bot.js:1937:ad25cb1c`
- `discord-events.adapter.js` ← imported by `bot/whatsapp-bot.js:1956:d0599a29`
- `matrix-events.adapter.js` ← imported by `bot/shared/services/messaging/matrix-channel.service.js:164:c64feb03` · `bot/whatsapp-bot.js:1975:a455635d` · `bot/scripts/matrix-smoke.js:41:77f80764`
- `slack-events.adapter.js` ← imported by `bot/gateway/adapters/slack.js:24:138e6f6a` · `bot/shared/routes/slack-interactions.routes.js:29:a2c45bb5`
- env `MATRIX_WELCOME_ROOM_ALIAS` read at `bot/shared/services/messaging/inbound/matrix-events.adapter.js:1176:b5c282f8`

## Tests (all, generated)
- `baileys-socket.adapter.js` ← `tests/messaging/baileys-socket-adapter.test.js`
- `discord-events.adapter.js` ← `tests/messaging/discord-events-adapter.test.js`
- `matrix-events.adapter.js` ← `tests/messaging/matrix-account-data-serialization.test.js` · `tests/messaging/matrix-allowed-servers.test.js` · `tests/messaging/matrix-events-adapter.test.js` · `tests/messaging/matrix-group-reply-room.test.js` · `tests/messaging/matrix-reply-room.test.js` · `tests/messaging/matrix-typing.test.js`
- `slack-events.adapter.js` ← `tests/gateway/differential.test.js` · `tests/messaging/slack-events-adapter.test.js`

## Related (all, generated)
- docs: `bot/shared/services/messaging/CLAUDE.md`?
