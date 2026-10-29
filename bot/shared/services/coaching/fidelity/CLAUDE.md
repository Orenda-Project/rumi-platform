# fidelity — Lesson-plan fidelity: extract planned moves, grade the recording, score in code
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/fidelity kg=5ba0102c82f0 gen=2050259fcf1a overflow=37 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `fidelity-orchestrator.js` — entry; gated by feature lp_fidelity, returns the lp_fidelity blob
- `fidelity-scorer.js` — all arithmetic lives here; `grader-prompt.js` is a calibrated prompt
- `fidelity-report.js` — how each outcome is worded for the teacher
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `fidelity*` | 8 files; most used `fidelity-orchestrator.js`: Plan text to moves to verdicts to score, gated by feature lp_fidelity; never throws; yields analysis_data.lp_fidelity |
| `lesson-plan-text.js` | Reads the stored text of a lesson_plans row (or its PDF text layer) for the fidelity extractor and quiz generators |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `fidelity-recompute.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+51)
- table `lesson_plans` (written by `fidelity-session.js`) ← read by `bot/shared/database/bot-helpers.js:553:611f2601`? · `bot/shared/routes/quiz-flow-endpoint.js:158:611f2601`? (+19)
- … 25 more → `CLAUDE.index.md`

## Never (human)
- The LLM grader only judges moves; scoring stays in code (bot/shared/services/coaching/fidelity/fidelity-analyzer.js:4, bot/shared/services/coaching/fidelity/fidelity-scorer.js:5)
- Never edit the grader prompt without re-running the fixture calibration first (bot/shared/services/coaching/fidelity/grader-prompt.js:8)
- Orchestrator never throws; a transcript with no [MM:SS] stamps stops before any model call (bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:135)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/fidelity-analyzer.test.js` (fidelity-analyzer.js, fidelity-scorer.js, grader-prompt.js)
- `tests/coaching/fidelity/lp-upload-extractor.test.js` (fidelity-phases.js, fidelity-scorer.js, lp-upload-extractor.js)
- … 19 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `docs/features/lesson-plan-fidelity.md`?
