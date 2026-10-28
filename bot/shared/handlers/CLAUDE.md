# handlers — Inbound message routers: text, voice, image, Flow replies, /observe, /portal
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/handlers kg=9532e1dab27a gen=69cb8deb6d8e overflow=87 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `text-message.handler.js` — main text router, called at whatsapp-bot.js:523
- `voice-message.handler.js` — voice notes and coaching audio, whatsapp-bot.js:525
- `flow-response.handler.js` — Flow NFM_REPLY submissions by flow type
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 test files) |
| `CLAUDE.index.md` | (unmapped) |
| `text-message.handler.js` | Main text router: slash commands, triggers, quiz and lesson-plan paths; called from whatsapp-bot.js:523 |
| `exam-checker.handler.js` | Routes exam-checker text commands, photos, buttons and Flow replies to the ExamCheckerOrchestrator |
| `observe-interactive.handler.js` | Single routing table for every observe button and list-reply id, shared by all channels |
| `CLAUDE.md` | (unmapped) |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `flow-response.handler.js` (+1)) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+55)
- table `coaching_sessions` (written by `image-message.handler.js` (+1)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/routes/observe-form-endpoint.js:126:5911672a`? (+52)
- … 37 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/review-guards.test.js` (image-message.handler.js, voice-message.handler.js)
- `tests/exam-checker/exam-cancel-name-pending.test.js` (exam-checker.handler.js, text-message.handler.js)
- … 40 more → `CLAUDE.index.md`

## Related (generated)
- skills: `reading-assessment`? · `registration`? · `whatsapp-flows`?
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/tests/CLAUDE.md`? (+33)
