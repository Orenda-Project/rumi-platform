# setup — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/scripts/setup -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 1 files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `baileys-pair.js` | `rumi pair` CLI: links or re-links the sandbox WhatsApp channel by QR code |
| `console-password.js` | `rumi console --set-password`: stores the console credential needed when it is exposed beyond loopback |
| `db-setup.js` | Database half of `rumi setup`: applies the schema through the hand-created exec_sql function |
| `discord-register-commands.js` | Registers Discord slash commands with one REST PUT (global or guild scope) |
| `doctor.js` | `npm run doctor`: preflight diagnostics, static env checks plus live connectivity checks per service |
| `env-file.js` | Patches individual keys in .env in place, preserving other lines; used by setup and graduate |
| `fields.js` | Human-facing labels, rationale and where-to-find-it text for every value the rumi CLI collects |
| `flow-configs.js` | Single source of truth for which WhatsApp Flows a deployment registers; read by registrar and validators |
| `graduate.js` | `rumi graduate`: moves a deployment from a sandbox channel to the production Meta driver |
| `import-video-quiz-library.js` | Imports the public video library (student_videos, quizzes, quiz_questions) into the database; idempotent upserts |
| `interactive-setup.js` | `rumi setup`: guided wizard from fresh clone to first WhatsApp conversation, collecting keys and patching .env |
| `link-whatsapp.js` | Pairs the sandbox WhatsApp channel by QR via the same baileys-connection module the running bot uses |
| `meta-api.js` | Graph API client wrapping flow and template registration calls, returning a success/data envelope |
| `prompt.js` | Input side of the rumi CLI: ask, secret, select, confirm; secrets are masked and never reach scrollback |
| `register-all-flows.js` | Registers every Flow listed in flow-configs.js with Meta; skips ones already registered |
| `register-all-templates.js` | Registers the video_style_selection and feature_menu_carousel_v3 templates; idempotent |
| `run-full-setup.js` | `npm run setup:flows` orchestrator: encryption, then all flows, then templates, idempotently |
| `setup-encryption.js` | Generates the Flow encryption RSA keypair, registers the public key with Meta, records it in the state file |
| `setup-state.js` | Reads and writes .setup-state.json tracking flow, template and encryption registration status |
| `status.js` | `rumi status`: shows whether Rumi is running and which WhatsApp account it answers as |
| `summary.js` | Renders the post-setup 'am I ready, what next' view from the same runDoctor() result as doctor |
| `telemetry-consent.js` | Asks the setup operator, with full disclosure, whether to share anonymous deployment telemetry |
| `ui.js` | Terminal presentation layer for the rumi CLI; every printed line in setup, graduate, pair, status goes through it |
| `validate-flows.js` | Pre-flight check that registered flows and templates exist and are PUBLISHED, via state file and Graph API |
| `validators.js` | Field-shape checks for setup inputs, catching wrongly pasted values (e.g. phone number vs phone number ID) |

