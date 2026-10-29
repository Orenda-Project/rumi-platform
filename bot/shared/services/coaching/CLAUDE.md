# coaching — Classroom coaching pipeline: session, transcription, analysis, reflection, report
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching kg=c66b772a5726 gen=f86b64aa7c39 overflow=62 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `coaching-session.service.js` — session lifecycle rows in coaching_sessions; start here
- `report-generator.service.js` — final report and card delivery, run in the SQS worker
- `own-coaching.js` — filter every teacher-own read through ownCoaching() (observe rows share the table)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 7 sub-dirs, each with `CLAUDE.md` | `coaching-card/` · `fidelity/` · `frameworks/` · `lp-coaching/` · `reflective-questions/` · `report-transformers/` · `report-v2/` |
| 3 sub-dirs without a door | `classroom-photo/` (2) · `report-renderers/` (1) · `templates/` (1) |
| `coaching*` | 5 files; most used `coaching-job-queue.service.js`: Queues transcription, analysis and report jobs to SQS; used by orchestrator and image handler |
| … | 22 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `analysis-processor.service.js` (+5)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+52)
- column `coaching_sessions.status` (written by `analysis-processor.service.js` (+1)) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` (+28)
- … 28 more → `CLAUDE.index.md`

## Never (human)
- Never read a teacher's own sessions from raw coaching_sessions; use ownCoaching() (own-coaching.js:5-8)
- Diarization recording must never throw or block transcription (bot/shared/services/coaching/diarization-health.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/coaching-without-object-storage.test.js` (report-generator.service.js, transcription-processor.service.js)
- `tests/coaching/fidelity/lp-step-flow.test.js` (coaching-flow-buttons.js, coaching-job-queue.service.js)
- … 24 more → `CLAUDE.index.md`

## Related (generated)
- skills: `coaching`?
- docs: `bot/shared/services/CLAUDE.md`? · `docs/agent-customization.md`?
