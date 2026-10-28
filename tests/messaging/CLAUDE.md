# messaging — Tests for channel drivers and adapters: Baileys, Matrix, Slack, Discord, text flows
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/messaging kg=d55f4b35e010 gen=5c594270ea85 overflow=6 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `channel-driver-parity.test.js` — every driver exposes the same method surface
- `channel-registry.test.js` — WhatsApp-family vs additive channels
- `matrix-outbound-relay-security.test.js` — what the relay owner must refuse
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `text*` | 3 files; most used `text-flow-definitions.test.js`: Pins the five sandbox text flows, incl. reading-assessment synthesising a routable nfm_reply for flow-response.handler |
| `channel*` | 8 files; most used `channel-driver-parity.test.js`: Pins every channel driver exposing the same method surface so WhatsAppService calls never hit "not a function" |
| `matrix*` | 14 files; most used `matrix-channel-service.test.js`: Pins matrix-channel.service identity stripping, DM room caching and outbound sends, with matrix-connection mocked |
| `CLAUDE.index.md` | (unmapped) |
| `baileys*` | 3 files; most used `baileys-socket-adapter.test.js`: Pins baileys-socket.adapter mapping a WAMessage to the Meta webhook shape, JID parsing and numeric-reply selection |
| `CLAUDE.md` | (unmapped) |
| `bare-command-routing.test.js` | Pins every command-words.js command working as a bare word, reaching the same handler as the slash form |
| … | 6 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `REDIS_URL` · `TRANSCRIPT_QUIZ_ENABLED`

## Never (human)
- Never fall back to plaintext when an encrypted-room lookup fails (tests/messaging/matrix-encrypted-send-guard.test.js:2)
- The relay owner never reads a local path a request names (tests/messaging/matrix-outbound-relay-security.test.js:5)
- A group room must never become someone's DM room (tests/messaging/matrix-group-reply-room.test.js:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/messaging/CLAUDE.index.md`? · `bot/shared/services/messaging/CLAUDE.md`? (+9)
