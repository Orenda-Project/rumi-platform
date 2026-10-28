# coaching — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `classroom-photo/` | → (no door; 2 files) |
| `coaching-card/` | Builds the post-reflection commitment card image and its action text → `coaching-card/CLAUDE.md` |
| `fidelity/` | Lesson-plan fidelity: extract planned moves, grade the recording, score in code → `fidelity/CLAUDE.md` |
| `frameworks/` | Observation rubrics (OECD, HOTS, Teach, FICO, MEWAKA) and how one is chosen → `frameworks/CLAUDE.md` |
| `lp-coaching/` | Lesson-plan step of the coaching flow: picker, link, pasted text → `lp-coaching/CLAUDE.md` |
| `reflective-questions/` | Prompts, guardrails and LLM failover for the 3-question reflective chat → `reflective-questions/CLAUDE.md` |
| `report-renderers/` | → (no door; 1 files) |
| `report-transformers/` | Per-framework analysis to generic reportData for the PDF renderers → `report-transformers/CLAUDE.md` |
| `report-v2/` | Hero coaching report image: score view model, narrative, template, PNG → `report-v2/CLAUDE.md` |
| `templates/` | → (no door; 1 files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `analysis-processor.service.js` | Runs pedagogical analysis on a session and writes results to coaching_sessions; called via the orchestrator |
| `coaching-flow-buttons.js` | Handles the photo_yes/no/more/done buttons and advances coaching_sessions status; wired in whatsapp-bot.js |
| `coaching-helpers.service.js` | Coaching utilities: output language, quality metrics into coaching_quality_metrics, cost maths |
| `coaching-job-queue.service.js` | Queues transcription, analysis and report jobs to SQS; used by orchestrator and image handler |
| `coaching-session.service.js` | Creates, confirms and cancels coaching_sessions rows and conversation state; core of the session lifecycle |
| `coaching-trend.service.js` | Loads recent completed coaching_sessions into a sparkline trend array for the hero report |
| `diarization-health.js` | Counts diarized vs not-diarized transcriptions in daily Redis counters; read by doctor and written by audio.service |
| `kiswahili-style.js` | Kiswahili style directive and preferred phrasings injected into coaching prompts by report-v2 narrative |
| `lesson-plan-processor.service.js` | Handles the lesson-plan yes/no, downloads and extracts the document, stores to R2, updates coaching_sessions |
| `own-coaching.js` | Query helper scoping coaching_sessions to a teacher's own sessions (observation_type IS NULL); tolerant of old schema |
| `reflective-conversation.service.js` | Runs the 3-question reflective chat, stores answers in coaching_sessions, triggers the report |
| `report-generator.service.js` | Builds and delivers the coaching report (card, PDF or hero image, voice debrief), updates coaching_sessions; SQS worker |
| `silence-detector.service.js` | Detects silence gaps in token timestamps and infers activity; only tests import it (dead, processor has its own) |
| `transcript-enhancer.service.js` | GPT-4o transcript post-processing (speakers, tags, SLO, climate); only tests import it (dead) |
| `transcription-processor.service.js` | Downloads and transcribes classroom audio (diarized), stores to R2, updates coaching_sessions; orchestrator step |

## Who reads this (all, generated)
- `analysis-processor.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:26:462a1f23`
- `coaching-flow-buttons.js` ← imported by `bot/whatsapp-bot.js:546:4c0acc5f`
- `coaching-helpers.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:30:59783ea8` · `bot/shared/services/coaching/report-generator.service.js:28:81ec52c0` · `bot/shared/services/coaching/transcription-processor.service.js:211:81ec52c0`
- `coaching-job-queue.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:143:ec12d65e` · `bot/shared/services/coaching-orchestrator.service.js:29:a4aeeac0` · `bot/shared/services/observe/observe-capture.service.js:104:0dc01d6a` · `bot/shared/services/observe/observe-debrief.service.js:435:0dc01d6a` (+11: `python3 kg/kg.py who-reads coaching-job-queue.service.js`)
- `coaching-session.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:142:5af71078` · `bot/shared/services/coaching-orchestrator.service.js:23:28501aa4` · `bot/shared/services/coaching/analysis-processor.service.js:19:9735ef3f` · `bot/shared/services/coaching/lesson-plan-processor.service.js:18:9735ef3f` (+4: `python3 kg/kg.py who-reads coaching-session.service.js`)
- `coaching-trend.service.js` ← imported by `bot/shared/services/coaching/report-v2/hero-report.service.js:15:1026ad6d`
- `diarization-health.js` ← imported by `bot/scripts/setup/doctor.js:346:3ff7d9f3` · `bot/shared/services/audio.service.js:626:8a488f71`
- `kiswahili-style.js` ← imported by `bot/shared/services/coaching/report-v2/narrative.service.js:25:8753282b`
- `lesson-plan-processor.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:25:b9ac6375`
- `own-coaching.js` ← imported by `bot/scripts/generate-coaching-excel.js:13:913be6d6` · `bot/shared/handlers/text-message.handler.js:94:b4244552` · `bot/shared/services/context.service.js:14:e9471a1a` · `bot/shared/services/feature-linker.service.js:23:e9471a1a` (+9: `python3 kg/kg.py who-reads own-coaching.js`)
- `reflective-conversation.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:27:49ceecee` · `bot/whatsapp-bot.js:602:5d212d36` · `bot/shared/services/coaching/analysis-processor.service.js:265:25690236`
- `report-generator.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:28:14793149` · `bot/workers/sqs-worker.js:494:773b7d23` · `bot/shared/services/coaching/analysis-processor.service.js:104:31f92cbb`
- `transcription-processor.service.js` ← imported by `bot/shared/services/coaching-orchestrator.service.js:24:399075a1` · `bot/shared/services/observe/observe-debrief.service.js:745:edb708bf`
- column `coaching_sessions.analysis_data` (written by `analysis-processor.service.js`, `report-generator.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/shared/services/observe/observe-brief-card.js:36:9478ca00` · `bot/shared/services/observe/observe-capture.service.js:183:6d26d258` · `bot/shared/services/observe/observe-completion.js:45:2d5e1cfa` (+18: `python3 kg/kg.py who-reads coaching_sessions.analysis_data`)
- column `coaching_sessions.audio_duration_seconds` (written by `coaching-session.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:33:fc4deb20` · `dashboard/index.js:1664:fc4deb20` · `dashboard/routes/portal.routes.js:900:f138ace9` · `dashboard/scripts/backfill-processed-transcripts.js:60:fc4deb20` (+1: `python3 kg/kg.py who-reads coaching_sessions.audio_duration_seconds`)
- column `coaching_sessions.audio_id` (written by `coaching-session.service.js`) ← read by `bot/shared/services/observe/observe-resume.service.js:41:c24782c0`
- column `coaching_sessions.conversation_state` (written by `coaching-flow-buttons.js`, `coaching-session.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` · `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/whatsapp-bot.js:579:229eb7f7` (+5: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.created_at` (written by `coaching-session.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:31:4c415206` · `bot/shared/handlers/image-message.handler.js:111:e8356999` · `bot/shared/handlers/text-message.handler.js:1265:e8356999` · `bot/shared/handlers/voice-message.handler.js:704:e8356999` (+19: `python3 kg/kg.py who-reads coaching_sessions.created_at`)
- column `coaching_sessions.lesson_plan_extraction_status` (written by `lesson-plan-processor.service.js`) ← read by `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a`
- column `coaching_sessions.lesson_plan_format` (written by `lesson-plan-processor.service.js`) ← read by `bot/workers/lesson-plan-extraction.worker.js:37:76f602d8`
- column `coaching_sessions.lesson_plan_r2_key` (written by `lesson-plan-processor.service.js`) ← read by `bot/workers/lesson-plan-extraction.worker.js:37:76f602d8`
- column `coaching_sessions.lesson_plan_url` (written by `lesson-plan-processor.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:35:8b17db77` · `bot/workers/lesson-plan-extraction.worker.js:37:76f602d8`
- column `coaching_sessions.prioritized_action` (written by `report-generator.service.js`) ← read by `bot/shared/services/coaching/coaching-card/card-response.service.js:30:cfc5016d` · `bot/shared/services/coaching/transcription-processor.service.js:222:cfc5016d`
- column `coaching_sessions.recipient_identifier` (written by `coaching-session.service.js`) ← read by `bot/workers/lesson-plan-extraction.worker.js:452:8ed2e8bd` · `bot/workers/stale-session.worker.js:103:d1b8cac4`
- column `coaching_sessions.report_pdf_url` (written by `report-generator.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:38:6523a5b4` · `dashboard/index.js:1888:2fb4f18f`
- column `coaching_sessions.status` (written by `analysis-processor.service.js`, `coaching-session.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` · `bot/shared/handlers/text-message.handler.js:1264:21a55915` · `bot/shared/handlers/voice-message.handler.js:703:21a55915` (+26: `python3 kg/kg.py who-reads coaching_sessions.status`)
- column `coaching_sessions.user_id` (written by `coaching-session.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:30:c030020f` · `bot/shared/handlers/image-message.handler.js:109:a819c701` · `bot/shared/handlers/text-message.handler.js:1263:a819c701` · `bot/shared/handlers/voice-message.handler.js:702:a819c701` (+25: `python3 kg/kg.py who-reads coaching_sessions.user_id`)
- column `coaching_sessions.voice_debrief_url` (written by `report-generator.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:37:d03a047f` · `dashboard/index.js:1519:e56beb09`
- table `coaching_sessions` whole row (`*`) (written by `analysis-processor.service.js`, `coaching-flow-buttons.js`, `coaching-session.service.js`, `lesson-plan-processor.service.js`, `report-generator.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `coaching_sessions` (written by `analysis-processor.service.js`, `coaching-flow-buttons.js`, `coaching-session.service.js`, `lesson-plan-processor.service.js`, `report-generator.service.js`, `transcription-processor.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)

## Tests (all, generated)
- `analysis-processor.service.js` ← `tests/coaching/fidelity/analysis-processor-fidelity.test.js` · `tests/observe/observe-pipeline-analysis.test.js` · `tests/observe/observe-pipeline-section-b.test.js`
- `coaching-flow-buttons.js` ← `tests/coaching/fidelity/lp-step-flow.test.js`
- `coaching-job-queue.service.js` ← `tests/coaching/fidelity/lp-step-flow.test.js` · `tests/coaching/fidelity/review-guards.test.js` · `tests/observe/observe-organise.test.js` · `tests/observe/observe-plumbing.test.js` · `tests/observe/observe-send.test.js`
- `coaching-session.service.js` ← `tests/coaching/coaching-session-recipient-identifier.test.js` · `tests/limits/expensive-job-caps.test.js`
- `coaching-trend.service.js` ← `tests/coaching/coaching-trend-excludes-observations.test.js` · `tests/coaching/own-coaching-missing-column.test.js`
- `diarization-health.js` ← `tests/coaching/fidelity/diarization-contract.test.js`
- `own-coaching.js` ← `tests/coaching/own-coaching-missing-column.test.js`
- `report-generator.service.js` ← `tests/coaching/fidelity/coaching-without-object-storage.test.js` · `tests/coaching/fidelity/report-sends-fidelity-line.test.js` · `tests/coaching/fidelity/voice-speaks-band.test.js` · `tests/coaching/report-pdf-url-not-logged.test.js` · `tests/coaching/teacher-own-history-excludes-observations.test.js` · `tests/observe/observe-pipeline-analysis.test.js` (+3: `python3 kg/kg.py who-reads bot/shared/services/coaching/report-generator.service.js`)
- `silence-detector.service.js` ← `bot/tests/services/silence-detector.test.js`
- `transcript-enhancer.service.js` ← `bot/tests/services/transcript-enhancer.test.js`
- `transcription-processor.service.js` ← `bot/tests/services/transcription-processor.test.js` · `tests/coaching/fidelity/coaching-without-object-storage.test.js` · `tests/observe/observe-pipeline-transcription.test.js` · `tests/services/inbound-audio-temp-collision.test.js`

## Related (all, generated)
- skills: `coaching`?
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/coaching-card/CLAUDE.index.md`? · `bot/shared/services/coaching/coaching-card/CLAUDE.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.index.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.index.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.index.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.index.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.md`? · `bot/tests/services/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/limits/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/services/CLAUDE.md`?
