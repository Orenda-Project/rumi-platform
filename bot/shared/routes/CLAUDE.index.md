# routes — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/routes -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `discord-views/` | Discord screen mappings for Flow-equivalent forms (25-option menu cap) → `discord-views/CLAUDE.md` |
| `slack-views/` | Slack Block Kit screen mappings for Flow-equivalent modals → `slack-views/CLAUDE.md` |
| `attendance-marking-endpoint.js` | Slack/Discord counterpart of the attendance-marking Flow: init and exchange over the Redis roster session |
| `attendance-setup-endpoint.js` | Attendance setup Flow endpoint: class info, add-student loop and done, creating the class and student list |
| `discord-flow-registry.js` | Registry mapping a Discord modal-workaround kind to its renderer, lazily registered; builds flow tokens |
| `discord-modal-interactions.handler.js` | Handles Discord start-flow buttons, collected selects and modal submits for the Flow-equivalent forms |
| `edit-class-endpoint.js` | Edit-class Flow endpoint: roster view, add, remove and edit students over encrypted data exchange |
| `exam-confirm-endpoint.js` | Exam "confirm students" Flow endpoint: lists detected students, saves the teacher's confirmed selection |
| `flow-endpoint.routes.js` | Express router for encrypted WhatsApp Flow endpoints (POST /api/flows/*): attendance, registration, observe etc. |
| `homework-request-endpoint.js` | Homework Flow endpoint: grade, subject and chapter picks, then enqueues homework_bundle_generation jobs |
| `observe-form-endpoint.js` | data_exchange endpoint for the coach's editable observation form (Meta Flow only) |
| `pic-lp-endpoint.js` | Pic-to-LP confirmation Flow endpoint: reads grade/subject/topic and starts lesson-plan generation from a textbook photo |
| `portal-internal-endpoint.js` | Internal API (key-protected) used by the portal backend to send a password reset code through the bot |
| `quiz-flow-endpoint.js` | /quiz Flow endpoint: active quizzes with progress, send a new quiz, or cancel one |
| `reading-assessment-endpoint.js` | Reading-assessment endpoint: startAssessment creates the record and passage, shared by Meta and Discord |
| `registration-endpoint.js` | Registration Flow endpoint: personal, region, professional and org screens, creating the teacher profile |
| `settings-endpoint.js` | Settings Flow endpoint: language and observation framework selection saved for the user |
| `slack-flow-registry.js` | Registry mapping a Slack view callback_id kind to its renderer, lazily registered; builds flow tokens |
| `slack-interactions.routes.js` | Slack router at /api/slack: HMAC-verified /events, /interactions and /commands handed to dispatch |
| `slack-modal-interactions.handler.js` | Handles Slack modal interactions: open_modal actions, view_submission steps, back and country-bucket actions |
| `status-flow-endpoint.js` | /status Flow endpoint: lists active quizzes, coaching, lesson plans etc. and lets the teacher cancel one |
| `student-videos-endpoint.js` | Student-videos Flow endpoint (v2): grade, subject, topic picks from done videos, then sends the video to the child |

## Who reads this (all, generated)
- `attendance-marking-endpoint.js` ← imported by `bot/shared/routes/discord-flow-registry.js:107:cec8ff6a` · `bot/shared/routes/slack-flow-registry.js:125:cec8ff6a`
- `attendance-setup-endpoint.js` ← imported by `bot/shared/routes/discord-flow-registry.js:74:afc7a6ec` · `bot/shared/routes/flow-endpoint.routes.js:27:04047618` · `bot/shared/routes/slack-flow-registry.js:78:afc7a6ec` · `bot/shared/routes/slack-modal-interactions.handler.js:190:afc7a6ec`
- `discord-flow-registry.js` ← imported by `bot/shared/routes/discord-modal-interactions.handler.js:38:658f4d6b`
- `discord-modal-interactions.handler.js` ← imported by `bot/shared/services/messaging/inbound/discord-events.adapter.js:304:a2fcce24`
- `edit-class-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:62:b2049111`
- `exam-confirm-endpoint.js` ← imported by `bot/shared/routes/discord-flow-registry.js:163:36d22210` · `bot/shared/routes/flow-endpoint.routes.js:72:f65ee467` · `bot/shared/routes/slack-flow-registry.js:169:36d22210`
- `flow-endpoint.routes.js` ← imported by `bot/whatsapp-bot.js:40:d7fbe472`
- `homework-request-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:57:25e6b28a`
- `observe-form-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:73:13401a25`
- `pic-lp-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:37:f8b78a5b`
- `portal-internal-endpoint.js` ← imported by `bot/whatsapp-bot.js:41:09571ae3`
- `quiz-flow-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:67:bad578f0`
- `reading-assessment-endpoint.js` ← imported by `bot/shared/handlers/flow-response.handler.js:53:773bed62` · `bot/shared/routes/discord-flow-registry.js:191:a6bac785`
- `registration-endpoint.js` ← imported by `bot/shared/routes/discord-flow-registry.js:33:12034085` · `bot/shared/routes/flow-endpoint.routes.js:32:86ecb70b` · `bot/shared/routes/slack-flow-registry.js:29:12034085`
- `settings-endpoint.js` ← imported by `bot/shared/services/messaging/text-flow-definitions.js:95:fed52ded` · `bot/shared/routes/discord-flow-registry.js:50:bd7d027a` · `bot/shared/routes/flow-endpoint.routes.js:42:1dc88f9e` · `bot/shared/routes/slack-flow-registry.js:47:bd7d027a`
- `slack-flow-registry.js` ← imported by `bot/shared/routes/slack-modal-interactions.handler.js:33:859699cd`
- `slack-modal-interactions.handler.js` ← imported by `bot/gateway/adapters/slack.js:23:473109b3` · `bot/shared/routes/slack-interactions.routes.js:30:bdff1f38`
- `status-flow-endpoint.js` ← imported by `bot/shared/routes/flow-endpoint.routes.js:47:4be5d08d`
- `student-videos-endpoint.js` ← imported by `bot/shared/services/messaging/text-flow-definitions.js:49:cc03c759` · `bot/shared/routes/flow-endpoint.routes.js:52:5e16580d`
- column `conversations.current_state` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1982:25920e67` · `bot/whatsapp-bot.js:1416:6fd0e784`
- column `lesson_plan_requests.status` (written by `homework-request-endpoint.js`) ← read by `bot/shared/services/lesson-plan-queue.service.js:190:184894e4` · `bot/shared/services/teacher-state.service.js:61:28233e00`
- column `lesson_plan_requests.topic` (written by `homework-request-endpoint.js`) ← read by `bot/shared/services/teacher-state.service.js:202:6012f2a7`
- column `lesson_plan_requests.user_id` (written by `homework-request-endpoint.js`) ← read by `bot/shared/services/teacher-state.service.js:62:219f5683`
- column `reading_assessments.comprehension_requested` (written by `reading-assessment-endpoint.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.created_at` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/voice-message.handler.js:424:eb730bf5` · `bot/shared/services/context.service.js:171:e8356999` · `bot/shared/services/feature-linker.service.js:358:095556e4` · `bot/shared/services/reading-assessment.service.js:29:491f9c89` (+3: `python3 kg/kg.py who-reads reading_assessments.created_at`)
- column `reading_assessments.grade_level` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1078:28adfbcc` · `bot/shared/handlers/voice-message.handler.js:345:d5870428` · `bot/whatsapp-bot.js:738:d5870428` · `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.language` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1078:28adfbcc` · `bot/shared/handlers/voice-message.handler.js:260:41c35e65` · `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.passage_type` (written by `reading-assessment-endpoint.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.status` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/voice-message.handler.js:421:1099729a` · `bot/shared/services/context.service.js:170:a69ef692` · `bot/shared/services/reading-assessment.service.js:28:a9e5e72d` · `bot/shared/services/redis-comprehension.service.js:85:64fad2d6` (+3: `python3 kg/kg.py who-reads reading_assessments.status`)
- column `reading_assessments.student_identifier` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/services/reading-assessment.service.js:26:0e45f86e` · `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.user_id` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/voice-message.handler.js:422:a819c701` · `bot/shared/services/context.service.js:169:219f5683` · `bot/shared/services/feature-linker.service.js:359:219f5683` · `bot/shared/services/feature-registration.service.js:237:9437903a` (+5: `python3 kg/kg.py who-reads reading_assessments.user_id`)
- column `student_lists.is_active` (written by `attendance-setup-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1778:f8c426e2` · `bot/shared/services/quiz/quiz-orchestrator.service.js:41:f8c426e2` · `bot/shared/services/quiz/quiz-readiness.service.js:39:f8c426e2` · `bot/shared/services/student-list.service.js:289:f8c426e2` (+3: `python3 kg/kg.py who-reads student_lists.is_active`)
- column `students.father_name` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:187:60a975f7` · `bot/shared/routes/attendance-setup-endpoint.js:166:7d44b6c4` · `bot/shared/routes/edit-class-endpoint.js:99:7d44b6c4` · `bot/shared/routes/flow-endpoint.routes.js:399:7d44b6c4`
- column `students.is_active` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:189:f8c426e2` · `bot/shared/services/quiz/quiz-delivery.service.js:84:e465dd9a` · `bot/shared/services/quiz/quiz-orchestrator.service.js:122:f8c426e2` · `bot/shared/services/quiz/quiz-readiness.service.js:55:99c81d39` (+6: `python3 kg/kg.py who-reads students.is_active`)
- column `students.list_id` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:188:fb0eed0f` · `bot/shared/services/coaching/report-generator.service.js:1539:2f9425b7` · `bot/shared/services/quiz/quiz-delivery.service.js:82:f4255278` · `bot/shared/services/quiz/quiz-orchestrator.service.js:121:a205c8ab` (+6: `python3 kg/kg.py who-reads students.list_id`)
- column `students.parent_phone` (written by `edit-class-endpoint.js`) ← read by `bot/shared/services/coaching/report-generator.service.js:1540:21d4effd` · `bot/shared/services/quiz/quiz-delivery.service.js:81:73567c4a` · `bot/shared/services/quiz/quiz-orchestrator.service.js:123:21d4effd` · `bot/shared/services/quiz/quiz-readiness.service.js:55:99c81d39`
- column `students.roll_number` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:187:60a975f7` · `bot/shared/services/student-list.service.js:342:5c923d68` · `bot/shared/routes/attendance-setup-endpoint.js:166:7d44b6c4` · `bot/shared/routes/edit-class-endpoint.js:99:7d44b6c4` (+1: `python3 kg/kg.py who-reads students.roll_number`)
- column `students.student_name` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:187:60a975f7` · `bot/shared/services/quiz/quiz-delivery.service.js:81:73567c4a` · `bot/shared/services/quiz/student-identity.service.js:87:92f6f5aa` · `bot/shared/services/quiz/video-quiz-invite.service.js:162:e95ba03c` (+3: `python3 kg/kg.py who-reads students.student_name`)
- column `users.preferences` (written by `settings-endpoint.js`) ← read by `bot/shared/services/coaching/frameworks/framework-selector.js:46:ff3cc75a`
- column `users.preferred_language` (written by `settings-endpoint.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/coaching/coaching-session.service.js:141:cd922948` · `bot/shared/services/observe/observe-debrief.service.js:719:a78a10fa` · `bot/shared/services/observe/observe-language.js:43:cd922948` (+16: `python3 kg/kg.py who-reads users.preferred_language`)
- table `conversations` whole row (`*`) (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/database/bot-helpers.js:452:d2b02c3e`? · `bot/shared/database/queries.js:26:7a0c163a`? · `dashboard/database/queries.js:694:7a0c163a`?
- table `lesson_plan_requests` whole row (`*`) (written by `homework-request-endpoint.js`) ← read by `bot/shared/services/lesson-plan-queue.service.js:168:d2b02c3e`? · `bot/scripts/requeue-lesson-plan.js:42:d2b02c3e`?
- table `reading_assessments` whole row (`*`) (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/voice-message.handler.js:448:d2b02c3e`? · `bot/shared/services/feature-registration.service.js:236:7a0c163a`? · `bot/shared/services/reading/analysis.service.js:95:d2b02c3e`? · `bot/shared/services/reading/auto-level-orchestrator.service.js:167:d2b02c3e`? (+2: `python3 kg/kg.py who-reads reading_assessments`)
- table `student_lists` whole row (`*`) (written by `attendance-setup-endpoint.js`) ← read by `bot/shared/services/student-list.service.js:287:d2b02c3e`?
- table `students` whole row (`*`) (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/student-list.service.js:386:d2b02c3e`?
- table `users` whole row (`*`) (written by `settings-endpoint.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `conversations` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/database/bot-helpers.js:425:2403bf55`? · `bot/shared/database/queries.js:25:2403bf55`? · `bot/shared/handlers/text-message.handler.js:1981:2403bf55`? · `bot/shared/handlers/voice-message.handler.js:1026:2403bf55`? (+8: `python3 kg/kg.py who-reads conversations`)
- table `lesson_plan_requests` (written by `homework-request-endpoint.js`) ← read by `bot/shared/services/lesson-plan-queue.service.js:33:f61b5e94`? · `bot/shared/services/teacher-state.service.js:60:f61b5e94`? · `bot/workers/homework-bundle.worker.js:115:1d82c145`? · `bot/scripts/requeue-lesson-plan.js:41:f61b5e94`?
- table `reading_assessments` (written by `reading-assessment-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? · `bot/shared/services/context.service.js:165:4337985e`? · `bot/shared/services/feature-linker.service.js:357:4337985e`? (+10: `python3 kg/kg.py who-reads reading_assessments`)
- table `student_lists` (written by `attendance-setup-endpoint.js`) ← read by `bot/shared/handlers/text-message.handler.js:1775:8479d615`? · `bot/shared/services/attendance-delivery.service.js:308:8479d615`? · `bot/shared/services/coaching/report-generator.service.js:1526:8479d615`? · `bot/shared/services/quiz/quiz-orchestrator.service.js:38:8479d615`? (+8: `python3 kg/kg.py who-reads student_lists`)
- table `students` (written by `attendance-setup-endpoint.js`, `edit-class-endpoint.js`) ← read by `bot/shared/services/attendance-delivery.service.js:186:2f35b0c2`? · `bot/shared/services/coaching/report-generator.service.js:1537:2f35b0c2`? · `bot/shared/services/quiz/quiz-delivery.service.js:80:2f35b0c2`? · `bot/shared/services/quiz/quiz-orchestrator.service.js:119:2f35b0c2`? (+8: `python3 kg/kg.py who-reads students`)
- table `users` (written by `settings-endpoint.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+52: `python3 kg/kg.py who-reads users`)
- table `video_quiz_deliveries` (written by `student-videos-endpoint.js`) ← read by `bot/shared/services/quiz/video-quiz.service.js:201:46908910`?
- env `INTERNAL_API_KEY` read at `bot/shared/routes/portal-internal-endpoint.js:26:1b3e4b05`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `bot/shared/routes/slack-modal-interactions.handler.js:37:e889efe4`
- env `SUPABASE_URL` read at `bot/shared/routes/slack-modal-interactions.handler.js:37:e889efe4`

## Tests (all, generated)
- `attendance-marking-endpoint.js` ← `tests/attendance/marking-leave-and-staff.test.js` · `tests/routes/attendance-marking-endpoint.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `attendance-setup-endpoint.js` ← `bot/tests/routes/attendance-setup-endpoint.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `discord-flow-registry.js` ← `tests/routes/discord-flow-registry.test.js`
- `discord-modal-interactions.handler.js` ← `tests/routes/discord-modal-interactions-handler.test.js`
- `edit-class-endpoint.js` ← `tests/edit-class/edit-class-flow.test.js`
- `exam-confirm-endpoint.js` ← `tests/exam-checker/confirm-students-flow.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `flow-endpoint.routes.js` ← `tests/attendance/meta-flow-marking.test.js` · `tests/observe/observe-form-flow-completion.test.js`
- `homework-request-endpoint.js` ← `tests/homework/homework-flow.test.js`
- `observe-form-endpoint.js` ← `tests/observe/observe-form-endpoint.test.js`
- `portal-internal-endpoint.js` ← `tests/portal/portal-reset-code-channel.test.js`
- `quiz-flow-endpoint.js` ← `tests/quiz/quiz-flow-endpoint.test.js`
- `reading-assessment-endpoint.js` ← `tests/routes/discord-flow-registry.test.js` · `tests/routes/reading-assessment-endpoint.test.js`
- `registration-endpoint.js` ← `tests/registration/registration-endpoint.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `settings-endpoint.js` ← `tests/messaging/text-flow-definitions.test.js` · `tests/settings/settings-flow.test.js`
- `slack-flow-registry.js` ← `tests/routes/slack-flow-registry.test.js`
- `slack-interactions.routes.js` ← `tests/gateway/differential.test.js` · `tests/messaging/channel-switch-off.test.js` · `tests/routes/slack-interactions-routes.test.js` · `tests/routes/slack-routed-interactions-handler.test.js`
- `slack-modal-interactions.handler.js` ← `tests/routes/slack-modal-interactions-handler.test.js`
- `status-flow-endpoint.js` ← `tests/status/status-flow.test.js`
- `student-videos-endpoint.js` ← `tests/messaging/text-flow-definitions.test.js` · `tests/routes/student-videos-endpoint.test.js`

## Related (all, generated)
- docs: `bot/shared/CLAUDE.md`? · `docs/features/observe.md`? · `docs/features/video-quizzes.md`?
