# database — Supabase helpers, dashboard analytics queries and base schema
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/database kg=c398a28efff5 gen=66e610811357 overflow=49 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `bot-helpers.js` — users, channel identities, send targets and sessions
- `schema.sql` — base tables
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 files: 0 test + 1 support) |
| `bot-helpers.js` | Supabase helpers for users, per-channel identities, send targets and chat sessions used by every inbound handler |
| `queries.js` | Analytics queries for the admin dashboard: user, message, voice-note and active-user counts and conversation lists |
| `schema.sql` | Base Supabase schema (users, conversations, audio_sessions, lesson_plans, teacher_progress, teacher_facts, videos) |

## Who reads this (generated)
- table `users` (written by `bot-helpers.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- column `users.id` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+51)
- column `users.phone_number` (written by `bot-helpers.js` (+1)) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+34)
- table `lesson_plans` (written by `bot-helpers.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:158:611f2601`? · `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9`? (+19)
- column `lesson_plans.id` (written by `schema.sql`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9` (+15)
- … 42 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/unit/bot-helpers-lesson-plan.test.js` (bot-helpers.js)
- `tests/coaching/fidelity/lp-generation-stores-plan-text.test.js` (bot-helpers.js)
- … 7 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/CLAUDE.md`?
