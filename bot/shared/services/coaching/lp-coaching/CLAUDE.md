# lp-coaching — Lesson-plan step of the coaching flow: picker, link, pasted text
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/lp-coaching kg=40ee8135d994 gen=1e9ee109e36e overflow=12 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `lp-step.service.js` — lands a session on awaiting_lesson_plan and sends the picker
- `lp-list-selection.handler.js` — handles lp_select, lp_upload and lp_none taps
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lp*` | 6 files; most used `lp-step.service.js`: Moves a coaching session to awaiting_lesson_plan and sends the picker; fidelity-gated list versus yes/no |
| `send-lp-prompt.js` | Sends the plan picker as a list or buttons, falling back to buttons if refused; returns true only if sent |

## Who reads this (generated)
- table `coaching_sessions` (written by `lp-coaching-linker.service.js` (+2)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+52)
- column `coaching_sessions.status` (written by `lp-step.service.js` (+1)) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` (+28)
- table `coaching_sessions` whole row (`*`) (written by `lp-coaching-linker.service.js` (+2)) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+14)
- column `coaching_sessions.conversation_state` (written by `lp-step.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` (+6)
- … 11 more → `CLAUDE.index.md`

## Never (human)
- Never move a session to awaiting_lesson_plan unless sendLpPrompt returned true (bot/shared/services/coaching/lp-coaching/send-lp-prompt.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/lp-step-flow.test.js` (lp-list-selection.handler.js, lp-selection-list.service.js, lp-step.service.js, lp-text-paste.service.js)
- `tests/coaching/coaching-flow-integration.test.js` (lp-coaching-linker.service.js, lp-framework-prompt.service.js, lp-selection-list.service.js)
- … 4 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`?
