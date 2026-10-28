# fidelity — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/fidelity -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `fidelity-analyzer.js` | LLM grader returning per-move verdicts only, via OpenRouter; called by fidelity-orchestrator and calibration script |
| `fidelity-orchestrator.js` | Plan text to moves to verdicts to score, gated by feature lp_fidelity; never throws; yields analysis_data.lp_fidelity |
| `fidelity-phases.js` | Single phase vocabulary and labels for lesson-plan fidelity moves, shared by extractor and report |
| `fidelity-preflight.js` | Pure check of a transcript's [MM:SS] stamps; no_timestamps stops grading before any model call |
| `fidelity-recompute.service.js` | Re-grades fidelity for a late-linked plan and persists it to coaching_sessions only in safe statuses |
| `fidelity-report.js` | Turns analysis_data.lp_fidelity into the chat line and report block, with a distinct wording per outcome |
| `fidelity-scorer.js` | Deterministic fidelity arithmetic and bands from grader verdicts; used by orchestrator, fico framework, observe |
| `fidelity-session.js` | Gathers a session's plan and transcript, grades fidelity, and applies the framework mapping |
| `grader-prompt.js` | Calibrated grader system prompt and user-message builder; any edit needs the fixture re-calibration |
| `lesson-plan-text.js` | Reads the stored text of a lesson_plans row (or its PDF text layer) for the fidelity extractor and quiz generators |
| `lp-upload-extractor.js` | Extracts the prescribed teaching-move list from plan text via LLM; used by fidelity-orchestrator and session |
| `upload-extractor-prompt.js` | Calibrated plan-to-moves extractor prompt, language-neutral; loaded only by lp-upload-extractor |

## Who reads this (all, generated)
- `fidelity-analyzer.js` ← imported by `bot/scripts/fidelity-calibration.js:22:39aeb012` · `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:119:1a9dc13a`
- `fidelity-orchestrator.js` ← imported by `bot/shared/handlers/image-message.handler.js:43:32645c2d` · `bot/shared/services/coaching/analysis-processor.service.js:23:884f69d1` · `bot/shared/services/coaching/lesson-plan-processor.service.js:84:884f69d1` · `bot/shared/services/coaching/lp-coaching/lp-list-selection.handler.js:54:7d821bd0` (+7: `python3 kg/kg.py who-reads fidelity-orchestrator.js`)
- `fidelity-phases.js` ← imported by `bot/shared/services/observe/observe-section-b.js:27:87a3357f` · `bot/shared/services/coaching/fidelity/fidelity-report.js:14:b0cd6b4b` · `bot/shared/services/coaching/fidelity/lp-upload-extractor.js:15:89d4a2fe`
- `fidelity-preflight.js` ← imported by `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:29:e71f6991` · `bot/shared/services/coaching/fidelity/fidelity-scorer.js:24:87668613`
- `fidelity-recompute.service.js` ← imported by `bot/shared/services/coaching/lp-coaching/lp-list-selection.handler.js:72:ff8914e3` · `bot/workers/lesson-plan-extraction.worker.js:160:76926d65`
- `fidelity-report.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:191:ad7c9ddd` · `bot/shared/services/coaching/report-transformers/_shared.js:33:ccb1eb19` · `bot/shared/services/observe/observe-section-b.js:26:b2c26d7e`
- `fidelity-scorer.js` ← imported by `bot/shared/services/coaching/frameworks/fico-framework.js:408:58de8b12` · `bot/shared/services/observe/observe-section-b.js:192:a620f25a` · `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:120:f88d2867`
- `fidelity-session.js` ← imported by `bot/shared/services/coaching/analysis-processor.service.js:24:5b3c28d4` · `bot/shared/services/observe/observe-plan.service.js:181:56646587` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:88:ffba95c8`
- `grader-prompt.js` ← imported by `bot/shared/services/coaching/fidelity/fidelity-analyzer.js:29:dacc59a8`
- `lesson-plan-text.js` ← imported by `bot/shared/services/quiz/quiz-orchestrator.service.js:257:aa62315b` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:41:9fa53061` · `bot/shared/services/testpaper/testpaper-sources.service.js:29:973e0545` · `bot/workers/lesson-plan-generation.worker.js:20:0f9a6cd6` (+1: `python3 kg/kg.py who-reads lesson-plan-text.js`)
- `lp-upload-extractor.js` ← imported by `bot/scripts/fidelity-calibration.js:21:6da8b5db` · `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:118:8ff228a4` · `bot/shared/services/coaching/fidelity/fidelity-session.js:105:e278507d`
- `upload-extractor-prompt.js` ← imported by `bot/shared/services/coaching/fidelity/lp-upload-extractor.js:14:a1861133`
- column `lesson_plans.content` (written by `fidelity-session.js`) ← read by `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/quiz/quiz-orchestrator.service.js:227:15e5b797` · `bot/shared/services/testpaper/testpaper-sources.service.js:298:a3bdef78` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd`
- table `lesson_plans` whole row (`*`) (written by `fidelity-session.js`) ← read by `bot/shared/services/feature-registration.service.js:224:7a0c163a`? · `bot/shared/utils/telemetry.js:106:7a0c163a`? · `dashboard/database/queries.js:717:7a0c163a`?
- table `coaching_sessions` (written by `fidelity-recompute.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+49: `python3 kg/kg.py who-reads coaching_sessions`)
- table `lesson_plans` (written by `fidelity-session.js`) ← read by `bot/shared/database/bot-helpers.js:553:611f2601`? · `bot/shared/routes/quiz-flow-endpoint.js:158:611f2601`? · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:98:611f2601`? · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:30:611f2601`? (+17: `python3 kg/kg.py who-reads lesson_plans`)
- env `LP_FIDELITY_BAND_HIGH` read at `bot/shared/services/coaching/fidelity/fidelity-scorer.js:40:695c879e`
- env `LP_FIDELITY_BAND_PARTIAL` read at `bot/shared/services/coaching/fidelity/fidelity-scorer.js:41:9c52f7aa`
- env `LP_FIDELITY_EMPTY_RETRY_EFFORT` read at `bot/shared/services/coaching/fidelity/fidelity-analyzer.js:54:b46a7780`
- env `LP_FIDELITY_ENABLED` read at `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:64:4e816258`
- env `LP_FIDELITY_EXTRACT_MAX_TOKENS` read at `bot/shared/services/coaching/fidelity/lp-upload-extractor.js:59:82642fd2`
- env `LP_FIDELITY_EXTRACT_MODEL` read at `bot/shared/services/coaching/fidelity/lp-upload-extractor.js:33:271fb10b`
- env `LP_FIDELITY_MAX_TOKENS` read at `bot/shared/services/coaching/fidelity/fidelity-analyzer.js:59:311e6594`
- env `LP_FIDELITY_MODEL` read at `bot/shared/services/coaching/fidelity/fidelity-analyzer.js:40:95f4cb41` · `bot/shared/services/coaching/fidelity/lp-upload-extractor.js:33:271fb10b`
- env `LP_FIDELITY_PLAN_WAIT_SECONDS` read at `bot/shared/services/coaching/fidelity/fidelity-session.js:16:d41f8fe8`
- env `LP_FIDELITY_REASONING_EFFORT` read at `bot/shared/services/coaching/fidelity/fidelity-analyzer.js:47:7390846c`
- env `LP_FIDELITY_RUNS` read at `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:55:dd0eaa8a`

