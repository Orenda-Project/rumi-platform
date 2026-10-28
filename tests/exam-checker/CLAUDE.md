# exam-checker — Tests for the exam checker: triggers, Flow, grading, storage and migrations
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/exam-checker kg=923ce71725a4 gen=4a2ffa34acfe overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `exam-trigger-guards.test.js` — what may open an exam session and how to leave
- `exam-conversation-after-reading.test.js` — confirm questions through answer key
- `exam-vision-engine.test.js` — read call never sees the marking scheme
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `exam*` | 11 files; most used `exam-question-is-chat.test.js`: Pins a question about exams staying chat while short requests open a session; answer-key entry ends on /cancel |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `confirm-students-flow.test.js` | Pins the exam confirm-students Flow: endpoint INIT, data_exchange echo of selected ids, completion wiring |
| `grading-service.test.js` | Pins GradingService._saveGrade writing exam_submissions then per-question exam_grades rows with real columns |
| `delivery-service-recipient-identifier.test.js` | Pins DeliveryService.sendResults delivering to session.recipient_identifier with no users.phone_number fallback |

## Who reads this (generated)
- env read here: `CHANNEL_DRIVER` · `EXAM_CHECKER_ENABLED` · `EXAM_CHECKER_STUDENTS_FLOW_ID`

## Never (human)
- Deliver grading output to session.recipient_identifier, never a users.phone_number lookup (tests/exam-checker/exam-grading-worker-recipient-identifier.test.js:3)
- The confirm-students Flow must have endpoint, asset and NFM routing all wired (tests/exam-checker/confirm-students-flow.test.js:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? (+7)
