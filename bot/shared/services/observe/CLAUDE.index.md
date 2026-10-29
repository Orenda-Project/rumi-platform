# observe — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/observe -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `coach-directory.js` | Stores and reads a coach's work email in coach_directory, resolved once and never fuzzy-matched per invite |
| `debrief-retry-sweep.js` | Picks debrief rows stuck pending after a transcription outage for re-queue; the pure half run by sqs-worker |
| `google-calendar.client.js` | Dependency-free Google Calendar REST client signing a service-account JWT; used by observe-calendar |
| `observe-audio-router.js` | Single decision point for what a coach's audio means (observation, debrief, bind); used by voice handler and bot |
| `observe-binding.service.js` | Parks unbound coach recordings in a Redis FIFO and binds the oldest to a chosen teacher visit |
| `observe-brief-card.js` | Builds the pre-visit brief text (last focus, what to look for) from coaching_sessions; never a score |
| `observe-calendar.service.js` | Best-effort calendar invite on schedule, reschedule and cancel; never breaks scheduling |
| `observe-capture.service.js` | Starts a leader observation from a coach's recording (coaching_sessions row) and queues transcription; also cancels |
| `observe-channel.js` | Tells whether a recipient is a Meta WhatsApp number or an additive-channel identity, for window and template rules |
| `observe-coach-card.js` | Renders the coach-feedback card image (value header, wins, one thing to try) for the debrief |
| `observe-coach-feedback.js` | Pure prompt, validation and render for coach-the-coach feedback; the coach never sees a score |
| `observe-completion.js` | Marks an observation completed when the form, debrief and teacher delivery are all done |
| `observe-debrief-guide.js` | Builds the six-step debrief conversation guide from the coach's edited analysis |
| `observe-debrief.service.js` | Runs the guided debrief: arms audio, transcribes, coaches the coach, offers sending the teacher report |
| `observe-draft.service.js` | Freezes the AI draft as v1, sends the coach the editable form, and applies edits to coaching_sessions |
| `observe-edits.service.js` | Merges a coach's rating and Section B edits into the v2 analysis on coaching_sessions; shared by form and Flow |
| `observe-form.service.js` | Channel-neutral chat form where the coach reviews each domain's AI ratings and edits by number |
| `observe-framework.js` | Observe framework pack selecting TEACH, HOTS or MEWAKA rubric by OBSERVE_FRAMEWORK for the pipeline |
| `observe-gate.js` | Pure /observe trigger gate on the observe feature key (OBSERVE_ENABLED); used by the command handler |
| `observe-identity.js` | Re-export shim of messaging/user-identity kept so observe callers and test mocks keep their old path |
| `observe-language.js` | Single owner of whose language an observe message uses (teacher vs coach); reads users |
| `observe-list.js` | Row, paging and clipping helpers for observe's numbered lists within channel caps (10 rows, 24-char titles) |
| `observe-menu.service.js` | Builds the /observe menu list (pending work, new visit, schedule, plan) and handles its taps |
| `observe-plan.service.js` | Offers the observed teacher's recent plans so Section B can check the lesson against its plan |
| `observe-resume.service.js` | Re-enters an unfinished observation at its own step (form, retry or wait) from an /observe menu tap |
| `observe-roster.service.js` | Derives a coach's schools and teachers by join over leader_schools and users, never stored twice |
| `observe-schedule.service.js` | Store for a coach's visit schedule in observation_schedules, one upcoming row per teacher and school |
| `observe-section-b.js` | Pure Section B layer: persists plan-fidelity status in analysis_data.section_b and rescoring on coach edits |
| `observe-send.service.js` | Sends the teacher their report: preview, confirm, channel-aware delivery (window or template), updates coaching_sessions |
| `observe-state.service.js` | Redis state machine for a coach's capture steps (pick, audio, form, debrief audio) with 2h TTL |
| `observe-strings.js` | All /observe user-facing copy as a language pack with English base and per-key overrides |
| `observe-teacher-report.js` | Builds the teacher report content and enforces that coach critique and coach feedback never reach the teacher |
| `observe-terminal.js` | Single list of terminal observation statuses and the matching PostgREST filter, so cancelled stays cancelled |
| `observe-undelivered.service.js` | Finds observations finished but never delivered to the teacher; read by the stale-session worker |
| `observe-untapped.service.js` | Bounds the chase for teacher reports awaiting a template tap (one nudge, then give up); used by stale worker |
| `observe-visit.service.js` | Visit picker (school, teacher, observe now/plan/bind) and My schedule, in chat on every channel |
| `observe-who.service.js` | Asks the coach who they observed after an unbound capture and records it on coaching_sessions |

