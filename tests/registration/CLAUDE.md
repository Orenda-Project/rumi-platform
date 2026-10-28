# registration — Tests for teacher registration and name capture, incl. the Matrix offer

<!-- kg:meta repo=rumi-platform dir=tests/registration kg=64987631b592 gen=174a895968ea overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `matrix-registration-offer.test.js` — registration through the real text handler
- `name-capture.test.js` — what counts as a name
- `registration-endpoint.test.js` — Flow endpoint screen routing
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `registration-endpoint.test.js` | Pins registration-endpoint Flow handler: screen routing, BACK navigation, Redis persistence |
| `name-capture.test.js` | Pins name capture: a bare greeting or acknowledgement is not a name; a leading greeting is stripped |
| `CLAUDE.md` | (unmapped) |
| `flow-type-detector.test.js` | Pins flow-type-detector: routes nfm_reply payloads to the right Flow handler in whatsapp-bot |
| `matrix-registration-offer.test.js` | Drives real handleTextMessage for Matrix registration: name offer shown unasked, answer flow and decline |
| `offer-keep-chatting.test.js` | Release-review repro: one-word replies while the Matrix registration offer is open keep chatting instead of registering |
| `name-greeting.test.js` | Pins greeting filter keeping real given names that double as greeting words from being rejected |
| `name-pending-loop.test.js` | Pins the name-pending loop in text-message.handler: a greeting-word name gets one clarifying question, then is accepted |
| `name-reply-shape.test.js` | Pins looksLikeNameReply/isDeclineReply: a question sent in reply to the name prompt is answered, not stored as a name |
| `registration-flow-gate.test.js` | Pins sendNameQuestion: opens the registration Flow if REGISTRATION_FLOW_ID is set, else asks in chat |

## Who reads this (generated)
- env read here: `CHANNEL_DRIVER` · `REGISTRATION_FLOW_ID`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/registration/CLAUDE.md`?
