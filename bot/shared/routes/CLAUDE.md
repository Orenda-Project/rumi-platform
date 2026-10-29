# routes — HTTP routes: encrypted WhatsApp Flow endpoints and Slack/Discord equivalents
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/routes kg=81976880dff0 gen=78b5e09f08f7 overflow=92 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `flow-endpoint.routes.js` — POST /api/flows/* router, mounted at whatsapp-bot.js:67
- `registration-endpoint.js` — typical {init, exchange} Flow endpoint to copy
- `slack-interactions.routes.js` — /api/slack events, interactions, commands
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `discord-views/` | Discord screen mappings for Flow-equivalent forms (25-option menu cap) → `discord-views/CLAUDE.md` |
| `slack-views/` | Slack Block Kit screen mappings for Flow-equivalent modals → `slack-views/CLAUDE.md` |
| `attendance-setup-endpoint.js` | Attendance setup Flow endpoint: class info, add-student loop and done, creating the class and student list |
| … | 19 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `settings-endpoint.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- column `users.preferred_language` (written by `settings-endpoint.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/coaching/coaching-session.service.js:141:cd922948` (+18)
- … 54 more → `CLAUDE.index.md`

## Never (human)
- Never return a `version` field in a Flow endpoint response (bot/shared/routes/observe-form-endpoint.js:9)
- Internal endpoints must always require INTERNAL_API_KEY; an unset key refuses all calls (bot/shared/routes/portal-internal-endpoint.js:26)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/routes/discord-flow-registry.test.js` (attendance-marking-endpoint.js, attendance-setup-endpoint.js, discord-flow-registry.js, exam-confirm-endpoint.js, reading-assessment-endpoint.js, registration-endpoint.js)
- `tests/routes/slack-flow-registry.test.js` (attendance-marking-endpoint.js, attendance-setup-endpoint.js, exam-confirm-endpoint.js, registration-endpoint.js, slack-flow-registry.js)
- … 23 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/CLAUDE.md`? · `docs/features/observe.md`? · `docs/features/video-quizzes.md`?
