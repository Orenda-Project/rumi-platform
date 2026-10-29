# services — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 16 files: 0 test + 16 support) |
| `cache/` | Redis client shared by rate limits, dedup, sessions, locks and observe state → `cache/CLAUDE.md` |
| `coaching/` | Classroom coaching pipeline: session, transcription, analysis, reflection, report → `coaching/CLAUDE.md` |
| `exam-checker/` | Exam checker: read student pages, grade, annotate and deliver marked papers → `exam-checker/CLAUDE.md` |
| `limits/` | Cost and abuse guards: inbound rate limit, daily caps by tier, model budget breaker → `limits/CLAUDE.md` |
| `messaging/` | Channel drivers (Meta, Baileys, Slack, Discord, Matrix) and their inbound adapters → `messaging/CLAUDE.md` |
| `nudges/` | Scheduled teacher nudges: kinds, sweeper, store and the local-time rules → `nudges/CLAUDE.md` |
| `observe/` | Coach observation pipeline: capture, review form, debrief, teacher report → `observe/CLAUDE.md` |
| `pedagogy/` | Grade-band and cultural-context rules injected into lesson-plan prompts → `pedagogy/CLAUDE.md` |
| `pic-to-lp/` | Photo-of-a-textbook-page to lesson plan: collect, classify, form, generate, deliver → `pic-to-lp/CLAUDE.md` |
| `queue/` | Job queue drivers (SQS, BullMQ, in-memory) behind one interface → `queue/CLAUDE.md` |
| `quiz/` | Class quizzes: lesson quiz from recording/plan/topic, video quiz, parent quiz, reports → `quiz/CLAUDE.md` |
| `reading/` | Reading assessment pipeline: passage, audio, fluency, pronunciation, report, feedback → `reading/CLAUDE.md` |
| `testpaper/` | The /testpaper feature: source, generation, rendering and versioned storage → `testpaper/CLAUDE.md` |
| `video/` | AI video lesson pipeline: script, images, animation, assembly, delivery → `video/CLAUDE.md` |
| `attendance-conversation.service.js` | State machine for marking class attendance by voice or tap; called by voice handler and attendance endpoints |
| `attendance-dates.js` | Pure YYYY-MM-DD helpers: school-timezone today and register month, with no Date timezone drift |
| `attendance-delivery.service.js` | Saves a marked day to attendance_records/sessions, then rebuilds and sends the month's register |
| `attendance-detector.service.js` | Keyword detector that decides whether a message is an attendance request; used by text handler and adapters |
| `attendance-entry.service.js` | Chat door into attendance: routes in-session replies and fresh triggers to messages for text-message.handler |
| `attendance-generator.service.js` | Builds the Excel attendance sheet in paper-register shape using ExcelJS; used by delivery and marking endpoint |
| `attendance-register-delivery.service.js` | Sends a generated register file to the teacher so storage or disk failure never loses the saved day |
| `attendance-register.service.js` | Pure builder of the cumulative monthly register (class and staff) with P/A/L totals and greyed weekends |
| `audio.service.js` | Transcribes and converts audio (Soniox, ffmpeg, TTS fallback) for voice notes and classroom recordings |
| `aws-textract.service.js` | Lazy AWS Textract OCR client used only by the lesson-plan extraction worker |
| `bandit.service.js` | Thompson-sampling bandit over ab_tests/ab_test_variants/ab_test_events; no non-test importer found |
| `coaching-orchestrator.service.js` | Facade that delegates the classroom observation workflow to coaching microservices; used by text/voice handlers |
| `content.service.js` | Generates lesson-plan presentations through the Gamma API; used by text/voice handlers and report-generator |
| `context.service.js` | Injects past-work context (coaching, lesson plans, reading, videos) into chat only when the user refers back |
| `elevenlabs.service.js` | Text-to-speech via ElevenLabs with per-language voices; used by audio.service and reflective conversation |
| `feature-intro.service.js` | Tracks first use in user_feature_first_use and offers intro videos with consent; used by text handler and linker |
| `feature-keyword-detector.service.js` | Spots feature keywords in messages and offers an intro video via buttons; logs feature_suggestions |
| `feature-linker.service.js` | Suggests the next feature after one finishes, logging to feature_suggestions; called by report and reading flows |
| `feature-registration.service.js` | One-question name registration after first feature use, writes users and sends the portal link |
| `flow-encryption.service.js` | RSA/AES-GCM decrypt and encrypt for WhatsApp Flow endpoints; used by flow and exam-confirm routes |
| `flow-id-validator.service.js` | Boot-time check that each *_FLOW_ID is published on this WABA; logs drift, never crashes the bot |
| `gpt5-mini.service.js` | Main LLM analysis service: pedagogy analysis, reflective questions and corpus; reads coaching_sessions |
| `helper-agent.service.js` | LLM helper that guides stuck users to the right feature; called by text-message.handler |
| `homework-lookup.service.js` | Resolves a homework grade/subject/chapter pick to R2 keys from homework_chapters; used by the homework endpoint |
| `language-detector.service.js` | Detects a message's language (trusts Soniox for some, confirms others with an LLM); used by text and voice handlers |
| `lesson-plan-availability.js` | Checks feature key lesson_plans_gamma (GAMMA_API_KEY plus switch) before queueing a plan, and explains if off |
| `lesson-plan-queue.service.js` | Creates lesson_plan_requests rows and queues generation to SQS so jobs survive restarts; worker consumes |
| `lesson-plan-template.service.js` | Single source for the Gamma lesson-plan section framework and prompt; used by content.service |
| `lesson-planning.service.js` | Thin stub that moves a user from the menu into lesson-planning chat; used only by menu.service |
| `llm-client.js` | OpenAI-SDK factory for OpenRouter (default) or OpenAI; every model call goes through it, with budget guard |
| `lp-shelf.service.js` | Redis shelf of a teacher's last 5 delivered lesson plans (24h sliding TTL) for multi-plan Q&A; used by quiz |
| `menu.service.js` | Builds and sends the main menu and routes choices, storing to conversations; used by handlers and bot entry |
| `mms-inference.service.js` | HTTP client for the MMS-ASR service transcribing Balochi, Sindhi and Pashto; used by audio.service |
| `name-extractor.service.js` | LLM extraction of student names and present/absent status from transcripts; no importer found (dead) |
| `openai.service.js` | Chat, intent detection and topic extraction over llm-client with DB-backed conversation history; used by handlers |
| `pdf-report.service.js` | Draws the coaching observation PDF (PDFKit; MEWAKA via template) with fidelity table; used by coaching report-generator |
| `portal-invite.service.js` | Mints 7-day portal setup tokens and sends multilingual invites on the user's own channel; reads users, user_channels |
| `pregen-lookup.service.js` | Looks up a pre-generated chapter lesson plan in pre_generated_lps so a stock PDF can be served |
| `reading-assessment.service.js` | Entry of the reading assessment flow (language, grade, audio); writes reading_assessments, conversations |
| `redis-comprehension.service.js` | Tracks the comprehension question index from reading_assessments (DB, not Redis, despite the name); reads/writes the row |
| `region-features.service.js` | Reads the region_features table (curriculum LP, pic-LP, video quizzes) with cache; replaces hardcoded region checks |
| `session.service.js` | Redis-backed dedup of processed WhatsApp message ids and first-message tracking, in-memory fallback, 24h TTL |
| `slack-signature.service.js` | Verifies Slack request signatures (HMAC-SHA256 over v0:timestamp:body with SLACK_SIGNING_SECRET) |
| `staff-attendance.service.js` | Head-teacher staff register: staff roster, one row per person per day, month view; writes teacher_attendance_records |
| `student-list.service.js` | CRUD for student_lists and students (classes and rosters) behind attendance and quiz flows |
| `student-video-feedback.service.js` | Post-delivery thumbs survey for Student Videos (30s delay, reason window); writes student_video_feedback |
| `teacher-state.service.js` | Probes whether a teacher is busy and lists/cancels active resources for /status; reads coaching, LP request, quiz tables |
| `toc-loading.service.js` | Loads curated table-of-contents JSON into textbook_toc |
| `topic-matching.service.js` | Matches a teacher's topic request to a textbook chapter via textbook_toc.topic_keywords |
| `vision.service.js` | GPT-4.1 mini image analysis for teacher-sent photos, with retry and token estimate |
| `voice-attendance.service.js` | Transcribes a voice note of absent names (Soniox V3), extracts them with GPT-4o-mini and matches to the student list |
| `whatsapp.service.js` | Thin facade re-exporting the active messaging driver (Meta or Baileys) so all existing send call sites keep working |