## Tests (all, generated)
- `fidelity-analyzer.js` ← `tests/coaching/fidelity/fidelity-analyzer.test.js`
- `fidelity-orchestrator.js` ← `tests/coaching/fidelity/diarization-contract.test.js` · `tests/coaching/fidelity/fidelity-feature-entry.test.js` · `tests/coaching/fidelity/fidelity-orchestrator.test.js` · `tests/coaching/fidelity/fidelity-recompute.test.js` · `tests/coaching/fidelity/lp-step-flow.test.js` · `tests/coaching/fidelity/truncation-inconsistent.test.js`
- `fidelity-phases.js` ← `tests/coaching/fidelity/lp-upload-extractor.test.js` · `tests/observe/observe-portal-coach.service.test.js`
- `fidelity-preflight.js` ← `tests/coaching/fidelity/diarization-contract.test.js` · `tests/coaching/fidelity/fidelity-preflight.test.js`
- `fidelity-recompute.service.js` ← `tests/coaching/fidelity/fidelity-recompute.test.js` · `tests/coaching/fidelity/lp-extraction-writes-plan-text.test.js` · `tests/coaching/fidelity/lp-step-flow.test.js` · `tests/coaching/fidelity/review-guards.test.js`
- `fidelity-report.js` ← `tests/coaching/fidelity/fidelity-report.test.js` · `tests/coaching/fidelity/pdf-fidelity-table.test.js` · `tests/coaching/fidelity/report-sends-fidelity-line.test.js`
- `fidelity-scorer.js` ← `tests/coaching/fidelity/fidelity-analyzer.test.js` · `tests/coaching/fidelity/fidelity-scorer.test.js` · `tests/coaching/fidelity/lp-upload-extractor.test.js` · `tests/coaching/fidelity/truncation-inconsistent.test.js`
- `fidelity-session.js` ← `tests/coaching/fidelity/fidelity-session-plan-wait.test.js` · `tests/coaching/fidelity/linked-plan-moves-cache.test.js`
- `grader-prompt.js` ← `tests/coaching/fidelity/fidelity-analyzer.test.js` · `tests/coaching/fidelity/prompt-neutrality.test.js`
- `lesson-plan-text.js` ← `tests/coaching/fidelity/lesson-plan-text.test.js` · `tests/quiz/transcript-quiz-lesson-source.test.js`
- `lp-upload-extractor.js` ← `tests/coaching/fidelity/lp-upload-extractor.test.js`
- `upload-extractor-prompt.js` ← `tests/coaching/fidelity/prompt-neutrality.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.index.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/lesson-plan-fidelity.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/observe/CLAUDE.index.md`? · `tests/quiz/CLAUDE.index.md`?
