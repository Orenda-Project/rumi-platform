# handlers — Inbound message routers: text, voice, image, Flow replies, /observe, /portal
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/handlers kg=e72e303860fb gen=6720d8640293 overflow=86 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `text-message.handler.js` — main text router, called at whatsapp-bot.js:523
- `voice-message.handler.js` — voice notes and coaching audio, whatsapp-bot.js:525
- `flow-response.handler.js` — Flow NFM_REPLY submissions by flow type
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 files: 0 test + 1 support) |
| `text-message.handler.js` | Main text router: slash commands, triggers, quiz and lesson-plan paths; called from whatsapp-bot.js:523 |
| `exam-checker.handler.js` | Routes exam-checker text commands, photos, buttons and Flow replies to the ExamCheckerOrchestrator |
| `observe-interactive.handler.js` | Single routing table for every observe button and list-reply id, shared by all channels |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `flow-response.handler.js` (+1)) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+55)
- table `coaching_sessions` (written by `image-message.handler.js` (+1)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/routes/observe-form-endpoint.js:126:5911672a`? (+52)
- column `coaching_sessions.status` (written by `text-message.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` (+27)
- … 46 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/review-guards.test.js` (image-message.handler.js, voice-message.handler.js)
- `tests/exam-checker/exam-cancel-name-pending.test.js` (exam-checker.handler.js, text-message.handler.js)
- … 40 more → `CLAUDE.index.md`

## Related (generated)
- skills: `reading-assessment`? · `registration`? · `whatsapp-flows`?
- docs: `bot/shared/CLAUDE.md`? · `docs/LP_PATHS.md`? · `docs/features/exam-checker.md`? · `docs/features/homework.md`? · `docs/features/pic-to-lp.md`? · `docs/features/quiz.md`? (+1)
