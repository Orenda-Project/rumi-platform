# exam-checker — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/exam-checker -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `annotation.service.js` | Draws marks, ticks and margin feedback onto exam images with Canvas, including Urdu fonts |
| `delivery.service.js` | Sends graded exam results and annotated images to the teacher over WhatsApp |
| `exam-checker.orchestrator.js` | Thin coordinator for exam checking state transitions, delegating to OCR, grading and delivery services |
| `exam-session.service.js` | Persists exam checking sessions in exam_check_sessions with a Redis cache layer |
| `exam-storage.js` | Stores exam photos, marked pages and summary PDF in R2 or local TEMP_DIR file:// when no bucket |
| `exam-vision.service.js` | Two-call vision engine: read each answer blind to the marking scheme, then grade against it |
| `feedback.service.js` | Generates Feed Up / Feed Back / Feed Forward feedback for graded exams; used by grading.service |
| `grading-scale.service.js` | Converts marks to board grades (FBISE, Cambridge, Punjab Matric, custom); used by grading.service |
| `grading.service.js` | Grades copied answers against the scheme and writes exam_submissions and exam_grades rows |
| `index.js` | Barrel export of the exam checker services, loaded by the console server |
| `ocr.service.js` | Adapter that reads exam pages with exam-vision and maps them to the OCR shape the detector expects |
| `question-detector.service.js` | Detects students and question types (MCQ etc.) from OCR output; used by the orchestrator |

## Who reads this (all, generated)
- `annotation.service.js` ← imported by `bot/shared/services/exam-checker/exam-checker.orchestrator.js:392:0cd52a27` · `bot/shared/services/exam-checker/index.js:14:0cd52a27`
- `delivery.service.js` ← imported by `bot/shared/services/exam-checker/exam-checker.orchestrator.js:440:9e8b05d5` · `bot/shared/services/exam-checker/index.js:15:9e8b05d5`
- `exam-checker.orchestrator.js` ← imported by `bot/shared/routes/discord-flow-registry.js:175:d5be18fa` · `bot/shared/routes/slack-flow-registry.js:185:d5be18fa` · `bot/shared/services/exam-checker/index.js:9:476011f4`
- `exam-session.service.js` ← imported by `bot/shared/routes/discord-flow-registry.js:174:bf50eaaf` · `bot/shared/routes/exam-confirm-endpoint.js:30:bf50eaaf` · `bot/shared/routes/slack-flow-registry.js:181:bf50eaaf` · `bot/shared/services/exam-checker/exam-checker.orchestrator.js:61:40627fc8` (+1: `python3 kg/kg.py who-reads exam-session.service.js`)
- `exam-storage.js` ← imported by `bot/shared/handlers/exam-checker.handler.js:12:99831d42` · `bot/shared/services/exam-checker/annotation.service.js:24:85617b58` · `bot/shared/services/exam-checker/ocr.service.js:13:46927d00`
- `exam-vision.service.js` ← imported by `bot/scripts/exam-checker-dry-run.js:22:089a7290` · `bot/shared/services/exam-checker/grading.service.js:17:f424c960` · `bot/shared/services/exam-checker/index.js:16:022950cb` · `bot/shared/services/exam-checker/ocr.service.js:16:f424c960`
- `feedback.service.js` ← imported by `bot/shared/services/exam-checker/grading.service.js:16:89307e87` · `bot/shared/services/exam-checker/index.js:18:89307e87`
- `grading-scale.service.js` ← imported by `bot/shared/services/exam-checker/grading.service.js:15:b60adf8a` · `bot/shared/services/exam-checker/index.js:17:b60adf8a`
- `grading.service.js` ← imported by `bot/shared/services/exam-checker/exam-checker.orchestrator.js:391:f90ff460` · `bot/shared/services/exam-checker/index.js:13:f90ff460`
- `index.js` ← imported by `bot/shared/handlers/exam-checker.handler.js:10:003a40df` · `bot/workers/exam-grading.worker.js:26:44b162ab`
- `ocr.service.js` ← imported by `bot/shared/services/exam-checker/exam-checker.orchestrator.js:167:6176d15f` · `bot/shared/services/exam-checker/index.js:11:6176d15f`
- `question-detector.service.js` ← imported by `bot/shared/services/exam-checker/exam-checker.orchestrator.js:168:7b8c901d` · `bot/shared/services/exam-checker/index.js:12:7b8c901d`
- column `exam_check_sessions.status` (written by `exam-session.service.js`) ← read by `bot/workers/exam-grading.worker.js:313:8d5d70f6`
- column `exam_check_sessions.user_id` (written by `exam-session.service.js`) ← read by `bot/workers/exam-grading.worker.js:313:8d5d70f6`
- table `exam_check_sessions` (written by `exam-session.service.js`) ← read by `bot/workers/exam-grading.worker.js:312:3d8d7449`?
- env `CHANNEL_DRIVER` read at `bot/shared/services/exam-checker/exam-storage.js:44:2b38a31b`
- env `EXAM_CHECKER_STUDENTS_FLOW_ID` read at `bot/shared/services/exam-checker/exam-checker.orchestrator.js:202:f40da013`
- env `R2_ENDPOINT` read at `bot/shared/services/exam-checker/exam-storage.js:92:a9593ea5`

## Tests (all, generated)
- `annotation.service.js` ← `tests/exam-checker/exam-checker-without-r2.test.js`
- `delivery.service.js` ← `tests/exam-checker/delivery-service-recipient-identifier.test.js` · `tests/exam-checker/exam-checker-without-r2.test.js`
- `exam-checker.orchestrator.js` ← `tests/exam-checker/confirm-students-flow.test.js` · `tests/exam-checker/exam-conversation-after-reading.test.js` · `tests/exam-checker/exam-trigger-guards.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `exam-session.service.js` ← `tests/exam-checker/exam-session-recipient-identifier.test.js` · `tests/routes/discord-flow-registry.test.js` · `tests/routes/slack-flow-registry.test.js`
- `exam-storage.js` ← `tests/exam-checker/exam-checker-without-r2.test.js`
- `exam-vision.service.js` ← `tests/exam-checker/exam-vision-engine.test.js`
- `grading.service.js` ← `tests/exam-checker/exam-vision-engine.test.js` · `tests/exam-checker/grading-service.test.js`
- `ocr.service.js` ← `tests/exam-checker/exam-checker-without-r2.test.js` · `tests/exam-checker/exam-conversation-after-reading.test.js` · `tests/exam-checker/exam-vision-engine.test.js`
- `question-detector.service.js` ← `tests/exam-checker/exam-conversation-after-reading.test.js`

## Related (all, generated)
- docs: `bot/shared/services/CLAUDE.md`? · `docs/features/exam-checker.md`?
