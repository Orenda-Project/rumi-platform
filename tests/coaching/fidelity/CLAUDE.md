# fidelity — Tests for lesson-plan fidelity: extract moves, grade recording, score, report
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/coaching/fidelity kg=2dffaeacdfe3 gen=7f0bd70ebc69 overflow=14 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `fidelity-orchestrator.test.js` — plan to moves to verdicts to score; failures come back as statuses
- `fidelity-scorer.test.js` — deterministic scoring, no LLM arithmetic
- `_fake-db.js` — in-memory supabase-js fake these suites share
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lp*` | 4 files; most used `lp-step-flow.test.js`: Pins the coaching flow's photo buttons to lesson-plan step, plan picker, upload/paste/none, and fidelity-off Yes/No |
| `CLAUDE.index.md` | (unmapped) |
| `review-guards.test.js` | Pins review guards: single voice download, photo limit leads to plan step, enhance cannot invent lp_fidelity |
| `_fake-db.js` | In-memory supabase-js query-builder fake for the fidelity suites (select/eq/in/or/order/limit, update/insert) |
| `diarization-contract.test.js` | Pins audio.service's diarized branch writing one [MM:SS] stamp per speaker turn, counted, with Soniox mocked at HTTP |
| `coaching-without-object-storage.test.js` | Pins classroom coaching working without R2: audio unarchived, voice note sent from memory, no S3 client built |
| … | 14 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `COACHING_MIN_AUDIO_SECONDS` · `LP_FIDELITY_BAND_HIGH` · `LP_FIDELITY_BAND_PARTIAL` · `LP_FIDELITY_ENABLED` · `TEMP_DIR`

## Never (human)
- Fidelity is non-blocking: any failure returns a distinct status, never a throw (tests/coaching/fidelity/fidelity-orchestrator.test.js)
- The voice debrief speaks the band in words, never a percentage (tests/coaching/fidelity/voice-speaks-band.test.js:3)
- lp_fidelity must come out of the enhance rewrite byte-identical (tests/coaching/fidelity/enhance-keeps-lp-fidelity.test.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? (+16)
