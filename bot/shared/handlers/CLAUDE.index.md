# handlers — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/handlers -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 test files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `attendance-flow.handler.js` | Processes attendance setup and marking Flow completions: creates classes and students, computes academic year |
| `edit-class-trigger.js` | Pure keyword detector for the "edit class" intent, split out of text-message.handler for unit tests |
| `exam-checker.handler.js` | Routes exam-checker text commands, photos, buttons and Flow replies to the ExamCheckerOrchestrator |
| `flow-response.handler.js` | Routes a Meta Flow NFM_REPLY to its processor (reading, attendance, registration) or logs endpoint-flow completion |
| `homework-trigger.js` | Pure matcher for the whole-message "homework/hw" hot trigger (English and Urdu) that opens the homework Flow |
| `image-message.handler.js` | Handles incoming photos: coaching photos, exam checker, pic-to-LP, else vision analysis; called by whatsapp-bot.js |
| `lesson-plan-v2.handler.js` | Serves a pre-generated curriculum lesson-plan PDF from R2 by chapter match, else falls through to Gamma generation |
| `observe-command.handler.js` | /observe entry for coaches: gating, onboarding, menu or capture prompt, plus typed replies to pending observe steps |
| `observe-interactive.handler.js` | Single routing table for every observe button and list-reply id, shared by all channels |
| `portal-command.handler.js` | Handles /portal: sends the teacher a portal login link or creates an invite/setup token |
| `testpaper-trigger.js` | Parses /testpaper and /mypapers and routes testpaper text, selections and documents to the orchestrator |
| `text-message.handler.js` | Main text router: slash commands, triggers, quiz and lesson-plan paths; called from whatsapp-bot.js:523 |
| `voice-message.handler.js` | Voice-note router: transcribes, starts coaching for long classroom audio, else lesson-plan/chat; whatsapp-bot.js:525 |

