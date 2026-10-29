# fidelity — Tests for lesson-plan fidelity: extract moves, grade recording, score, report
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/coaching/fidelity kg=d542f13a24c3 gen=788d92327cc1 overflow=12 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `fidelity-orchestrator.test.js` — plan to moves to verdicts to score; failures come back as statuses
- `fidelity-scorer.test.js` — deterministic scoring, no LLM arithmetic
- `_fake-db.js` — in-memory supabase-js fake these suites share
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lp*` | 4 files; most used `lp-step-flow.test.js`: Pins the coaching flow's photo buttons to lesson-plan step, plan picker, upload/paste/none, and fidelity-off Yes/No |
| `review-guards.test.js` | Pins review guards: single voice download, photo limit leads to plan step, enhance cannot invent lp_fidelity |
| `_fake-db.js` | In-memory supabase-js query-builder fake for the fidelity suites (select/eq/in/or/order/limit, update/insert) |
| `diarization-contract.test.js` | Pins audio.service's diarized branch writing one [MM:SS] stamp per speaker turn, counted, with Soniox mocked at HTTP |
| `coaching-without-object-storage.test.js` | Pins classroom coaching working without R2: audio unarchived, voice note sent from memory, no S3 client built |
| `report-sends-fidelity-line.test.js` | Pins generateReport sending one fidelity chat line after the report, its own line per state, none when flag off |
| … | 22 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Fidelity is non-blocking: any failure returns a distinct status, never a throw (tests/coaching/fidelity/fidelity-orchestrator.test.js)
- The voice debrief speaks the band in words, never a percentage (tests/coaching/fidelity/voice-speaks-band.test.js:3)
- lp_fidelity must come out of the enhance rewrite byte-identical (tests/coaching/fidelity/enhance-keeps-lp-fidelity.test.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/database/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? (+1)