## Who reads this (all, generated)
- `coach-directory.js` ← imported by `bot/scripts/observe-roster.js:217:c827f44f` · `bot/shared/services/observe/observe-calendar.service.js:25:91756517`
- `debrief-retry-sweep.js` ← imported by `bot/workers/sqs-worker.js:1077:25c334bd` · `bot/shared/services/observe/observe-debrief.service.js:607:4582991a`
- `google-calendar.client.js` ← imported by `bot/shared/services/observe/observe-calendar.service.js:24:d5a0c5f6`
- `observe-audio-router.js` ← imported by `bot/shared/handlers/voice-message.handler.js:72:b196c45a` · `bot/whatsapp-bot.js:1758:332f7a6f`
- `observe-binding.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:70:498d5c9e` · `bot/shared/services/observe/observe-audio-router.js:93:14e01d9c` · `bot/shared/services/observe/observe-visit.service.js:156:14e01d9c`
- `observe-brief-card.js` ← imported by `bot/shared/services/observe/observe-visit.service.js:138:389ba50f`
- `observe-calendar.service.js` ← imported by `bot/shared/services/observe/observe-schedule.service.js:27:7640e2b6`
- `observe-capture.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:37:7631b2f8` · `bot/shared/services/observe/observe-audio-router.js:141:a42c1d4e` · `bot/shared/services/observe/observe-binding.service.js:252:a42c1d4e`
- `observe-channel.js` ← imported by `bot/shared/services/observe/observe-send.service.js:48:a1f4baf9`
- `observe-coach-card.js` ← imported by `bot/shared/services/observe/observe-debrief.service.js:511:78bf499d`
- `observe-coach-feedback.js` ← imported by `bot/shared/services/observe/observe-coach-card.js:22:74f770e9` · `bot/shared/services/observe/observe-debrief.service.js:510:dfc6a0ac`
- `observe-completion.js` ← imported by `bot/shared/services/observe/observe-debrief.service.js:544:89b4b2f7`
- `observe-debrief-guide.js` ← imported by `bot/shared/services/observe/observe-debrief.service.js:34:fa955b63`
- `observe-debrief.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:45:798d1300` · `bot/workers/sqs-worker.js:447:57f25115` · `bot/shared/services/observe/observe-audio-router.js:159:f35a91d8` · `bot/shared/services/observe/observe-binding.service.js:44:7722fa38` (+3: `python3 kg/kg.py who-reads observe-debrief.service.js`)
- `observe-draft.service.js` ← imported by `bot/shared/routes/observe-form-endpoint.js:30:e04fd636` · `bot/shared/services/coaching/analysis-processor.service.js:251:39ab9166` · `bot/whatsapp-bot.js:1190:fd16a11e`
- `observe-edits.service.js` ← imported by `bot/shared/routes/observe-form-endpoint.js:31:0b98aa24` · `bot/shared/services/observe/observe-draft.service.js:38:1a5871cd` · `bot/shared/services/observe/observe-form.service.js:46:1af4ff0c`
- `observe-form.service.js` ← imported by `bot/shared/handlers/observe-command.handler.js:97:1ebc7340` · `bot/shared/handlers/observe-interactive.handler.js:39:3ef207bc` · `bot/shared/services/observe/observe-draft.service.js:135:71aa66b6` · `bot/shared/services/observe/observe-resume.service.js:79:1a37a421`
- `observe-framework.js` ← imported by `bot/scripts/generate-observe-flow-json.js:32:8cd71675` · `bot/shared/routes/observe-form-endpoint.js:32:458ce089` · `bot/shared/services/observe/observe-draft.service.js:30:1cd75b0e` · `bot/shared/services/observe/observe-edits.service.js:17:1cd75b0e` (+3: `python3 kg/kg.py who-reads observe-framework.js`)
- `observe-gate.js` ← imported by `bot/scripts/observe-roster.js:31:addd135b` · `bot/shared/handlers/observe-command.handler.js:18:0a329d2e` · `bot/shared/services/coaching/analysis-processor.service.js:148:645bde66` · `bot/shared/services/portal-invite.service.js:25:e196a75e` (+5: `python3 kg/kg.py who-reads observe-gate.js`)
- `observe-identity.js` ← imported by `bot/scripts/observe-roster.js:77:a5c4b5c8` · `bot/shared/services/observe/observe-capture.service.js:35:758449c9` · `bot/shared/services/observe/observe-debrief.service.js:758:baf7040e` · `bot/shared/services/observe/observe-draft.service.js:33:5469f52b` (+3: `python3 kg/kg.py who-reads observe-identity.js`)
- `observe-language.js` ← imported by `bot/shared/routes/observe-form-endpoint.js:76:b301b5b4` · `bot/shared/services/observe/observe-debrief.service.js:25:7d291f67` · `bot/shared/services/observe/observe-draft.service.js:29:7d291f67` · `bot/shared/services/observe/observe-send.service.js:837:7d291f67`
- `observe-list.js` ← imported by `bot/shared/services/observe/observe-binding.service.js:40:2939df88` · `bot/shared/services/observe/observe-menu.service.js:28:998db721` · `bot/shared/services/observe/observe-visit.service.js:34:22eaa37b`
- `observe-menu.service.js` ← imported by `bot/shared/handlers/observe-command.handler.js:44:43768102` · `bot/shared/handlers/observe-interactive.handler.js:77:f53ad7e9`
- `observe-plan.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:43:6d28fca9` · `bot/shared/services/coaching/analysis-processor.service.js:52:7d70e867` · `bot/shared/services/observe/observe-capture.service.js:148:91b12f32` · `bot/shared/services/observe/observe-draft.service.js:115:c9aeafcb` (+1: `python3 kg/kg.py who-reads observe-plan.service.js`)
- `observe-resume.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:54:60755182` · `bot/shared/services/observe/observe-menu.service.js:158:73dce9a6`
- `observe-roster.service.js` ← imported by `bot/scripts/observe-roster.js:209:4f6b2493` · `bot/shared/services/observe/observe-binding.service.js:37:36903253` · `bot/shared/services/observe/observe-menu.service.js:26:36903253` · `bot/shared/services/observe/observe-send.service.js:316:36903253` (+2: `python3 kg/kg.py who-reads observe-roster.service.js`)
- `observe-schedule.service.js` ← imported by `bot/shared/services/observe/observe-binding.service.js:175:b41e383d` · `bot/shared/services/observe/observe-capture.service.js:112:b41e383d` · `bot/shared/services/observe/observe-menu.service.js:87:b41e383d` · `bot/shared/services/observe/observe-visit.service.js:32:b41e383d`
- `observe-section-b.js` ← imported by `bot/shared/services/coaching/analysis-processor.service.js:229:11bf1d58` · `bot/shared/services/observe/observe-edits.service.js:75:a97f7110` · `bot/shared/services/observe/observe-form.service.js:47:ece0fd0a` · `bot/shared/services/observe/observe-plan.service.js:182:42e0574c` (+1: `python3 kg/kg.py who-reads observe-section-b.js`)
- `observe-send.service.js` ← imported by `bot/shared/handlers/observe-command.handler.js:105:33be0e88` · `bot/shared/handlers/observe-interactive.handler.js:40:17936dfe` · `bot/whatsapp-bot.js:1067:c9cc2b0c` · `bot/workers/sqs-worker.js:457:146b9254` (+3: `python3 kg/kg.py who-reads observe-send.service.js`)
- `observe-state.service.js` ← imported by `bot/shared/handlers/observe-command.handler.js:17:a3e427a1` · `bot/shared/services/observe/observe-audio-router.js:23:49f3da34` · `bot/shared/services/observe/observe-binding.service.js:36:49f3da34` · `bot/shared/services/observe/observe-capture.service.js:19:49f3da34` (+6: `python3 kg/kg.py who-reads observe-state.service.js`)
- `observe-strings.js` ← imported by `bot/scripts/generate-observe-flow-json.js:33:fd6cb5b3` · `bot/shared/handlers/observe-command.handler.js:19:f37befec` · `bot/shared/routes/observe-form-endpoint.js:29:c06f7025` · `bot/shared/services/observe/observe-audio-router.js:24:84f3f930` (+17: `python3 kg/kg.py who-reads observe-strings.js`)
- `observe-teacher-report.js` ← imported by `bot/shared/services/observe/observe-section-b.js:28:5bc7f285` · `bot/shared/services/observe/observe-send.service.js:565:9d86b17b`
- `observe-terminal.js` ← imported by `bot/shared/routes/observe-form-endpoint.js:33:e44af224` · `bot/workers/sqs-worker.js:1078:7e1679d6` · `bot/workers/stale-session.worker.js:470:7e1679d6` · `bot/shared/services/observe/observe-capture.service.js:21:0d40d8aa` (+7: `python3 kg/kg.py who-reads observe-terminal.js`)
- `observe-undelivered.service.js` ← imported by `bot/workers/stale-session.worker.js:507:620bbee0` · `bot/shared/services/observe/observe-send.service.js:897:fe50d1a6`
- `observe-untapped.service.js` ← imported by `bot/workers/stale-session.worker.js:469:6e57e5ea` · `bot/shared/services/observe/observe-send.service.js:866:826f4b44`
- `observe-visit.service.js` ← imported by `bot/shared/handlers/observe-command.handler.js:38:c0b96701` · `bot/shared/handlers/observe-interactive.handler.js:78:857d82ac` · `bot/shared/services/observe/observe-menu.service.js:128:213a1c18`
- `observe-who.service.js` ← imported by `bot/shared/handlers/observe-interactive.handler.js:42:0d06a527` · `bot/shared/services/observe/observe-capture.service.js:135:4b835148`
- column `coaching_sessions.analysis_data` (written by `observe-debrief.service.js`, `observe-edits.service.js`, `observe-plan.service.js`, `observe-resume.service.js`, `observe-send.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/shared/services/coaching/coaching-trend.service.js:82:8162476b` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `bot/shared/services/coaching/reflective-conversation.service.js:42:9a821017` (+18: `python3 kg/kg.py who-reads coaching_sessions.analysis_data`)
- column `coaching_sessions.audio_duration_seconds` (written by `observe-capture.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:33:fc4deb20` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `dashboard/index.js:1664:fc4deb20` · `dashboard/routes/portal.routes.js:900:f138ace9` (+1: `python3 kg/kg.py who-reads coaching_sessions.audio_duration_seconds`)
- column `coaching_sessions.audio_id` (written by `observe-capture.service.js`) ← read by `bot/shared/services/observe/observe-resume.service.js:41:c24782c0`
- column `coaching_sessions.created_at` (written by `observe-capture.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:31:4c415206` · `bot/shared/handlers/image-message.handler.js:111:e8356999` · `bot/shared/handlers/text-message.handler.js:1265:e8356999` · `bot/shared/handlers/voice-message.handler.js:704:e8356999` (+19: `python3 kg/kg.py who-reads coaching_sessions.created_at`)
- column `coaching_sessions.debrief_status` (written by `observe-capture.service.js`, `observe-debrief.service.js`, `observe-draft.service.js`) ← read by `bot/workers/sqs-worker.js:1085:27c5417a` · `dashboard/services/coach-observations.service.js:135:8424f2a9` · `bot/shared/services/observe/observe-completion.js:45:2d5e1cfa` · `bot/shared/services/observe/observe-debrief.service.js:99:b88b1700`
- column `coaching_sessions.observation_type` (written by `observe-capture.service.js`) ← read by `bot/shared/services/coaching/own-coaching.js:38:eb90e6da` · `bot/workers/stale-session.worker.js:453:18b55c8b` · `dashboard/routes/portal.routes.js:738:37d91ebb` · `dashboard/services/coach-observations.service.js:137:49f65bf4` (+3: `python3 kg/kg.py who-reads coaching_sessions.observation_type`)
- column `coaching_sessions.observer_user_id` (written by `observe-capture.service.js`) ← read by `bot/workers/sqs-worker.js:1088:1b0694a9` · `bot/workers/stale-session.worker.js:452:7894f053` · `dashboard/services/coach-observations.service.js:135:8424f2a9` · `bot/shared/services/observe/observe-debrief.service.js:119:2df9e8f4` (+3: `python3 kg/kg.py who-reads coaching_sessions.observer_user_id`)
- column `coaching_sessions.status` (written by `observe-capture.service.js`, `observe-completion.js`, `observe-draft.service.js`, `observe-edits.service.js`, `observe-resume.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` · `bot/shared/handlers/text-message.handler.js:1264:21a55915` · `bot/shared/handlers/voice-message.handler.js:703:21a55915` (+26: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `coaching_sessions.updated_at` (written by `observe-capture.service.js`, `observe-resume.service.js`, `observe-who.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/workers/stale-session.worker.js:452:7894f053` · `bot/shared/services/observe/observe-debrief.service.js:256:4ae4d8f8` · `bot/shared/services/observe/observe-resume.service.js:41:c24782c0`
- column `coaching_sessions.user_id` (written by `observe-capture.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:30:c030020f` · `bot/shared/handlers/image-message.handler.js:109:a819c701` · `bot/shared/handlers/text-message.handler.js:1263:a819c701` · `bot/shared/handlers/voice-message.handler.js:702:a819c701` (+26: `python3 kg/kg.py who-reads coaching_sessions.user_id`)
- column `observation_schedules.leader_user_id` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:148:d95d5de9` · `bot/shared/services/observe/observe-who.service.js:175:a631068d`
- column `observation_schedules.scheduled_for` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.scheduled_slot` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.school_name` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:147:2a1a25c3` · `bot/shared/services/observe/observe-debrief.service.js:141:2073485d`
- column `observation_schedules.session_id` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:147:2a1a25c3` · `bot/shared/services/observe/observe-debrief.service.js:141:2073485d` · `bot/shared/services/observe/observe-who.service.js:175:a631068d`
- column `observation_schedules.status` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:194:8cc315e5` · `bot/shared/services/observe/observe-who.service.js:175:a631068d`
- column `observation_schedules.teacher_ext_id` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:147:2a1a25c3`
- column `observation_schedules.teacher_name` (written by `observe-schedule.service.js`) ← read by `dashboard/services/coach-observations.service.js:147:2a1a25c3` · `bot/shared/services/observe/observe-debrief.service.js:141:2073485d`
- table `coaching_sessions` whole row (`*`) (written by `observe-capture.service.js`, `observe-completion.js`, `observe-debrief.service.js`, `observe-draft.service.js`, `observe-edits.service.js`, `observe-plan.service.js`, `observe-resume.service.js`, `observe-send.service.js`, `observe-who.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `coaching_sessions` (written by `observe-capture.service.js`, `observe-completion.js`, `observe-debrief.service.js`, `observe-draft.service.js`, `observe-edits.service.js`, `observe-plan.service.js`, `observe-resume.service.js`, `observe-send.service.js`, `observe-who.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)
- table `observation_schedules` (written by `observe-calendar.service.js`, `observe-schedule.service.js`, `observe-who.service.js`) ← read by `dashboard/services/coach-observations.service.js:146:061f012c`? · `bot/shared/services/observe/observe-calendar.service.js:70:2fddd673`? · `bot/shared/services/observe/observe-debrief.service.js:140:061f012c`? · `bot/shared/services/observe/observe-schedule.service.js:43:061f012c`? (+1: `python3 kg/kg.py who-reads observation_schedules`)
- env `GOOGLE_CALENDAR_ID` read at `bot/shared/services/observe/google-calendar.client.js:34:e9f166a5`
- env `GOOGLE_CALENDAR_SUBJECT` read at `bot/shared/services/observe/google-calendar.client.js:33:fd8d65c4`
- env `GOOGLE_SERVICE_ACCOUNT_JSON` read at `bot/shared/services/observe/google-calendar.client.js:32:9e829e34`
- env `LP_FIDELITY_PLAN_WAIT_SECONDS` read at `bot/shared/services/observe/observe-plan.service.js:58:d41f8fe8`
- env `OBSERVE_CALENDAR_ENABLED` read at `bot/shared/services/observe/observe-calendar.service.js:30:351f1839`
- env `OBSERVE_CALENDAR_TIMEZONE` read at `bot/shared/services/observe/observe-calendar.service.js:50:77ab5db6`
- env `OBSERVE_ENABLED` read at `bot/shared/services/observe/observe-gate.js:54:23ca6b03`
- env `OBSERVE_FORM_FLOW_ID` read at `bot/shared/services/observe/observe-draft.service.js:117:4feeb60b`
- env `OBSERVE_FRAMEWORK` read at `bot/shared/services/observe/observe-framework.js:222:80cb020e`
- env `OBSERVE_LEADER_ROLES` read at `bot/shared/services/observe/observe-gate.js:44:d9b6abea`
- env `OBSERVE_REPORT_TEMPLATE` read at `bot/shared/services/observe/observe-send.service.js:208:c67b1ac2`
- env `OBSERVE_REPORT_TEMPLATE_LANG` read at `bot/shared/services/observe/observe-send.service.js:209:7b516cd8`
- env `OBSERVE_REVIEW_MODE` read at `bot/shared/services/observe/observe-send.service.js:784:7684826f`
- env `OBSERVE_REVIEW_NUMBER` read at `bot/shared/services/observe/observe-send.service.js:785:4e269085`
- env `OBSERVE_SCHOOL_DAYS` read at `bot/shared/services/observe/observe-visit.service.js:191:e6263ede`
- env `OBSERVE_SELF_COACH_ROLES` read at `bot/shared/services/observe/observe-gate.js:78:f3c49b79`
- env `OBSERVE_UNTAPPED_EXPIRE_DAYS` read at `bot/shared/services/observe/observe-untapped.service.js:32:c5f9d3d8`

## Tests (all, generated)
- `coach-directory.js` ← `tests/observe/observe-coach-directory.test.js`
- `debrief-retry-sweep.js` ← `tests/observe/observe-completion-sweep.test.js`
- `google-calendar.client.js` ← `tests/observe/observe-schedule.test.js`
- `observe-audio-router.js` ← `tests/observe/observe-audio-router.test.js` · `tests/observe/observe-binding.test.js` · `tests/observe/observe-debrief-entry.test.js` · `tests/observe/observe-organise.test.js` · `tests/observe/observe-wiring.test.js`
- `observe-calendar.service.js` ← `tests/observe/observe-schedule.test.js`
- `observe-capture.service.js` ← `tests/observe/observe-capture.test.js`
- `observe-channel.js` ← `tests/observe/observe-channel.test.js`
- `observe-coach-card.js` ← `tests/observe/observe-coach-card.test.js`
- `observe-coach-feedback.js` ← `tests/observe/observe-coach-feedback.test.js`
- `observe-completion.js` ← `tests/observe/observe-completion-sweep.test.js`
- `observe-debrief-guide.js` ← `tests/observe/observe-debrief-guide.test.js`
- `observe-debrief.service.js` ← `tests/observe/observe-card-temp.test.js` · `tests/observe/observe-debrief-entry.test.js` · `tests/observe/observe-debrief-worker.test.js` · `tests/observe/observe-send-gave-up.test.js` · `tests/services/inbound-audio-temp-collision.test.js`
- `observe-draft.service.js` ← `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-form-flow-completion.test.js` · `tests/observe/observe-form-flow-json.test.js` · `tests/observe/observe-section-b-form.test.js`
- `observe-edits.service.js` ← `tests/observe/observe-form-endpoint.test.js` · `tests/observe/observe-section-b-form.test.js`
- `observe-form.service.js` ← `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-form-flow-completion.test.js` · `tests/observe/observe-section-b-form.test.js`
- `observe-framework.js` ← `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-form-endpoint.test.js` · `tests/observe/observe-form-flow-json.test.js` · `tests/observe/observe-framework-pack.test.js` · `tests/observe/observe-plumbing.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/observe/observe-framework.js`)
- `observe-gate.js` ← `tests/observe/observe-gate.test.js` · `tests/observe/observe-portal-coach.service.test.js`
- `observe-identity.js` ← `tests/observe/observe-identity.test.js`
- `observe-language.js` ← `tests/observe/observe-language-roster.test.js`
- `observe-menu.service.js` ← `tests/observe/observe-menu-degrade.test.js`
- `observe-plan.service.js` ← `tests/observe/observe-command.handler.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-late-plan-pick.test.js` · `tests/observe/observe-pipeline-section-b.test.js` · `tests/observe/observe-plan.test.js`
- `observe-roster.service.js` ← `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-language-roster.test.js` · `tests/observe/observe-roster-cli.test.js`
- `observe-schedule.service.js` ← `tests/observe/observe-schedule.test.js`
- `observe-section-b.js` ← `tests/observe/observe-late-plan-pick.test.js` · `tests/observe/observe-portal-coach.service.test.js` · `tests/observe/observe-section-b.test.js`
- `observe-send.service.js` ← `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-delivery-sweeps.test.js` · `tests/observe/observe-send-gave-up.test.js` · `tests/observe/observe-send-processor.test.js` · `tests/observe/observe-send-sqs.test.js` · `tests/observe/observe-send-stale.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/observe/observe-send.service.js`)
- `observe-state.service.js` ← `tests/observe/observe-capture.test.js` · `tests/observe/observe-command.handler.test.js` · `tests/observe/observe-debrief-entry.test.js` · `tests/observe/observe-debrief-worker.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-form-flow-completion.test.js` (+5: `python3 kg/kg.py who-reads bot/shared/services/observe/observe-state.service.js`)
- `observe-strings.js` ← `tests/observe/observe-coach-card.test.js` · `tests/observe/observe-coach-feedback.test.js` · `tests/observe/observe-debrief-entry.test.js` · `tests/observe/observe-debrief-guide.test.js` · `tests/observe/observe-debrief-worker.test.js` · `tests/observe/observe-language-roster.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/observe/observe-strings.js`)
- `observe-teacher-report.js` ← `tests/observe/observe-section-b.test.js` · `tests/observe/observe-send-processor.test.js` · `tests/observe/observe-teacher-report.test.js`
- `observe-terminal.js` ← `tests/observe/observe-language-roster.test.js`
- `observe-undelivered.service.js` ← `tests/observe/observe-delivery-sweeps.test.js`
- `observe-untapped.service.js` ← `tests/observe/observe-delivery-sweeps.test.js` · `tests/observe/observe-send-gave-up.test.js`
- `observe-who.service.js` ← `tests/observe/observe-who.test.js`

## Related (all, generated)
- docs: `bot/shared/services/CLAUDE.md`?
