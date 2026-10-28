# exam-checker — Exam checker: read student pages, grade, annotate and deliver marked papers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/exam-checker kg=d094ecce585a gen=95901e8cc156 overflow=28 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `exam-checker.orchestrator.js` — thin coordinator of session states
- `exam-vision.service.js` — read pass then grade pass of one vision model
- `exam-session.service.js` — exam_check_sessions rows plus Redis cache
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `exam*` | 4 files; most used `exam-session.service.js`: Persists exam checking sessions in exam_check_sessions with a Redis cache layer |
| `ocr.service.js` | Adapter that reads exam pages with exam-vision and maps them to the OCR shape the detector expects |
| `delivery.service.js` | Sends graded exam results and annotated images to the teacher over WhatsApp |
| `CLAUDE.index.md` | (unmapped) |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `exam-session.service.js` ← imported by `bot/shared/routes/discord-flow-registry.js:174:bf50eaaf` · `bot/shared/routes/exam-confirm-endpoint.js:30:bf50eaaf` (+3)
- `exam-vision.service.js` ← imported by `bot/scripts/exam-checker-dry-run.js:22:089a7290` · `bot/shared/services/exam-checker/grading.service.js:17:f424c960` (+2)
- `exam-checker.orchestrator.js` ← imported by `bot/shared/routes/discord-flow-registry.js:175:d5be18fa` · `bot/shared/routes/slack-flow-registry.js:185:d5be18fa` (+1)
- … 13 more → `CLAUDE.index.md`

## Never (human)
- Never show the marking scheme when reading answers; grade in a second call (bot/shared/services/exam-checker/exam-vision.service.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/exam-checker/exam-checker-without-r2.test.js` (annotation.service.js, delivery.service.js, exam-storage.js, ocr.service.js)
- `tests/exam-checker/exam-conversation-after-reading.test.js` (exam-checker.orchestrator.js, ocr.service.js, question-detector.service.js)
- … 8 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/exam-checker/CLAUDE.index.md`? · `bot/shared/services/exam-checker/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/exam-checker.md`? (+2)
