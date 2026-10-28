# exam-checker — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/exam-checker -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `confirm-students-flow.test.js` | Pins the exam confirm-students Flow: endpoint INIT, data_exchange echo of selected ids, completion wiring |
| `delivery-service-recipient-identifier.test.js` | Pins DeliveryService.sendResults delivering to session.recipient_identifier with no users.phone_number fallback |
| `exam-cancel-name-pending.test.js` | Pins a cancel word ending an open exam session even while the teacher's name is pending, via handleTextMessage |
| `exam-checker-without-r2.test.js` | Pins exam-storage keeping photos and generated files on local disk when R2 is not configured |
| `exam-conversation-after-reading.test.js` | Pins exam confirm-questions to answer-key conversation: Yes button, Edit Qs guidance, via the orchestrator |
| `exam-grading-worker-recipient-identifier.test.js` | Pins exam-grading.worker sending progress, results and errors to session.recipient_identifier |
| `exam-ocr-provider-check.test.js` | Pins migration V2.11.6 dropping the legacy mistral/chandra CHECK on exam_check_sessions.ocr_provider |
| `exam-question-is-chat.test.js` | Pins a question about exams staying chat while short requests open a session; answer-key entry ends on /cancel |
| `exam-session-columns-migration.test.js` | Pins migration V2.11.7 adding ocr_results, grading_results, annotated_images jsonb and jsonb student columns |
| `exam-session-recipient-identifier.test.js` | Pins ExamSessionService storing recipient_identifier on create only, never overwriting an existing session's |
| `exam-stale-recovery.test.js` | Pins recoverStaleExamSessions requeueing or failing stale exam_check_sessions rows and logging name, message, code |
| `exam-trigger-guards.test.js` | Pins shouldTriggerExamChecker matching whole commands or phrases only, so URLs cannot open a session |
| `exam-vision-engine.test.js` | Pins the exam vision engine: read call never sees the marking scheme, Gemini model registry and env overrides |
| `grading-service.test.js` | Pins GradingService._saveGrade writing exam_submissions then per-question exam_grades rows with real columns |

## Who reads this (all, generated)
- env `CHANNEL_DRIVER` read at `tests/exam-checker/confirm-students-flow.test.js:117:d5322628`
- env `EXAM_CHECKER_ENABLED` read at `tests/exam-checker/exam-trigger-guards.test.js:96:7a636ba0`
- env `EXAM_CHECKER_STUDENTS_FLOW_ID` read at `tests/exam-checker/confirm-students-flow.test.js:116:9bbf6793`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/exam-checker/CLAUDE.index.md`? · `bot/shared/services/exam-checker/CLAUDE.md`? · `bot/workers/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/exam-checker/CLAUDE.index.md`? · `tests/exam-checker/CLAUDE.md`?
