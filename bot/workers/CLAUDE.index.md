# workers — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/workers -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `brief.worker.js` | One-shot cron worker that picks daily vs weekly brief for the day and renders it via brief/cli.py |
| `exam-grading.worker.js` | SQS exam_grading job: OCR the papers, grade, annotate, deliver results to the teacher |
| `homework-bundle.worker.js` | SQS homework_bundle_generation job: merges chapter PDFs per grade and subject and sends the bundle |
| `inbound-message.worker.js` | Dequeues queued inbound envelopes, dedups, then runs the text/voice/image/button/flow handler (gateway queue mode) |
| `lesson-plan-extraction.worker.js` | Extracts structured lesson-plan data from an uploaded PDF or DOCX via an LLM |
| `lesson-plan-generation.worker.js` | SQS lesson-plan generation job with retries and an apology message after permanent failure |
| `pic-lp-kieai.worker.js` | SQS pic_lp_kieai_generation job: renders two Kie.ai pages from a textbook photo and delivers a 2-page PDF |
| `quiz-job-handler.js` | handleQuizJob for quiz_report, quiz_expire, quiz_nudge and quiz_reminder SQS jobs, routed by sqs-worker.js |
| `sqs-worker.js` | Main SQS consumer: routes jobs by jobType, runs stale-request recovery and health endpoint (node workers/sqs-worker.js) |
| `sqs-worker.railway.toml` | Railway config for the SQS worker service: nixpacks build, start command node workers/sqs-worker.js |
| `stale-session.worker.js` | Railway Cron (15 min) sweep: nudges coaching sessions stuck in conversation and untapped observe invites |
| `teacher-nudges.worker.js` | One-shot teacher-nudge sweep for cron schedulers; same sweep sqs-worker runs on an interval when enabled |
| `testpaper.worker.js` | SQS testpaper_generate / testpaper_revise job: writes or revises a test paper row from source text |
| `video-generation.worker.js` | SQS video_generation job: script, TTS, images, clips, assembly and delivery with checkpoint/resume |

