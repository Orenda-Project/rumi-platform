# fidelity — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/coaching/fidelity -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `_fake-db.js` | In-memory supabase-js query-builder fake for the fidelity suites (select/eq/in/or/order/limit, update/insert) |
| `analysis-processor-fidelity.test.js` | Pins the coaching analysis job running LP fidelity as a non-blocking task and persisting analysis_data.lp_fidelity |
| `classroom-audio-threshold.test.js` | Pins COACHING_MIN_AUDIO_SECONDS: default 900s, overridable, junk or sub-minute values fall back to 900 |
| `coaching-flow-wiring.test.js` | Pins routing order in whatsapp-bot and the text handler: photo buttons, plan picker, pasted plan before generic paths |
| `coaching-without-object-storage.test.js` | Pins classroom coaching working without R2: audio unarchived, voice note sent from memory, no S3 client built |
| `diarization-contract.test.js` | Pins audio.service's diarized branch writing one [MM:SS] stamp per speaker turn, counted, with Soniox mocked at HTTP |
| `enhance-keeps-lp-fidelity.test.js` | Pins the reflections "enhance" rewrite never touching lp_fidelity, which comes back byte-identical |
| `fico-hook-recompute.test.js` | Pins FICO applyLpFidelity on recompute keeping the model's original indicator 1.2 score and restoring when unmeasured |
| `fidelity-analyzer.test.js` | Pins the LP-fidelity grader call shape and parsing: retry once on untrusted output, model override (LLM mocked) |
| `fidelity-feature-entry.test.js` | Pins the lp_fidelity FEATURES entry gated on SONIOX_API_KEY plus LP_FIDELITY_ENABLED, shown by doctor and console |
| `fidelity-orchestrator.test.js` | Pins computeLpFidelity never throwing and returning a distinct status per failure (no plan, no timings, unreadable) |
| `fidelity-preflight.test.js` | Pins describeRecording: [MM:SS] stamp count and transcript-ends-short-of-audio flag, as pure telemetry |
| `fidelity-recompute.test.js` | Pins late-plan recovery regrading only fidelity, and the gate that keeps no-percentage blobs recomputable |
| `fidelity-report.test.js` | Pins the fidelity report block and chat line, with distinct wording per outcome state, never a percentage |
| `fidelity-scorer.test.js` | Pins the deterministic fidelity scorer: credit map, bounds, substitution credit, denominator and band |
| `fidelity-session-plan-wait.test.js` | Pins the analysis's fidelity task waiting (LP_FIDELITY_PLAN_WAIT_SECONDS) for an uploaded plan still being read |
| `lesson-plan-text.test.js` | Pins planTextFromRow turning a Rumi-made lesson_plans row into plan text, with content flattening fallback |
| `linked-plan-moves-cache.test.js` | Pins one cached move list per Rumi-made plan (content.fidelity_moves by text hash) so the denominator cannot drift |
| `lp-extraction-writes-plan-text.test.js` | Pins the extraction worker storing full lesson_plan_text and triggering a fidelity recompute when read late |
| `lp-generation-stores-plan-text.test.js` | Pins LP generation storing the delivered PDF's text as content.plan_text so a picked plan can be graded |
| `lp-step-flow.test.js` | Pins the coaching flow's photo buttons to lesson-plan step, plan picker, upload/paste/none, and fidelity-off Yes/No |
| `lp-upload-extractor.test.js` | Pins the plan-to-moves extractor: JSON-mode call, tag normalisation, lp_unparseable on no text (LLM mocked) |
| `pdf-fidelity-table.test.js` | Pins the coaching PDF drawing the fidelity band, count and per-move table, with a PDFKit recording fake |
| `prompt-neutrality.test.js` | Pins grader/extractor prompts naming no language pair, gender or organisation template, keeping calibrated rules |
| `report-sends-fidelity-line.test.js` | Pins generateReport sending one fidelity chat line after the report, its own line per state, none when flag off |
| `review-guards.test.js` | Pins review guards: single voice download, photo limit leads to plan step, enhance cannot invent lp_fidelity |
| `truncation-inconsistent.test.js` | Pins claimsTruncation recognising the grader's own end-of-recording notes, flagging only without changing scores |
| `voice-speaks-band.test.js` | Pins the voice debrief speaking the fidelity band in words, with every number removed from its payload |

## Who reads this (all, generated)
- env `COACHING_MIN_AUDIO_SECONDS` read at `tests/coaching/fidelity/classroom-audio-threshold.test.js:13:4b657509`
- env `LP_FIDELITY_BAND_HIGH` read at `tests/coaching/fidelity/fidelity-scorer.test.js:132:5f3cfdcb`
- env `LP_FIDELITY_BAND_PARTIAL` read at `tests/coaching/fidelity/fidelity-scorer.test.js:132:5f3cfdcb`
- env `LP_FIDELITY_ENABLED` read at `tests/coaching/fidelity/analysis-processor-fidelity.test.js:82:afb244b3` · `tests/coaching/fidelity/fidelity-feature-entry.test.js:35:afb244b3` · `tests/coaching/fidelity/fidelity-orchestrator.test.js:180:e689cdf6` · `tests/coaching/fidelity/fidelity-recompute.test.js:44:afb244b3` · `tests/coaching/fidelity/lp-extraction-writes-plan-text.test.js:39:afb244b3` · `tests/coaching/fidelity/lp-step-flow.test.js:52:afb244b3` · `tests/coaching/fidelity/review-guards.test.js:50:afb244b3`
- env `TEMP_DIR` read at `tests/coaching/fidelity/lp-generation-stores-plan-text.test.js:43:95669f01`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.index.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.index.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.index.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/CLAUDE.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.md`?