## Who reads this (all, generated)
- `db-setup.js` ← imported by `bot/scripts/setup/doctor.js:155:d4fecce8`
- `doctor.js` ← imported by `bot/console/env-catalog.js:31:20906285` · `bot/console/features.js:21:20906285` · `bot/console/routes/api.js:113:a7bf3a46` · `bot/scripts/setup/graduate.js:105:bec54bc2` (+1: `python3 kg/kg.py who-reads doctor.js`)
- `env-file.js` ← imported by `bot/console/routes/api.js:15:49d2b5a3` · `bot/console/routes/pages.js:18:49d2b5a3` · `bot/console/runtime.js:24:4764eaed` · `bot/scripts/setup/graduate.js:43:0a702b01` (+2: `python3 kg/kg.py who-reads env-file.js`)
- `fields.js` ← imported by `bot/console/env-catalog.js:32:b2e28dd8` · `bot/console/features.js:22:75643a55` · `bot/scripts/setup/discord-register-commands.js:20:55a36a96` · `bot/scripts/setup/graduate.js:44:0377019c`
- `flow-configs.js` ← imported by `bot/scripts/setup/doctor.js:32:e92fd19a` · `bot/scripts/setup/register-all-flows.js:29:e92fd19a` · `bot/scripts/setup/setup-state.js:15:e7a2a00f` · `bot/scripts/setup/validate-flows.js:20:e7a2a00f`
- `link-whatsapp.js` ← imported by `bot/scripts/setup/baileys-pair.js:33:aff6c371`
- `meta-api.js` ← imported by `bot/scripts/setup/register-all-flows.js:20:178f6770` · `bot/scripts/setup/register-all-templates.js:21:178f6770` · `bot/scripts/setup/setup-encryption.js:18:178f6770` · `bot/scripts/setup/validate-flows.js:13:178f6770`
- `prompt.js` ← imported by `bot/scripts/setup/graduate.js:42:2a0abcc1` · `bot/scripts/setup/console-password.js:23:39ff7290`
- `register-all-flows.js` ← imported by `bot/scripts/setup/run-full-setup.js:40:1e563a97`
- `register-all-templates.js` ← imported by `bot/scripts/setup/run-full-setup.js:41:34c766d9`
- `setup-encryption.js` ← imported by `bot/scripts/setup/run-full-setup.js:39:c07ebf10`
- `setup-state.js` ← imported by `bot/scripts/setup/register-all-flows.js:21:1a71048c` · `bot/scripts/setup/register-all-templates.js:22:1a71048c` · `bot/scripts/setup/setup-encryption.js:19:1a71048c` · `bot/scripts/setup/validate-flows.js:12:1a71048c`
- `status.js` ← imported by `bot/console/routes/pages.js:68:e204a230`
- `summary.js` ← imported by `bot/scripts/setup/status.js:30:16c1d0bd`
- `ui.js` ← imported by `bot/console/server.js:53:478a3813` · `bot/scripts/setup/graduate.js:41:48393795` · `bot/scripts/setup/prompt.js:24:48393795` · `bot/scripts/setup/status.js:29:48393795` (+4: `python3 kg/kg.py who-reads ui.js`)
- `validate-flows.js` ← imported by `bot/scripts/setup/run-full-setup.js:42:f485f730`
- `validators.js` ← imported by `bot/console/routes/api.js:16:8a7e5c8d` · `bot/scripts/setup/fields.js:18:caaa0edc`
- column `student_videos.superseded_by` (written by `import-video-quiz-library.js`) ← read by `bot/shared/routes/student-videos-endpoint.js:49:0ec013e3`
- table `quiz_questions` (written by `import-video-quiz-library.js`) ← read by `bot/shared/services/quiz/quiz-intent-router.service.js:257:80e3fee7`? · `bot/shared/services/quiz/quiz-report.service.js:404:80e3fee7`? · `bot/shared/services/quiz/quiz-session.service.js:92:80e3fee7`? · `bot/shared/services/quiz/transcript-quiz-generate.service.js:2375:e61279c9`? (+3: `python3 kg/kg.py who-reads quiz_questions`)
- table `quizzes` (written by `import-video-quiz-library.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:224:2c6afb51`? · `bot/shared/services/quiz/providers/lp-generated.provider.js:84:59272ccd`? · `bot/shared/services/quiz/providers/topic.provider.js:122:91dcdd54`? · `bot/shared/services/quiz/quiz-delivery.service.js:35:2c6afb51`? (+17: `python3 kg/kg.py who-reads quizzes`)
- table `student_videos` (written by `import-video-quiz-library.js`) ← read by `bot/shared/routes/student-videos-endpoint.js:46:774bb5a8`? · `bot/shared/services/quiz/video-quiz.service.js:247:774bb5a8`? · `bot/shared/services/student-video-feedback.service.js:179:774bb5a8`?
- env `ASSETS_BASE_URL` read at `bot/scripts/setup/register-all-templates.js:298:ba3455dc`
- env `ASSET_BASE_URL` read at `bot/scripts/setup/register-all-templates.js:298:ba3455dc`
- env `COLORTERM` read at `bot/scripts/setup/ui.js:55:cfd6e204`
- env `CONTENT_LIBRARY_BASE` read at `bot/scripts/setup/import-video-quiz-library.js:35:e59066ad`
- env `DISCORD_APPLICATION_ID` read at `bot/scripts/setup/discord-register-commands.js:76:4b0e0292`
- env `DISCORD_BOT_TOKEN` read at `bot/scripts/setup/discord-register-commands.js:75:f2027b42`
- env `DISCORD_TEST_GUILD_ID` read at `bot/scripts/setup/discord-register-commands.js:77:f77dd2e6`
- env `FORCE_COLOR` read at `bot/scripts/setup/ui.js:50:65de9f1b`
- env `NO_COLOR` read at `bot/scripts/setup/ui.js:49:5f195a59`

## Tests (all, generated)
- `db-setup.js` ← `tests/setup/db-setup.test.js`
- `discord-register-commands.js` ← `tests/scripts/discord-register-commands.test.js`
- `doctor.js` ← `tests/coaching/fidelity/diarization-contract.test.js`
- `env-file.js` ← `tests/setup/env-file.test.js`
- `fields.js` ← `tests/scripts/discord-register-commands.test.js` · `tests/setup/fields.test.js`
- `flow-configs.js` ← `tests/observe/observe-form-flow-json.test.js` · `tests/quiz/quiz-flow-endpoint.test.js` · `tests/setup/flow-config-conformance.test.js` · `tests/setup/flow-key-consistency.test.js` · `tests/setup/setup-state.test.js`
- `graduate.js` ← `tests/setup/graduate.test.js`
- `interactive-setup.js` ← `tests/setup/interactive-setup.test.js`?
- `meta-api.js` ← `tests/setup/meta-api.test.js` · `tests/setup/register-all-flows.test.js` · `tests/setup/validate-flows.test.js`
- `prompt.js` ← `tests/setup/prompt.test.js`?
- `register-all-flows.js` ← `tests/setup/flow-configs-paths.test.js` · `tests/setup/register-all-flows.test.js`
- `register-all-templates.js` ← `tests/setup/register-all-templates.test.js`
- `setup-encryption.js` ← `tests/setup/setup-encryption.test.js`?
- `setup-state.js` ← `tests/setup/flow-key-consistency.test.js` · `tests/setup/register-all-flows.test.js` · `tests/setup/setup-state.test.js` · `tests/setup/validate-flows.test.js`
- `status.js` ← `tests/setup/status.test.js`
- `summary.js` ← `tests/setup/status.test.js`
- `telemetry-consent.js` ← `tests/telemetry/telemetry-consent.test.js`
- `ui.js` ← `tests/setup/ui.test.js`
- `validate-flows.js` ← `tests/setup/validate-flows.test.js`
- `validators.js` ← `tests/setup/fields.test.js`

## Related (all, generated)
- skills: `setup`?
- docs: `CHANGELOG.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.md`? · `bot/scripts/templates/CLAUDE.md`? · `bot/scripts/templates/README.md`? · `docs/CLAUDE.index.md`? · `docs/console.md`? · `docs/onboarding/CLAUDE.md`? · `docs/onboarding/sandbox-production-design.md`? · `pinokio/onboarding/CLAUDE.index.md`? · `pinokio/onboarding/CLAUDE.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/observe/CLAUDE.md`? · `tests/quiz/CLAUDE.index.md`? · `tests/quiz/CLAUDE.md`? · `tests/scripts/CLAUDE.md`? · `tests/setup/CLAUDE.index.md`? · `tests/telemetry/CLAUDE.md`?