## Who reads this (all, generated)
- `attendance-flow.handler.js` ← imported by `bot/shared/routes/attendance-marking-endpoint.js:23:3587ca60` · `bot/shared/handlers/flow-response.handler.js:51:3a1c2f8f`
- `edit-class-trigger.js` ← imported by `bot/shared/handlers/text-message.handler.js:92:b14a7b6b`
- `exam-checker.handler.js` ← imported by `bot/whatsapp-bot.js:26:ca546162` · `bot/shared/handlers/flow-response.handler.js:131:f343c294` · `bot/shared/handlers/image-message.handler.js:217:f343c294` · `bot/shared/handlers/text-message.handler.js:355:f343c294`
- `flow-response.handler.js` ← imported by `bot/whatsapp-bot.js:1210:edad08fd`
- `homework-trigger.js` ← imported by `bot/shared/handlers/text-message.handler.js:91:ae25a601`
- `image-message.handler.js` ← imported by `bot/whatsapp-bot.js:25:628aef62`
- `lesson-plan-v2.handler.js` ← imported by `bot/shared/handlers/text-message.handler.js:20:d0e3c8d0`
- `observe-command.handler.js` ← imported by `bot/shared/handlers/text-message.handler.js:656:a40b06df`
- `observe-interactive.handler.js` ← imported by `bot/whatsapp-bot.js:540:3b7db69d`
- `portal-command.handler.js` ← imported by `bot/shared/handlers/text-message.handler.js:15:625e6e99`
- `testpaper-trigger.js` ← imported by `bot/whatsapp-bot.js:27:f7170961` · `bot/shared/handlers/text-message.handler.js:93:6393201a`
- `text-message.handler.js` ← imported by `bot/whatsapp-bot.js:23:9dea7e4b`
- `voice-message.handler.js` ← imported by `bot/whatsapp-bot.js:24:bedba29b`
- column `chat_sessions.conversation_state` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/services/observe/observe-audio-router.js:78:a438adbf`
- column `coaching_sessions.conversation_state` (written by `image-message.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` · `bot/shared/services/coaching/coaching-session.service.js:247:e9871896` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:56:46fc4f08` (+4: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.status` (written by `text-message.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` · `bot/shared/services/coaching/coaching-trend.service.js:84:9f341572` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` (+25: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `coaching_sessions.updated_at` (written by `text-message.handler.js`) ← read by `bot/shared/services/observe/observe-debrief.service.js:256:4ae4d8f8` · `bot/shared/services/observe/observe-resume.service.js:41:c24782c0` · `bot/workers/stale-session.worker.js:452:7894f053`
- column `reading_assessments.comprehension_answers` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/services/redis-comprehension.service.js:85:64fad2d6`
- column `reading_assessments.comprehension_questions` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/services/redis-comprehension.service.js:85:64fad2d6`
- column `reading_assessments.comprehension_score` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.status` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/services/context.service.js:170:a69ef692` · `bot/shared/services/reading-assessment.service.js:28:a9e5e72d` · `bot/shared/services/redis-comprehension.service.js:85:64fad2d6` · `bot/workers/stale-session.worker.js:184:99a7da90` (+3: `python3 kg/kg.py who-reads reading_assessments.status`)
- column `users.first_name` (written by `flow-response.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/feature-registration.service.js:166:50676655` · `bot/shared/services/nudges/re-engage.kind.js:198:f9c1d8d9` (+13: `python3 kg/kg.py who-reads users.first_name`)
- column `users.name` (written by `flow-response.handler.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` (+13: `python3 kg/kg.py who-reads users.name`)
- column `users.portal_invite_expires_at` (written by `flow-response.handler.js`) ← read by `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/routes/portal.routes.js:254:7575bd4a`
- column `users.portal_invite_token` (written by `flow-response.handler.js`) ← read by `bot/shared/services/portal-invite.service.js:294:53285ac9` · `dashboard/routes/portal.routes.js:255:53285ac9`
- column `users.preferences` (written by `observe-command.handler.js`) ← read by `bot/shared/routes/settings-endpoint.js:46:f26864bf` · `bot/shared/services/coaching/frameworks/framework-selector.js:46:ff3cc75a`
- column `users.region` (written by `flow-response.handler.js`) ← read by `bot/shared/routes/settings-endpoint.js:46:f26864bf` · `bot/shared/services/coaching/frameworks/framework-selector.js:46:ff3cc75a`
- column `users.registration_completed` (written by `flow-response.handler.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/feature-registration.service.js:166:50676655` · `bot/shared/services/limits/daily-caps.js:175:d8f97c3d` (+5: `python3 kg/kg.py who-reads users.registration_completed`)
- column `users.registration_pending_name` (written by `flow-response.handler.js`) ← read by `bot/shared/services/feature-registration.service.js:166:50676655`
- column `users.school_name` (written by `flow-response.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:57:8bbdcecd`
- table `chat_sessions` whole row (`*`) (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/database/bot-helpers.js:275:d2b02c3e`? · `dashboard/database/queries.js:710:7a0c163a`?
- table `coaching_sessions` whole row (`*`) (written by `image-message.handler.js`, `text-message.handler.js`) ← read by `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? · `bot/shared/services/coaching/analysis-processor.service.js:79:3a872b8e`? · `bot/shared/services/coaching/coaching-session.service.js:157:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `reading_assessments` whole row (`*`) (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/services/feature-registration.service.js:236:7a0c163a`? · `bot/shared/services/reading/analysis.service.js:95:d2b02c3e`? · `bot/shared/services/reading/auto-level-orchestrator.service.js:167:d2b02c3e`? · `dashboard/database/queries.js:749:7a0c163a`? (+2: `python3 kg/kg.py who-reads reading_assessments`)
- table `users` whole row (`*`) (written by `flow-response.handler.js`, `observe-command.handler.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `chat_sessions` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/database/bot-helpers.js:274:7254e10d`? · `bot/shared/services/observe/observe-audio-router.js:78:a438adbf`? · `bot/shared/services/quiz/quiz-delivery.service.js:441:7254e10d`? · `dashboard/database/queries.js:709:7254e10d`? (+4: `python3 kg/kg.py who-reads chat_sessions`)
- table `coaching_sessions` (written by `image-message.handler.js`, `text-message.handler.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/routes/observe-form-endpoint.js:126:5911672a`? · `bot/shared/services/coaching-orchestrator.service.js:223:5911672a`? · `bot/shared/services/coaching/analysis-processor.service.js:34:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)
- table `reading_assessments` (written by `text-message.handler.js`, `voice-message.handler.js`) ← read by `bot/shared/routes/reading-assessment-endpoint.js:161:4337985e`? · `bot/shared/services/context.service.js:165:4337985e`? · `bot/shared/services/feature-linker.service.js:357:4337985e`? · `bot/shared/services/feature-registration.service.js:235:4337985e`? (+11: `python3 kg/kg.py who-reads reading_assessments`)
- table `users` (written by `flow-response.handler.js`, `observe-command.handler.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+53: `python3 kg/kg.py who-reads users`)
- env `ATTENDANCE_MARKING_FLOW_ID` read at `bot/shared/handlers/attendance-flow.handler.js:27:e080b7be` · `bot/shared/handlers/flow-response.handler.js:68:e080b7be`
- env `ATTENDANCE_SETUP_FLOW_ID` read at `bot/shared/handlers/attendance-flow.handler.js:26:84baca7c` · `bot/shared/handlers/flow-response.handler.js:67:84baca7c`
- env `EDIT_CLASS_FLOW_ID` read at `bot/shared/handlers/text-message.handler.js:1768:0199769b`
- env `EXAM_CHECKER_ENABLED` read at `bot/shared/handlers/exam-checker.handler.js:138:199f59e2`
- env `EXAM_CHECKER_STUDENTS_FLOW_ID` read at `bot/shared/handlers/exam-checker.handler.js:498:2a981122` · `bot/shared/handlers/flow-response.handler.js:129:4263f443`
- env `HOMEWORK_FLOW_ID` read at `bot/shared/handlers/text-message.handler.js:1731:67c42c85`
- env `READING_ASSESSMENT_FLOW_ID` read at `bot/shared/handlers/flow-response.handler.js:62:bd405b9f` · `bot/shared/handlers/text-message.handler.js:715:59967b0b`
- env `REGISTRATION_FLOW_ID` read at `bot/shared/handlers/flow-response.handler.js:88:99a2307f`
- env `SETTINGS_FLOW_ID` read at `bot/shared/handlers/text-message.handler.js:1647:c90109a7`
- env `STATUS_FLOW_ID` read at `bot/shared/handlers/text-message.handler.js:1698:2a13f672`
- env `STUDENT_VIDEOS_FLOW_ID` read at `bot/shared/handlers/text-message.handler.js:906:c4b23c5c`

## Tests (all, generated)
- `attendance-flow.handler.js` ← `bot/tests/handlers/attendance-flow.test.js` · `tests/attendance/review-hardening.test.js`
- `edit-class-trigger.js` ← `tests/edit-class/edit-class-flow.test.js`
- `exam-checker.handler.js` ← `tests/exam-checker/exam-cancel-name-pending.test.js` · `tests/exam-checker/exam-checker-without-r2.test.js` · `tests/exam-checker/exam-question-is-chat.test.js` · `tests/exam-checker/exam-trigger-guards.test.js`
- `flow-response.handler.js` ← `tests/attendance/marking-leave-and-staff.test.js` · `tests/flow-response/endpoint-flow-routing.test.js` · `tests/flow-response/exam-confirm-routing.test.js`
- `homework-trigger.js` ← `tests/homework/homework-flow.test.js`
- `image-message.handler.js` ← `bot/tests/handlers/image-message.handler.test.js` · `tests/coaching/fidelity/review-guards.test.js` · `tests/pic-to-lp/image-handler-routing.test.js`
- `lesson-plan-v2.handler.js` ← `tests/textbook-lp-v2/handler-curriculum.test.js`
- `observe-command.handler.js` ← `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-command.handler.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-menu-degrade.test.js` · `tests/observe/observe-organise.test.js` · `tests/observe/observe-section-b-form.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/handlers/observe-command.handler.js`)
- `observe-interactive.handler.js` ← `tests/observe/observe-binding.test.js` · `tests/observe/observe-channel-only-users.test.js` · `tests/observe/observe-command.handler.test.js` · `tests/observe/observe-debrief-entry.test.js` · `tests/observe/observe-draft-form.test.js` · `tests/observe/observe-organise.test.js` (+2: `python3 kg/kg.py who-reads bot/shared/handlers/observe-interactive.handler.js`)
- `portal-command.handler.js` ← `tests/portal/portal-invite-channel.test.js`
- `testpaper-trigger.js` ← `tests/testpaper/testpaper-trigger.test.js`
- `text-message.handler.js` ← `bot/tests/video/style-selection.test.js` · `tests/coaching/stuck-session-ignores-observations.test.js` · `tests/exam-checker/exam-cancel-name-pending.test.js` · `tests/exam-checker/exam-question-is-chat.test.js` · `tests/limits/expensive-job-caps.test.js` · `tests/messaging/bare-command-routing.test.js` (+8: `python3 kg/kg.py who-reads bot/shared/handlers/text-message.handler.js`)
- `voice-message.handler.js` ← `bot/tests/bug-005-audio-document.test.js` · `tests/coaching/fidelity/review-guards.test.js` · `tests/limits/voice-lesson-plan-unavailable.test.js` · `tests/services/inbound-audio-temp-collision.test.js`

## Related (all, generated)
- skills: `reading-assessment`? · `registration`? · `whatsapp-flows`?
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/tests/CLAUDE.md`? · `bot/tests/video/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/LP_PATHS.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/exam-checker.md`? · `docs/features/homework.md`? · `docs/features/pic-to-lp.md`? · `docs/features/quiz.md`? · `docs/features/test-papers.md`? · `tests/attendance/CLAUDE.index.md`? · `tests/attendance/CLAUDE.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/CLAUDE.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.md`? · `tests/edit-class/CLAUDE.md`? · `tests/exam-checker/CLAUDE.index.md`? · `tests/exam-checker/CLAUDE.md`? · `tests/flow-response/CLAUDE.md`? · `tests/homework/CLAUDE.md`? · `tests/limits/CLAUDE.md`? · `tests/messaging/CLAUDE.index.md`? · `tests/messaging/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/observe/CLAUDE.md`? · `tests/pic-to-lp/CLAUDE.index.md`? · `tests/pic-to-lp/CLAUDE.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`? · `tests/services/CLAUDE.md`? · `tests/testpaper/CLAUDE.index.md`? · `tests/testpaper/CLAUDE.md`? · `tests/textbook-lp-v2/CLAUDE.md`?
