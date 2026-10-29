# scripts — Operator and maintainer scripts: setup CLI, Meta registration, one-offs, demos
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/scripts kg=352dd3f79384 gen=29ad75ae4640 overflow=33 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `setup/` — the `rumi setup`, doctor, pair, graduate CLI code
- `validate-env.js` — quick check of required env vars
- `simulate.js` — run the bot locally without WhatsApp
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 5 sub-dirs, each with `CLAUDE.md` | `assets/` · `deployment/` · `docs/` · `setup/` · `templates/` |
| 5 sub-dirs without a door | `attendance/` (1) · `brief/` (1) · `onboarding/` (1) · `testing/` (2) · `testpaper/` (1) |
| `generate-observe-flow-json.js` | Generates docs/flows/observe-form-flow.json from the OBSERVE_FRAMEWORK pack (TEACH, hots, mewaka) |
| `observe-roster.js` | Partner CLI for /observe rosters: grant coaches, add schools and teachers, CSV import, portal invites |
| `exam-checker-dry-run.js` | Dev tool: grades one exam page with the exam-vision engine and prints results; stores and sends nothing |
| … | 22 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:17:61dfd735`? · `bot/shared/database/queries.js:13:61dfd735`? (+54)
- column `users.phone_number` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:19:6b9ae1f2` · `bot/shared/database/queries.js:106:fef21f32` (+33)
- column `users.name` (written by `observe-roster.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` (+14)
- … 42 more → `CLAUDE.index.md`

## Never (human)
- Scripts with a Supabase service-role client touch real data; run only against the intended project (bot/scripts/send-outage-broadcast.js:11-14, bot/scripts/requeue-lesson-plan.js:15-18)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/coaching-excel-export-excludes-observations.test.js` (generate-coaching-excel.js)
- `tests/observe/observe-form-flow-json.test.js` (generate-observe-flow-json.js)
- … 2 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/CLAUDE.md`? · `docs/features/README.md`? · `docs/features/observe.md`?
