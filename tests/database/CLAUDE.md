# database — Tests for user lookup and creation across channels

<!-- kg:meta repo=rumi-platform dir=tests/database kg=6bda1c2976bc gen=cd3bf6ea01c7 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `get-or-create-user-by-channel.test.js` — channel identity to user, user_channels backfill
- `get-or-create-user-last-message.test.js` — last_message_at stamped on every inbound
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `get-or-create-user-by-channel.test.js` | Pins getOrCreateUserByChannel and getSendTargetsForUser: WhatsApp delegation, channel link lookup, new user creation |
| `CLAUDE.md` | (unmapped) |
| `get-or-create-user-last-message.test.js` | Pins getOrCreateUser stamping users.last_message_at on every inbound, never throwing into create path |

## Who reads this (generated)
- (none)

## Never (human)
- Stamping last_message_at must not throw into the create path (tests/database/get-or-create-user-last-message.test.js:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.md`? · `bot/shared/services/messaging/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? (+1)
