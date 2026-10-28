# scripts — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/scripts -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | One-off scripts for Flow JSON and reading-passage background assets → `assets/CLAUDE.md` |
| `attendance/` | → (no door; 1 files) |
| `brief/` | → (no door; 1 files) |
| `deployment/` | Reference scripts for registering and branding a WhatsApp number; ids are WABA-specific → `deployment/CLAUDE.md` |
| `docs/` | Setup guides for the optional AWS SQS queue and Railway Redis → `docs/CLAUDE.md` |
| `onboarding/` | → (no door; 1 files) |
| `setup/` | Code behind the rumi CLI: setup wizard, doctor, pair, graduate, Meta registration → `setup/CLAUDE.md` |
| `templates/` | Reference scripts and JSON for the /menu carousel templates on the original WABA → `templates/CLAUDE.md` |
| `testing/` | → (no door; 2 files) |
| `testpaper/` | → (no door; 1 files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `check-balochi-history.js` | One-off Axiom APL query script for Balochi language-detection history; not wired to anything |
| `debug-balochi.js` | One-off Axiom APL query script for debugging Balochi voice transcription; not wired to anything |
| `exam-checker-annotate-demo.js` | Demo script: runs OCR, grading and annotation on a sample and writes an annotated image to scripts/output |
| `exam-checker-dry-run.js` | Dev tool: grades one exam page with the exam-vision engine and prints results; stores and sends nothing |
| `fidelity-calibration.js` | Runs the real lesson-plan fidelity extractor and grader on tests/fixtures/fidelity and checks score ranges |
| `generate-coaching-excel.js` | One-off report: reads coaching_sessions and users from Supabase and writes an Excel sheet grouped by teacher |
| `generate-observe-flow-json.js` | Generates docs/flows/observe-form-flow.json from the OBSERVE_FRAMEWORK pack (TEACH, hots, mewaka) |
| `matrix-smoke.js` | Live Matrix channel smoke test (not Jest): sends a message, waits for a reply, prints the adapter's payload |
| `observe-roster.js` | Partner CLI for /observe rosters: grant coaches, add schools and teachers, CSV import, portal invites |
| `register-attendance-flows.js` | One-off: creates, uploads and publishes the attendance WhatsApp Flows in Meta Business Manager |
| `requeue-lesson-plan.js` | Ops tool: re-queues a pending lesson_plan_requests row to SQS by request id; writes to the queue |
| `send-outage-broadcast.js` | One-off: messages users active on a hardcoded 2025-12-11 date about an outage; sends real WhatsApp messages |
| `setup-flow-encryption.js` | Legacy CLI: generates an RSA-2048 keypair, registers the public key with Meta, prints the private key |
| `simulate.js` | CLI simulator: turns typed text into webhook payloads so the bot runs locally without WhatsApp (npm run simulate) |
| `upload-reading-backgrounds.js` | One-off: uploads reading passage background images to R2 using S3 client credentials from .env |
| `upload-staging-video.js` | One-off: uploads the registration video to the staging WABA and prints the media id for staging env |
| `validate-env.js` | Presence-based env validator: checks REQUIRED vars and lists optional features switched on by keys |

## Who reads this (all, generated)
- column `leader_schools.leader_user_id` (written by `observe-roster.js`) ← read by `bot/shared/services/observe/observe-roster.service.js:25:9b7db283` · `dashboard/services/coach-observations.service.js:215:58569618`
- column `leader_schools.school_ext_id` (written by `observe-roster.js`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a`
- column `leader_schools.school_id` (written by `observe-roster.js`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a` · `dashboard/services/coach-observations.service.js:214:c73fca38`
- column `leader_schools.school_name` (written by `observe-roster.js`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a` · `dashboard/services/coach-observations.service.js:214:c73fca38`
- column `schools.ext_id` (written by `observe-roster.js`) ← read by `bot/shared/services/staff-attendance.service.js:57:87e081e3` · `bot/scripts/attendance/link-school.js:77:3c40a8fa`
- column `schools.name` (written by `observe-roster.js`) ← read by `bot/shared/services/staff-attendance.service.js:57:87e081e3` · `bot/scripts/attendance/link-school.js:77:3c40a8fa`
- column `user_channels.channel` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:146:48558878` · `bot/shared/services/messaging/user-identity.js:67:3caeb3d2` · `bot/shared/services/nudges/address.js:87:444eaf44` · `bot/shared/services/portal-invite.service.js:38:e964f59a` (+1: `python3 kg/kg.py who-reads user_channels.channel`)
- column `user_channels.channel_user_id` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:147:ce2aaefd` · `bot/shared/services/messaging/user-identity.js:67:3caeb3d2` · `bot/shared/services/nudges/address.js:87:444eaf44` · `bot/shared/services/portal-invite.service.js:38:e964f59a` (+1: `python3 kg/kg.py who-reads user_channels.channel_user_id`)
- column `user_channels.is_primary` (written by `observe-roster.js`) ← read by `bot/shared/services/nudges/address.js:87:444eaf44`
- column `user_channels.user_id` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:145:aa3d7725` · `bot/shared/services/messaging/user-identity.js:67:3caeb3d2` · `bot/shared/services/nudges/address.js:88:9437903a` · `bot/shared/services/nudges/re-engage.kind.js:106:aa3d7725` (+2: `python3 kg/kg.py who-reads user_channels.user_id`)
- column `users.created_at` (written by `observe-roster.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `dashboard/database/queries.js:688:06c5e28d`
- column `users.name` (written by `observe-roster.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/observe/observe-debrief.service.js:172:471703b6` · `bot/shared/services/observe/observe-form.service.js:65:a8fe30cc` (+12: `python3 kg/kg.py who-reads users.name`)
- column `users.phone_number` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:19:6b9ae1f2` · `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/routes/homework-request-endpoint.js:48:0b64c13f` · `bot/shared/routes/observe-form-endpoint.js:100:0b64c13f` (+31: `python3 kg/kg.py who-reads users.phone_number`)
- column `users.source` (written by `observe-roster.js`) ← read by `dashboard/database/verify-funnel-migration.js:50:680bf0db`
- table `users` whole row (`*`) (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `leader_schools` (written by `observe-roster.js`) ← read by `bot/shared/services/observe/observe-roster.service.js:23:bdb5dbab`? · `dashboard/services/coach-observations.service.js:213:bdb5dbab`?
- table `schools` (written by `observe-roster.js`) ← read by `bot/shared/services/staff-attendance.service.js:56:e695fd4a`? · `bot/scripts/attendance/link-school.js:77:3c40a8fa`?
- table `user_channels` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:144:15394c4a`? · `bot/shared/services/messaging/user-identity.js:66:15394c4a`? · `bot/shared/services/nudges/address.js:86:530f5db2`? · `bot/shared/services/nudges/re-engage.kind.js:105:d651fb98`? (+2: `python3 kg/kg.py who-reads user_channels`)
- table `users` (written by `observe-roster.js`) ← read by `bot/shared/database/bot-helpers.js:17:61dfd735`? · `bot/shared/database/queries.js:13:61dfd735`? · `bot/shared/handlers/flow-response.handler.js:635:61dfd735`? · `bot/shared/handlers/observe-command.handler.js:29:22230482`? (+52: `python3 kg/kg.py who-reads users`)
- env `APP_URL` read at `bot/scripts/register-attendance-flows.js:39:4b8816ad`
- env `AWS_ACCESS_KEY_ID` read at `bot/scripts/requeue-lesson-plan.js:23:b1d05116`
- env `AWS_REGION` read at `bot/scripts/requeue-lesson-plan.js:22:2c79605f`
- env `AWS_SECRET_ACCESS_KEY` read at `bot/scripts/requeue-lesson-plan.js:24:2d6a8510`
- env `AXIOM_TOKEN` read at `bot/scripts/check-balochi-history.js:11:67663e32` · `bot/scripts/debug-balochi.js:12:67663e32`
- env `GRAPH_API_VERSION` read at `bot/scripts/send-outage-broadcast.js:19:ddcada1f` · `bot/scripts/upload-staging-video.js:19:ddcada1f`
- env `LP_FIDELITY_EXTRACT_MODEL` read at `bot/scripts/fidelity-calibration.js:84:8871fd48`
- env `MATRIX_ACCESS_TOKEN` read at `bot/scripts/matrix-smoke.js:28:dc87f699`
- env `MATRIX_HOMESERVER_URL` read at `bot/scripts/matrix-smoke.js:28:dc87f699`
- env `MATRIX_SMOKE_TARGET_USER` read at `bot/scripts/matrix-smoke.js:27:0f425d98`
- env `MATRIX_SMOKE_TIMEOUT_MS` read at `bot/scripts/matrix-smoke.js:24:1e28b8f1`
- env `OBSERVE_ROSTER_SOURCE` read at `bot/scripts/observe-roster.js:60:615ca595`
- env `OBSERVE_SCHOOL_ID_PREFIX` read at `bot/scripts/observe-roster.js:56:74b5e4a6`
- env `PHONE_NUMBER` read at `bot/scripts/simulate.js:35:ce60a1d4`
- env `PHONE_NUMBER_ID` read at `bot/scripts/send-outage-broadcast.js:18:c79e4792` · `bot/scripts/setup-flow-encryption.js:30:c79e4792` · `bot/scripts/simulate.js:15:f6764761` · `bot/scripts/upload-staging-video.js:17:2cab844a`
- env `PORT` read at `bot/scripts/simulate.js:78:5804ff21`
- env `R2_ACCESS_KEY_ID` read at `bot/scripts/upload-reading-backgrounds.js:15:d6f2a7a2`
- env `R2_BUCKET_NAME` read at `bot/scripts/upload-reading-backgrounds.js:20:90ddb4d1`
- env `R2_ENDPOINT` read at `bot/scripts/upload-reading-backgrounds.js:13:2684789e`
- env `R2_PUBLIC_URL` read at `bot/scripts/upload-reading-backgrounds.js:74:9762364c`
- env `R2_SECRET_ACCESS_KEY` read at `bot/scripts/upload-reading-backgrounds.js:16:5687c9ca`
- env `SQS_QUEUE_URL` read at `bot/scripts/requeue-lesson-plan.js:28:06371e86`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `bot/scripts/generate-coaching-excel.js:18:90118d4a` · `bot/scripts/requeue-lesson-plan.js:17:90118d4a` · `bot/scripts/send-outage-broadcast.js:13:90118d4a`
- env `SUPABASE_URL` read at `bot/scripts/generate-coaching-excel.js:17:e84bc099` · `bot/scripts/requeue-lesson-plan.js:16:e84bc099` · `bot/scripts/send-outage-broadcast.js:12:e84bc099`
- env `WABA_ID` read at `bot/scripts/register-attendance-flows.js:30:6007273c`
- env `WHATSAPP_TOKEN` read at `bot/scripts/register-attendance-flows.js:31:651a42a4` · `bot/scripts/send-outage-broadcast.js:17:60bafac2` · `bot/scripts/setup-flow-encryption.js:31:babb0b93` · `bot/scripts/upload-staging-video.js:18:922e7ad9`

## Tests (all, generated)
- `generate-coaching-excel.js` ← `tests/coaching/coaching-excel-export-excludes-observations.test.js`
- `generate-observe-flow-json.js` ← `tests/observe/observe-form-flow-json.test.js`
- `observe-roster.js` ← `tests/observe/observe-roster-cli.test.js` · `tests/portal/portal-invite-roster.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/assets/CLAUDE.md`? · `bot/scripts/deployment/CLAUDE.index.md`? · `bot/scripts/deployment/CLAUDE.md`? · `bot/scripts/docs/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.md`? · `bot/scripts/templates/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/README.md`? · `docs/features/observe.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/observe/CLAUDE.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`?