## Who reads this (all, generated)
- `attendance-conversation.service.js` ← imported by `bot/shared/handlers/voice-message.handler.js:14:1aa2adab` · `bot/shared/routes/attendance-marking-endpoint.js:22:1aa2adab` · `bot/shared/routes/discord-flow-registry.js:121:1aa2adab` · `bot/shared/routes/slack-flow-registry.js:139:1aa2adab` (+3: `python3 kg/kg.py who-reads attendance-conversation.service.js`)
- `attendance-dates.js` ← imported by `bot/shared/handlers/attendance-flow.handler.js:13:cc5afb36` · `bot/shared/handlers/flow-response.handler.js:464:cc5afb36` · `bot/shared/routes/attendance-setup-endpoint.js:18:cc5afb36` · `bot/shared/routes/flow-endpoint.routes.js:220:cc5afb36` (+5: `python3 kg/kg.py who-reads attendance-dates.js`)
- `attendance-delivery.service.js` ← imported by `bot/shared/handlers/flow-response.handler.js:52:0e2429f6` · `bot/shared/routes/discord-flow-registry.js:120:0e2429f6` · `bot/shared/routes/slack-flow-registry.js:138:0e2429f6` · `bot/shared/services/attendance-entry.service.js:24:f0f4a270`
- `attendance-detector.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:24:ec428ba9` · `bot/shared/services/attendance-entry.service.js:23:fa7d8e79` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:278:bf54c5f6` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:227:bf54c5f6`
- `attendance-entry.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:25:581424ad`
- `attendance-generator.service.js` ← imported by `bot/shared/handlers/attendance-flow.handler.js:11:7dffd5fd` · `bot/shared/routes/attendance-marking-endpoint.js:24:7dffd5fd` · `bot/shared/services/attendance-delivery.service.js:22:500c4a0d`
- `attendance-register-delivery.service.js` ← imported by `bot/shared/services/attendance-delivery.service.js:28:6b32fd22` · `bot/shared/services/staff-attendance.service.js:23:6b32fd22`
- `attendance-register.service.js` ← imported by `bot/shared/services/attendance-delivery.service.js:23:77f5610e` · `bot/shared/services/attendance-generator.service.js:11:77f5610e` · `bot/shared/services/staff-attendance.service.js:21:77f5610e`
- `audio.service.js` ← imported by `bot/console/pipeline-map.js:34:8f50df44` · `bot/shared/config/coaching-audio.js:27:d34fa84b` · `bot/shared/handlers/voice-message.handler.js:7:5930b957` · `bot/whatsapp-bot.js:1742:37ebc6ce` (+10: `python3 kg/kg.py who-reads audio.service.js`)
- `aws-textract.service.js` ← imported by `bot/workers/lesson-plan-extraction.worker.js:11:56d91229`
- `coaching-orchestrator.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:11:73c527bb` · `bot/shared/handlers/voice-message.handler.js:10:73c527bb` · `bot/whatsapp-bot.js:18:eeb29561` · `bot/workers/sqs-worker.js:49:96db3cf9` (+1: `python3 kg/kg.py who-reads coaching-orchestrator.service.js`)
- `content.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:5:056d2128` · `bot/shared/handlers/voice-message.handler.js:8:056d2128` · `bot/workers/lesson-plan-generation.worker.js:14:5c4b2dec` · `bot/shared/services/coaching/report-generator.service.js:24:3342b010` (+1: `python3 kg/kg.py who-reads content.service.js`)
- `context.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:8:4abb92f2`
- `elevenlabs.service.js` ← imported by `bot/shared/services/audio.service.js:731:b4cae654` · `bot/shared/services/coaching/reflective-conversation.service.js:20:d5fc1b90`
- `feature-intro.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:18:a2c580e4` · `bot/shared/services/feature-keyword-detector.service.js:14:cdad3fb7` · `bot/shared/services/feature-linker.service.js:20:cdad3fb7` · `bot/shared/services/menu.service.js:111:cdad3fb7` (+1: `python3 kg/kg.py who-reads feature-intro.service.js`)
- `feature-keyword-detector.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:2078:18efb081` · `bot/whatsapp-bot.js:796:0e4847c5`
- `feature-linker.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:17:e1a3c9dc` · `bot/whatsapp-bot.js:781:a7e67306` · `bot/workers/lesson-plan-generation.worker.js:17:9cffe26b` · `bot/shared/services/coaching/report-generator.service.js:30:a1aeaf86` (+1: `python3 kg/kg.py who-reads feature-linker.service.js`)
- `feature-registration.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:7:4ac5f445` · `bot/shared/handlers/voice-message.handler.js:9:4ac5f445` · `bot/whatsapp-bot.js:319:3cae5e2e` · `bot/workers/lesson-plan-generation.worker.js:18:bca137f5` (+2: `python3 kg/kg.py who-reads feature-registration.service.js`)
- `flow-encryption.service.js` ← imported by `bot/shared/routes/exam-confirm-endpoint.js:22:59b33e9c` · `bot/shared/routes/flow-endpoint.routes.js:18:59b33e9c` · `bot/shared/routes/pic-lp-endpoint.js:16:59b33e9c`
- `flow-id-validator.service.js` ← imported by `bot/whatsapp-bot.js:2115:eee8147c`
- `gpt5-mini.service.js` ← imported by `bot/shared/services/coaching/analysis-processor.service.js:17:139682f2` · `bot/shared/services/coaching/coaching-card/commitment-card.service.js:19:742a30d9` · `bot/shared/services/coaching/reflective-conversation.service.js:17:139682f2` · `bot/shared/services/coaching/report-generator.service.js:23:139682f2` (+3: `python3 kg/kg.py who-reads gpt5-mini.service.js`)
- `helper-agent.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:14:ecc0c851`
- `homework-lookup.service.js` ← imported by `bot/shared/routes/homework-request-endpoint.js:22:19bf3392`
- `language-detector.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:6:58e3d002` · `bot/shared/handlers/voice-message.handler.js:900:58e3d002` · `bot/shared/services/audio.service.js:296:d428b494`
- `lesson-plan-availability.js` ← imported by `bot/shared/handlers/text-message.handler.js:3:fc0a9c33` · `bot/shared/handlers/voice-message.handler.js:5:fc0a9c33` · `bot/shared/services/feature-keyword-detector.service.js:17:a045957c` · `bot/shared/services/pic-to-lp/lp-handoff.service.js:29:bcb3a420` (+1: `python3 kg/kg.py who-reads lesson-plan-availability.js`)
- `lesson-plan-queue.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:19:5ecc6bb0` · `bot/shared/handlers/voice-message.handler.js:13:5ecc6bb0` · `bot/workers/lesson-plan-generation.worker.js:16:b0bffcb2` · `bot/workers/sqs-worker.js:836:b0bffcb2` (+1: `python3 kg/kg.py who-reads lesson-plan-queue.service.js`)
- `lesson-plan-template.service.js` ← imported by `bot/shared/services/content.service.js:6:86cf63b7`
- `lesson-planning.service.js` ← imported by `bot/shared/services/menu.service.js:11:d3ba9a89`
- `llm-client.js` ← imported by `bot/shared/handlers/text-message.handler.js:28:7dd19154` · `bot/shared/utils/word-grid-generator.js:22:7dd19154` · `bot/workers/lesson-plan-extraction.worker.js:5:3b73f0a2` · `bot/shared/services/coaching/coaching-helpers.service.js:29:d016c08b` (+28: `python3 kg/kg.py who-reads llm-client.js`)
- `lp-shelf.service.js` ← imported by `bot/shared/services/quiz/quiz-orchestrator.service.js:28:782730e3`
- `menu.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:12:fea99352` · `bot/shared/handlers/voice-message.handler.js:11:fea99352` · `bot/whatsapp-bot.js:1115:6d596f17`
- `mms-inference.service.js` ← imported by `bot/shared/services/audio.service.js:1090:0934c6da`
- `openai.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:4:c5599cb0` · `bot/shared/handlers/voice-message.handler.js:6:c5599cb0` · `bot/whatsapp-bot.js:17:eaa7b0f5` · `bot/shared/services/quiz/quiz-intent-router.service.js:304:ef319d24` (+2: `python3 kg/kg.py who-reads openai.service.js`)
- `pdf-report.service.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:29:d0116dd0` · `bot/shared/services/coaching/report-renderers/renderer-registry.js:72:8152b12c`
- `portal-invite.service.js` ← imported by `bot/scripts/observe-roster.js:231:6891385c` · `bot/shared/handlers/portal-command.handler.js:14:1a9f137b` · `bot/whatsapp-bot.js:19:0517431a` · `bot/shared/services/feature-registration.service.js:470:800ec443`
- `pregen-lookup.service.js` ← imported by `bot/shared/handlers/lesson-plan-v2.handler.js:16:84436122`
- `reading-assessment.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:16:d507b8b8` · `bot/shared/handlers/voice-message.handler.js:599:d507b8b8` · `bot/whatsapp-bot.js:20:dcc1f3ca`
- `redis-comprehension.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:1045:d7e6f29b` · `bot/shared/handlers/voice-message.handler.js:211:d7e6f29b` · `bot/whatsapp-bot.js:671:081b24ae` · `bot/shared/services/reading/analysis.service.js:1299:aca19c51`
- `region-features.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:21:f7f1b1e6` · `bot/shared/services/messaging/baileys-channel.service.js:649:277abd5c` · `bot/shared/services/messaging/discord-channel.service.js:582:277abd5c` · `bot/shared/services/messaging/matrix-channel.service.js:1092:277abd5c` (+4: `python3 kg/kg.py who-reads region-features.service.js`)
- `session.service.js` ← imported by `bot/gateway/adapters/whatsapp.js:20:dbc3c39a` · `bot/whatsapp-bot.js:13:7247c8f3` · `bot/workers/inbound-message.worker.js:16:80d8cb89`
- `slack-signature.service.js` ← imported by `bot/gateway/adapters/slack.js:22:6a489411` · `bot/shared/routes/slack-interactions.routes.js:27:9bb0d108`
- `staff-attendance.service.js` ← imported by `bot/shared/handlers/attendance-flow.handler.js:302:e3db1b1a` · `bot/shared/routes/flow-endpoint.routes.js:183:e3db1b1a` · `bot/shared/services/attendance-conversation.service.js:26:307ef2ae` · `bot/shared/services/attendance-delivery.service.js:44:307ef2ae`
- `student-list.service.js` ← imported by `bot/shared/handlers/attendance-flow.handler.js:10:98592a4c` · `bot/shared/handlers/flow-response.handler.js:501:98592a4c` · `bot/shared/routes/attendance-setup-endpoint.js:16:98592a4c` · `bot/shared/routes/flow-endpoint.routes.js:19:98592a4c` (+1: `python3 kg/kg.py who-reads student-list.service.js`)
- `student-video-feedback.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:525:e0e119d1` · `bot/shared/routes/student-videos-endpoint.js:25:e0e119d1` · `bot/whatsapp-bot.js:964:0f5046fc` · `bot/shared/services/quiz/video-quiz.service.js:345:5cfea78e`
- `teacher-state.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:1712:0df0a522` · `bot/shared/routes/status-flow-endpoint.js:18:0df0a522`
- `topic-matching.service.js` ← imported by `bot/shared/handlers/lesson-plan-v2.handler.js:15:eb311e53`
- `vision.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:22:b1ec372a` · `bot/shared/services/coaching/classroom-photo/photo-analysis.service.js:68:2eae021b`
- `voice-attendance.service.js` ← imported by `bot/shared/services/attendance-conversation.service.js:991:06550872`
- `whatsapp.service.js` ← imported by `bot/gateway/adapters/whatsapp.js:21:12642918` · `bot/shared/config/coaching-audio.js:26:0204868e` · `bot/shared/handlers/exam-checker.handler.js:11:1bba4f75` · `bot/shared/handlers/flow-response.handler.js:50:1bba4f75` (+92: `python3 kg/kg.py who-reads whatsapp.service.js`)
- column `coaching_sessions.analysis_data` (written by `coaching-orchestrator.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/whatsapp-bot.js:579:229eb7f7` · `bot/workers/sqs-worker.js:1085:27c5417a` · `bot/workers/stale-session.worker.js:102:8a2c34d1` (+18: `python3 kg/kg.py who-reads coaching_sessions.analysis_data`)
- column `coaching_sessions.conversation_state` (written by `coaching-orchestrator.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` · `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/whatsapp-bot.js:579:229eb7f7` (+5: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.status` (written by `coaching-orchestrator.service.js`, `teacher-state.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` · `bot/shared/handlers/text-message.handler.js:1264:21a55915` · `bot/shared/handlers/voice-message.handler.js:703:21a55915` (+26: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `coaching_sessions.updated_at` (written by `coaching-orchestrator.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/workers/stale-session.worker.js:452:7894f053` · `bot/shared/services/observe/observe-debrief.service.js:256:4ae4d8f8` · `bot/shared/services/observe/observe-resume.service.js:41:c24782c0`
- column `conversations.current_state` (written by `menu.service.js`, `reading-assessment.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1982:25920e67` · `bot/whatsapp-bot.js:1416:6fd0e784`
- column `lesson_plan_requests.status` (written by `lesson-plan-queue.service.js`, `teacher-state.service.js`) ← read by `bot/shared/services/lesson-plan-queue.service.js:190:184894e4` · `bot/shared/services/teacher-state.service.js:61:28233e00`
- column `lesson_plan_requests.topic` (written by `lesson-plan-queue.service.js`) ← read by `bot/shared/services/teacher-state.service.js:202:6012f2a7`
- column `lesson_plan_requests.user_id` (written by `lesson-plan-queue.service.js`) ← read by `bot/shared/services/teacher-state.service.js:62:219f5683`
- column `reading_assessments.grade_level` (written by `reading-assessment.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1078:28adfbcc` · `bot/shared/handlers/voice-message.handler.js:345:d5870428` · `bot/whatsapp-bot.js:738:d5870428` · `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.language` (written by `reading-assessment.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1078:28adfbcc` · `bot/shared/handlers/voice-message.handler.js:260:41c35e65` · `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.passage_type` (written by `reading-assessment.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.status` (written by `reading-assessment.service.js`, `redis-comprehension.service.js`) ← read by `bot/shared/handlers/voice-message.handler.js:421:1099729a` · `bot/workers/stale-session.worker.js:184:99a7da90` · `dashboard/database/queries.js:750:a69ef692` · `dashboard/routes/portal.routes.js:1461:a69ef692` (+3: `python3 kg/kg.py who-reads reading_assessments.status`)
- column `reading_assessments.student_identifier` (written by `reading-assessment.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.user_id` (written by `reading-assessment.service.js`) ← read by `bot/shared/handlers/voice-message.handler.js:422:a819c701` · `bot/workers/stale-session.worker.js:185:219f5683` · `dashboard/database/queries.js:819:0a954284` · `dashboard/routes/portal.routes.js:1460:219f5683` (+4: `python3 kg/kg.py who-reads reading_assessments.user_id`)
- column `student_lists.is_active` (written by `student-list.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1778:f8c426e2` · `bot/shared/routes/attendance-setup-endpoint.js:106:e87bf98f` · `bot/shared/routes/flow-endpoint.routes.js:386:f8c426e2` · `bot/shared/routes/quiz-flow-endpoint.js:123:f8c426e2` (+3: `python3 kg/kg.py who-reads student_lists.is_active`)
- column `students.is_active` (written by `student-list.service.js`) ← read by `bot/shared/routes/attendance-setup-endpoint.js:168:f8c426e2` · `bot/shared/routes/edit-class-endpoint.js:101:f8c426e2` · `bot/shared/routes/flow-endpoint.routes.js:401:f8c426e2` · `bot/shared/services/attendance-delivery.service.js:189:f8c426e2` (+5: `python3 kg/kg.py who-reads students.is_active`)
- column `users.first_name` (written by `feature-registration.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `dashboard/database/queries.js:1557:9fe841c2` · `dashboard/index.js:2822:0645b416` · `dashboard/routes/portal.routes.js:254:7575bd4a` (+12: `python3 kg/kg.py who-reads users.first_name`)
- column `users.name` (written by `feature-registration.service.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/queries.js:106:fef21f32` · `dashboard/database/queries.js:1557:9fe841c2` (+13: `python3 kg/kg.py who-reads users.name`)
- column `users.phone_number` (written by `portal-invite.service.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/bot-helpers.js:19:6b9ae1f2` (+31: `python3 kg/kg.py who-reads users.phone_number`)
- column `users.portal_invite_expires_at` (written by `portal-invite.service.js`) ← read by `dashboard/routes/portal.routes.js:254:7575bd4a`
- column `users.portal_invite_token` (written by `portal-invite.service.js`) ← read by `dashboard/routes/portal.routes.js:255:53285ac9`
- column `users.registration_completed` (written by `feature-registration.service.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/utils/telemetry.js:75:d3561f41` · `dashboard/database/queries.js:760:d3561f41` · `dashboard/index.js:2823:d3561f41` (+4: `python3 kg/kg.py who-reads users.registration_completed`)
- table `ab_test_variants` whole row (`*`) (written by `bandit.service.js`) ← read by `dashboard/index.js:1062:d2b02c3e`?
- table `coaching_sessions` whole row (`*`) (written by `coaching-orchestrator.service.js`, `teacher-state.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/whatsapp-bot.js:1833:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `conversations` whole row (`*`) (written by `menu.service.js`, `reading-assessment.service.js`) ← read by `bot/shared/database/bot-helpers.js:452:d2b02c3e`? · `bot/shared/database/queries.js:26:7a0c163a`? · `dashboard/database/queries.js:694:7a0c163a`?
- table `lesson_plan_requests` whole row (`*`) (written by `lesson-plan-queue.service.js`, `teacher-state.service.js`) ← read by `bot/scripts/requeue-lesson-plan.js:42:d2b02c3e`?
- table `reading_assessments` whole row (`*`) (written by `reading-assessment.service.js`, `redis-comprehension.service.js`) ← read by `bot/shared/handlers/voice-message.handler.js:448:d2b02c3e`? · `dashboard/database/queries.js:749:7a0c163a`? · `dashboard/routes/portal.routes.js:1534:d2b02c3e`? · `bot/shared/services/feature-registration.service.js:236:7a0c163a`? (+2: `python3 kg/kg.py who-reads reading_assessments`)
- table `users` whole row (`*`) (written by `feature-registration.service.js`, `portal-invite.service.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `ab_test_variants` (written by `bandit.service.js`) ← read by `dashboard/index.js:1061:f4ca97a1`?
- table `coaching_sessions` (written by `coaching-orchestrator.service.js`, `teacher-state.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)
- table `conversations` (written by `menu.service.js`, `reading-assessment.service.js`) ← read by `bot/shared/database/bot-helpers.js:425:2403bf55`? · `bot/shared/database/queries.js:25:2403bf55`? · `bot/shared/handlers/text-message.handler.js:1981:2403bf55`? · `bot/shared/handlers/voice-message.handler.js:1026:2403bf55`? (+9: `python3 kg/kg.py who-reads conversations`)
- table `lesson_plan_requests` (written by `lesson-plan-queue.service.js`, `teacher-state.service.js`) ← read by `bot/shared/routes/homework-request-endpoint.js:208:f61b5e94`? · `bot/workers/homework-bundle.worker.js:115:1d82c145`? · `bot/scripts/requeue-lesson-plan.js:41:f61b5e94`? · `bot/shared/services/lesson-plan-queue.service.js:33:f61b5e94`? (+1: `python3 kg/kg.py who-reads lesson_plan_requests`)
- table `reading_assessments` (written by `reading-assessment.service.js`, `redis-comprehension.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? · `bot/shared/routes/reading-assessment-endpoint.js:161:4337985e`? · `bot/whatsapp-bot.js:737:4337985e`? (+11: `python3 kg/kg.py who-reads reading_assessments`)
- table `student_lists` (written by `student-list.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1775:8479d615`? · `bot/shared/routes/attendance-setup-endpoint.js:105:8479d615`? · `bot/shared/routes/edit-class-endpoint.js:84:8479d615`? · `bot/shared/routes/flow-endpoint.routes.js:383:8479d615`? (+8: `python3 kg/kg.py who-reads student_lists`)
- table `students` (written by `student-list.service.js`) ← read by `bot/shared/routes/attendance-setup-endpoint.js:165:2f35b0c2`? · `bot/shared/routes/edit-class-endpoint.js:98:2f35b0c2`? · `bot/shared/routes/flow-endpoint.routes.js:398:2f35b0c2`? · `bot/shared/services/attendance-delivery.service.js:186:2f35b0c2`? (+7: `python3 kg/kg.py who-reads students`)
- table `textbook_toc` (written by `toc-loading.service.js`) ← read by `bot/scripts/testpaper/import-curriculum-corpus.js:302:2cf6cbb6`? · `bot/shared/services/testpaper/testpaper-sources.service.js:109:10cc8589`? · `bot/shared/services/topic-matching.service.js:27:10cc8589`?
- table `users` (written by `feature-registration.service.js`, `portal-invite.service.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+53: `python3 kg/kg.py who-reads users`)
- env `APP_URL` read at `bot/shared/services/llm-client.js:52:a6f65934`
- env `ATTENDANCE_ACADEMIC_YEAR_START_MONTH` read at `bot/shared/services/attendance-dates.js:184:5360ecc5`
- env `ATTENDANCE_MARKING_FLOW_ID` read at `bot/shared/services/attendance-entry.service.js:102:4a349ec9`
- env `ATTENDANCE_MAX_BACKDATE_DAYS` read at `bot/shared/services/attendance-dates.js:148:1fea45be`
- env `ATTENDANCE_SETUP_FLOW_ID` read at `bot/shared/services/attendance-entry.service.js:204:12e47a34`
- env `ATTENDANCE_TZ` read at `bot/shared/services/attendance-dates.js:44:d31f37fa`
- env `AWS_ACCESS_KEY_ID` read at `bot/shared/services/aws-textract.service.js:26:b483921a`
- env `AWS_REGION` read at `bot/shared/services/aws-textract.service.js:13:2159a2a4`
- env `AWS_REGION_TEXTRACT` read at `bot/shared/services/aws-textract.service.js:12:a26563a0`
- env `AWS_SECRET_ACCESS_KEY` read at `bot/shared/services/aws-textract.service.js:27:e849d03f`
- env `AWS_TEXTRACT_ACCESS_KEY_ID` read at `bot/shared/services/aws-textract.service.js:26:b483921a`
- env `AWS_TEXTRACT_SECRET_ACCESS_KEY` read at `bot/shared/services/aws-textract.service.js:27:e849d03f`
- env `FLOW_PRIVATE_KEY` read at `bot/shared/services/flow-encryption.service.js:28:88878a86`
- env `FLOW_PRIVATE_KEY_B64` read at `bot/shared/services/flow-encryption.service.js:32:656d99e1`
- env `FLOW_PUBLIC_KEY` read at `bot/shared/services/flow-encryption.service.js:40:8e365b1d`
- env `FLOW_PUBLIC_KEY_B64` read at `bot/shared/services/flow-encryption.service.js:44:b7774d7f`
- env `LLM_MODEL` read at `bot/shared/services/llm-client.js:25:8ac80d3e`
- env `LLM_PROVIDER` read at `bot/shared/services/llm-client.js:24:50f26a4f`
- env `OPENAI_API_KEY` read at `bot/shared/services/llm-client.js:41:610da071`
- env `OPENROUTER_API_KEY` read at `bot/shared/services/llm-client.js:49:480cd274`
- env `OPENROUTER_BASE_URL` read at `bot/shared/services/llm-client.js:27:5a89902f`
- env `READING_ASSESSMENT_FLOW_ID` read at `bot/shared/services/menu.service.js:124:59967b0b`
- env `REGISTRATION_FLOW_ID` read at `bot/shared/services/feature-registration.service.js:324:ff7dc003`
- env `SLACK_SIGNING_SECRET` read at `bot/shared/services/slack-signature.service.js:26:db623bc2`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `bot/shared/services/redis-comprehension.service.js:21:90118d4a`
- env `SUPABASE_URL` read at `bot/shared/services/redis-comprehension.service.js:20:e84bc099`
- env `VISION_MODEL` read at `bot/shared/services/vision.service.js:20:2c896dd6`

## Tests (all, generated)
- `attendance-conversation.service.js` ← `bot/tests/services/attendance-conversation.test.js` · `tests/attendance/review-hardening.test.js` · `tests/attendance/role-routing.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `attendance-dates.js` ← `tests/attendance/attendance-dates.test.js` · `tests/attendance/review-hardening.test.js` · `tests/attendance/role-routing.test.js`
- `attendance-delivery.service.js` ← `bot/tests/services/attendance-delivery.test.js` · `tests/attendance/class-register-delivery.test.js` · `tests/attendance/register-delivery-temp-race.test.js` · `tests/attendance/review-hardening.test.js` · `tests/attendance/staff-register.test.js` · `tests/routes/discord-flow-registry.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/attendance-delivery.service.js`)
- `attendance-detector.service.js` ← `bot/tests/services/attendance-detector.test.js`
- `attendance-entry.service.js` ← `tests/attendance/attendance-entry.test.js` · `tests/attendance/review-hardening.test.js`
- `attendance-generator.service.js` ← `bot/tests/services/attendance-generator.test.js` · `tests/attendance/class-register-generator.test.js`
- `attendance-register.service.js` ← `tests/attendance/monthly-register.test.js`
- `audio.service.js` ← `bot/tests/services/audio.service.test.js` · `tests/coaching/fidelity/diarization-contract.test.js` · `tests/coaching/fidelity/review-guards.test.js` · `tests/language/french-stt.test.js` · `tests/reading/audio-without-object-storage.test.js` · `tests/services/inbound-audio-temp-collision.test.js`
- `content.service.js` ← `bot/tests/unit/lesson-plan-worker.test.js` · `tests/services/content-download-pdf.test.js` · `tests/services/gamma-status-not-logged.test.js`
- `context.service.js` ← `tests/coaching/teacher-facing-reads-ignore-observations.test.js`
- `elevenlabs.service.js` ← `tests/coaching/elevenlabs-lazy-openai.test.js`
- `feature-intro.service.js` ← `tests/quiz/transcript-quiz-offer.test.js`
- `feature-keyword-detector.service.js` ← `tests/limits/lesson-plan-availability.test.js`
- `feature-linker.service.js` ← `tests/coaching/teacher-facing-reads-ignore-observations.test.js`
- `feature-registration.service.js` ← `bot/tests/registration/bug-002-registration-recovery.test.js` · `tests/coaching/teacher-facing-reads-ignore-observations.test.js` · `tests/exam-checker/exam-cancel-name-pending.test.js` · `tests/exam-checker/exam-question-is-chat.test.js` · `tests/limits/inbound-limits-wiring.test.js` · `tests/portal/portal-link-at-registration.test.js` (+6: `python3 kg/kg.py who-reads bot/shared/services/feature-registration.service.js`)
- `flow-id-validator.service.js` ← `tests/flow-id-validator/flow-id-validator.test.js` · `tests/messaging/channel-driver-none.test.js`
- `gpt5-mini.service.js` ← `tests/coaching/analyze-pedagogy-framework-dispatch.test.js` · `tests/coaching/coaching-debrief-config.test.js` · `tests/coaching/fidelity/coaching-without-object-storage.test.js` · `tests/coaching/fidelity/enhance-keeps-lp-fidelity.test.js` · `tests/coaching/fidelity/report-sends-fidelity-line.test.js` · `tests/coaching/fidelity/review-guards.test.js` (+7: `python3 kg/kg.py who-reads bot/shared/services/gpt5-mini.service.js`)
- `homework-lookup.service.js` ← `tests/homework/homework-flow.test.js`
- `language-detector.service.js` ← `tests/language/french-stt.test.js` · `tests/language/indian-languages.test.js`
- `lesson-plan-availability.js` ← `tests/limits/lesson-plan-availability.test.js`
- `lesson-plan-queue.service.js` ← `bot/tests/unit/lesson-plan-worker.test.js`
- `lesson-plan-template.service.js` ← `tests/textbook-lp-v2/lesson-plan-template.test.js`
- `llm-client.js` ← `tests/limits/inbound-limits-wiring.test.js` · `tests/quiz/transcript-quiz-key-verify-model.test.js` · `tests/quiz/transcript-quiz-llm-tex-escapes.test.js` · `tests/unit/llm-client-for-model.test.js`
- `lp-shelf.service.js` ← `tests/quiz/lp-shelf.test.js`
- `menu.service.js` ← `bot/tests/bug-003-false-promise.test.js` · `bot/tests/menu/issue-56-reading-assessment.test.js` · `bot/tests/menu/issue-57-lesson-plan-state.test.js` · `tests/menu/menu-reading-flow.test.js`
- `name-extractor.service.js` ← `bot/tests/services/name-extractor.test.js`
- `openai.service.js` ← `bot/tests/bug-003-false-promise.test.js` · `bot/tests/bug-014-video-language.test.js` · `bot/tests/video/issue-58-ttl-logging.test.js` · `tests/exam-checker/exam-question-is-chat.test.js` · `tests/quiz/openai-detect-intent-quiz.test.js` · `tests/quiz/quiz-intent-router-confirmation.test.js`
- `pdf-report.service.js` ← `tests/coaching/fidelity/pdf-fidelity-table.test.js` · `tests/coaching/fidelity/report-sends-fidelity-line.test.js` · `tests/coaching/report-pdf-url-not-logged.test.js`
- `portal-invite.service.js` ← `tests/portal/portal-invite-channel.test.js`
- `pregen-lookup.service.js` ← `tests/textbook-lp-v2/pregen-lookup.test.js`
- `reading-assessment.service.js` ← `bot/tests/menu/issue-56-reading-assessment.test.js`
- `region-features.service.js` ← `tests/quiz/video-quiz-region-gate.test.js` · `tests/region/region-features.test.js`
- `session.service.js` ← `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js`
- `slack-signature.service.js` ← `tests/messaging/slack-signature-service.test.js`
- `staff-attendance.service.js` ← `tests/attendance/review-hardening.test.js` · `tests/attendance/staff-register.test.js`
- `student-list.service.js` ← `bot/tests/services/student-list.test.js` · `tests/messaging/text-flow-definitions.test.js` · `tests/unit/student-list-parsing.test.js`
- `student-video-feedback.service.js` ← `tests/student-video-feedback.test.js`
- `teacher-state.service.js` ← `tests/coaching/teacher-facing-reads-ignore-observations.test.js` · `tests/status/status-flow.test.js`
- `toc-loading.service.js` ← `tests/textbook-lp-v2/toc-loading.test.js`
- `topic-matching.service.js` ← `tests/textbook-lp-v2/topic-matching.test.js`
- `vision.service.js` ← `bot/tests/handlers/image-message.handler.test.js` · `bot/tests/services/vision.service.test.js`
- `voice-attendance.service.js` ← `bot/tests/services/voice-attendance.test.js` · `tests/attendance/voice-leave.test.js`
- `whatsapp.service.js` ← `bot/tests/menu/issue-56-reading-assessment.test.js` · `bot/tests/menu/issue-57-lesson-plan-state.test.js` · `bot/tests/registration/bug-002-registration-recovery.test.js` · `bot/tests/unit/lesson-plan-worker.test.js` · `bot/tests/video/issue-58-ttl-logging.test.js` · `bot/tests/video/style-selection.test.js` (+80: `python3 kg/kg.py who-reads bot/shared/services/whatsapp.service.js`)

## Related (all, generated)
- skills: `ab-testing`? · `coaching`? · `cross-agent-safety`? · `debugging`? · `digital-coach`? · `reading-assessment`? · `registration`?
- docs: `AGENTS.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `bot/README.md`? · `bot/shared/CLAUDE.md`? · `curriculum/README.md`? · `docs/LP_PATHS.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/customization.md`? · `docs/features/attendance.md`? · `docs/features/homework.md`? · `docs/features/public-limits.md`? · `docs/onboarding/sandbox-production-design.md`?