## Who reads this (all, generated)
- `exam-grading.worker.js` ← imported by `bot/workers/sqs-worker.js:53:ca746dc3`
- `homework-bundle.worker.js` ← imported by `bot/workers/sqs-worker.js:378:0d2d9250`
- `inbound-message.worker.js` ← imported by `bot/workers/sqs-worker.js:303:04ee211a`
- `lesson-plan-extraction.worker.js` ← imported by `bot/workers/sqs-worker.js:50:9c52ae35`
- `lesson-plan-generation.worker.js` ← imported by `bot/workers/sqs-worker.js:51:da59a648`
- `pic-lp-kieai.worker.js` ← imported by `bot/workers/sqs-worker.js:369:06f0c297`
- `quiz-job-handler.js` ← imported by `bot/workers/sqs-worker.js:394:7c80559f`
- `testpaper.worker.js` ← imported by `bot/workers/sqs-worker.js:467:808ff62a`
- `video-generation.worker.js` ← imported by `bot/workers/sqs-worker.js:52:68faed42`
- column `coaching_sessions.conversation_state` (written by `stale-session.worker.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` · `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` (+4: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.lesson_plan_extraction_status` (written by `lesson-plan-extraction.worker.js`) ← read by `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a`
- column `coaching_sessions.status` (written by `sqs-worker.js`, `stale-session.worker.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` · `bot/shared/handlers/text-message.handler.js:1264:21a55915` · `bot/shared/handlers/voice-message.handler.js:703:21a55915` (+26: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `coaching_sessions.updated_at` (written by `sqs-worker.js`) ← read by `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/shared/services/observe/observe-debrief.service.js:256:4ae4d8f8` · `bot/shared/services/observe/observe-resume.service.js:41:c24782c0` · `bot/workers/stale-session.worker.js:452:7894f053`
- column `lesson_plan_requests.status` (written by `homework-bundle.worker.js`) ← read by `bot/shared/services/lesson-plan-queue.service.js:190:184894e4` · `bot/shared/services/teacher-state.service.js:61:28233e00`
- column `lesson_plans.content` (written by `homework-bundle.worker.js`) ← read by `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/quiz/quiz-orchestrator.service.js:227:15e5b797` (+1: `python3 kg/kg.py who-reads lesson_plans.content`)
- column `lesson_plans.grade` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:31:d69ad1fa` (+5: `python3 kg/kg.py who-reads lesson_plans.grade`)
- column `lesson_plans.quiz_nudge_sent` (written by `quiz-job-handler.js`) ← read by `bot/shared/services/quiz/quiz-scheduler.service.js:26:15306e2a`
- column `lesson_plans.subject` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`) ← read by `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/quiz/quiz-orchestrator.service.js:227:15e5b797` · `bot/shared/services/quiz/quiz-scheduler.service.js:24:8a8c6d5b` (+3: `python3 kg/kg.py who-reads lesson_plans.subject`)
- column `lesson_plans.topic` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` (+7: `python3 kg/kg.py who-reads lesson_plans.topic`)
- column `lesson_plans.type` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`) ← read by `bot/shared/services/coaching/lp-coaching/lp-step.service.js:33:e125cbb9` · `dashboard/database/queries.js:718:e125cbb9` · `dashboard/routes/portal.routes.js:746:ca3fb650`
- column `lesson_plans.user_id` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`) ← read by `bot/shared/database/bot-helpers.js:555:219f5683` · `bot/shared/routes/quiz-flow-endpoint.js:160:219f5683` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:32:219f5683` · `bot/shared/services/coaching/report-generator.service.js:369:3e703e26` (+10: `python3 kg/kg.py who-reads lesson_plans.user_id`)
- column `quiz_sessions.status` (written by `quiz-job-handler.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:321:14a4b92a` · `bot/shared/services/quiz/quiz-delivery.service.js:142:83330cbc` · `bot/shared/services/quiz/quiz-insight.service.js:204:a69ef692` · `bot/shared/services/quiz/quiz-orchestrator.service.js:341:1afd607b` (+9: `python3 kg/kg.py who-reads quiz_sessions.status`)
- column `video_requests.completed_at` (written by `sqs-worker.js`, `video-generation.worker.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.generation_time_seconds` (written by `video-generation.worker.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.pdf_url` (written by `video-generation.worker.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.retry_count` (written by `sqs-worker.js`, `video-generation.worker.js`) ← read by `bot/workers/sqs-worker.js:933:28884071` · `bot/workers/video-generation.worker.js:361:d2f49837`
- column `video_requests.slide_urls` (written by `video-generation.worker.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.started_at` (written by `video-generation.worker.js`) ← read by `bot/workers/sqs-worker.js:935:96ebd749`
- column `video_requests.status` (written by `sqs-worker.js`, `video-generation.worker.js`) ← read by `bot/shared/services/context.service.js:184:a69ef692` · `bot/shared/services/feature-registration.service.js:244:abb6a119` · `dashboard/database/queries.js:742:a69ef692` · `dashboard/routes/portal.routes.js:1871:0b0b6afb` (+2: `python3 kg/kg.py who-reads video_requests.status`)
- column `video_requests.video_url` (written by `video-generation.worker.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- table `coaching_sessions` whole row (`*`) (written by `lesson-plan-extraction.worker.js`, `sqs-worker.js`, `stale-session.worker.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `exam_check_sessions` whole row (`*`) (written by `exam-grading.worker.js`) ← read by `bot/shared/services/exam-checker/exam-session.service.js:37:d2b02c3e`?
- table `lesson_plan_requests` whole row (`*`) (written by `homework-bundle.worker.js`) ← read by `bot/scripts/requeue-lesson-plan.js:42:d2b02c3e`?
- table `lesson_plans` whole row (`*`) (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`, `quiz-job-handler.js`) ← read by `bot/shared/services/feature-registration.service.js:224:7a0c163a`? · `bot/shared/utils/telemetry.js:106:7a0c163a`? · `dashboard/database/queries.js:717:7a0c163a`?
- table `video_requests` whole row (`*`) (written by `sqs-worker.js`, `video-generation.worker.js`) ← read by `bot/shared/services/feature-registration.service.js:242:7a0c163a`? · `bot/shared/services/video/video-session.service.js:145:3a0a473e`? · `dashboard/database/queries.js:741:7a0c163a`? · `dashboard/routes/portal.routes.js:1930:d2b02c3e`?
- table `coaching_sessions` (written by `lesson-plan-extraction.worker.js`, `sqs-worker.js`, `stale-session.worker.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)
- table `exam_check_sessions` (written by `exam-grading.worker.js`) ← read by `bot/shared/services/exam-checker/exam-session.service.js:36:3d8d7449`?
- table `lesson_plan_requests` (written by `homework-bundle.worker.js`) ← read by `bot/shared/routes/homework-request-endpoint.js:208:f61b5e94`? · `bot/shared/services/lesson-plan-queue.service.js:33:f61b5e94`? · `bot/shared/services/teacher-state.service.js:60:f61b5e94`? · `bot/scripts/requeue-lesson-plan.js:41:f61b5e94`?
- table `lesson_plans` (written by `homework-bundle.worker.js`, `pic-lp-kieai.worker.js`, `quiz-job-handler.js`) ← read by `bot/shared/database/bot-helpers.js:553:611f2601`? · `bot/shared/routes/quiz-flow-endpoint.js:158:611f2601`? · `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9`? · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:111:611f2601`? (+18: `python3 kg/kg.py who-reads lesson_plans`)
- table `quiz_sessions` (written by `quiz-job-handler.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:320:e211522c`? · `bot/shared/services/quiz/quiz-delivery.service.js:141:e211522c`? · `bot/shared/services/quiz/quiz-insight.service.js:201:e211522c`? · `bot/shared/services/quiz/quiz-orchestrator.service.js:340:e211522c`? (+9: `python3 kg/kg.py who-reads quiz_sessions`)
- table `video_requests` (written by `sqs-worker.js`, `video-generation.worker.js`) ← read by `bot/shared/services/context.service.js:179:31e6558b`? · `bot/shared/services/feature-registration.service.js:241:31e6558b`? · `bot/shared/services/video/video-animation.service.js:362:31e6558b`? · `bot/shared/services/video/video-assembly.service.js:219:31e6558b`? (+8: `python3 kg/kg.py who-reads video_requests`)
- env `GRACEFUL_SHUTDOWN_TIMEOUT` read at `bot/workers/sqs-worker.js:63:35941389`
- env `NODE_ENV` read at `bot/workers/sqs-worker.js:1138:f48a92b6`
- env `OBSERVE_DEBRIEF_RETRY_OFF` read at `bot/workers/sqs-worker.js:1063:d3b3cca1`
- env `OFFLINE_REPLAY` read at `bot/workers/lesson-plan-extraction.worker.js:467:2b87e4c7`
- env `PHONE_NUMBER_ID` read at `bot/workers/inbound-message.worker.js:70:e5784cd1`
- env `QUEUE_DRIVER` read at `bot/workers/sqs-worker.js:154:175dc9d8`
- env `RAILWAY_REPLICA_ID` read at `bot/workers/sqs-worker.js:59:6815b5c0`
- env `SQS_POLL_INTERVAL` read at `bot/workers/sqs-worker.js:62:db6ec9df`
- env `SQS_QUEUE_URL` read at `bot/workers/sqs-worker.js:1139:12dada91`
- env `SQS_QUIZ_QUEUE_URL` read at `bot/workers/sqs-worker.js:153:80b13495`
- env `SQS_VIDEO_QUEUE_URL` read at `bot/workers/sqs-worker.js:149:faf15471`
- env `SQS_WORKER_CONCURRENCY` read at `bot/workers/sqs-worker.js:61:daba8ce9`
- env `SQS_WORKER_HEALTH_PORT` read at `bot/workers/sqs-worker.js:767:31b0e107`
- env `TEACHER_NUDGES_SWEEP_MINUTES` read at `bot/workers/sqs-worker.js:1154:e1df3ea5`
- env `TEMP_DIR` read at `bot/workers/lesson-plan-generation.worker.js:24:89250f94`

## Tests (all, generated)
- `brief.worker.js` ← `tests/scripts/brief-worker.test.js`
- `exam-grading.worker.js` ← `tests/exam-checker/exam-grading-worker-recipient-identifier.test.js` · `tests/exam-checker/exam-stale-recovery.test.js`
- `homework-bundle.worker.js` ← `tests/homework/homework-flow.test.js`
- `inbound-message.worker.js` ← `tests/gateway/adversarial-stress.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js`
- `lesson-plan-extraction.worker.js` ← `tests/coaching/fidelity/lp-extraction-writes-plan-text.test.js`
- `lesson-plan-generation.worker.js` ← `bot/tests/unit/lesson-plan-worker.test.js` · `tests/coaching/fidelity/lp-generation-stores-plan-text.test.js` · `tests/queue/lesson-plan-generation-failure.test.js` · `tests/reports/report-temp-collision.test.js`
- `quiz-job-handler.js` ← `tests/quiz/quiz-job-handler.test.js`
- `sqs-worker.js` ← `tests/gateway/gateway-queue-integration.test.js` · `tests/limits/worker-budget.test.js` · `tests/messaging/matrix-job-typing.test.js` · `tests/nudges/teacher-nudges-worker-wiring.test.js` · `tests/observe/observe-debrief-sqs-worker.test.js` · `tests/quiz/lesson-quiz-bullmq-poll.test.js` (+5: `python3 kg/kg.py who-reads bot/workers/sqs-worker.js`)
- `stale-session.worker.js` ← `tests/coaching/stale-session-worker-recipient-identifier.test.js` · `tests/coaching/teacher-facing-reads-ignore-observations.test.js` · `tests/observe/observe-delivery-sweeps.test.js`
- `teacher-nudges.worker.js` ← `tests/nudges/teacher-nudges-worker-wiring.test.js`
- `testpaper.worker.js` ← `tests/testpaper/testpaper-worker.test.js`

## Related (all, generated)
- skills: `coaching`? · `morning-brief`? · `video-generation`?
- docs: `CHANGELOG.md`? · `bot/CLAUDE.md`? · `docs/LP_PATHS.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/features/homework.md`? · `docs/features/pic-to-lp.md`? · `docs/features/public-limits.md`? · `docs/features/quiz.md`? · `docs/features/teacher-nudges.md`? · `docs/features/test-papers.md`?
- service: `sqs-worker.railway.toml` · `worker`
