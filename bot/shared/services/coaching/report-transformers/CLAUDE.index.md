# report-transformers — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/report-transformers -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `_shared.js` | Shared date, fidelity-extraction and partial-note helpers for the per-framework report transformers |
| `fico-report-transformer.js` | Maps FICO analysis (5 domains, 1-4 scale) to the generic reportData the PDF renderer consumes |
| `hots-report-transformer.js` | Maps HOTS analysis (5 areas, 1-3 scale) to the generic reportData shape for pdf-report.service |
| `mewaka-report-transformer.js` | Maps MEWAKA analysis to reportData and adds focus area, strengths and domain config for the Swahili PDF |
| `oecd-report-transformer.js` | Maps OECD analysis (goals, criteria, LP bonus, debrief) to reportData; extracted from report-generator |
| `report-transformer-dispatch.js` | Routes a framework key to its report transformer; unknown frameworks fall back to OECD |
| `teach-report-transformer.js` | Maps Teach analysis (3 areas plus time on task, 1-5) to the generic reportData shape for PDF rendering |

## Who reads this (all, generated)
- `_shared.js` ← imported by `bot/shared/services/coaching/report-transformers/fico-report-transformer.js:14:67d49e41` · `bot/shared/services/coaching/report-transformers/hots-report-transformer.js:12:67d49e41` · `bot/shared/services/coaching/report-transformers/mewaka-report-transformer.js:22:86ab6909` · `bot/shared/services/coaching/report-transformers/oecd-report-transformer.js:12:f2e9f787` (+1: `python3 kg/kg.py who-reads _shared.js`)
- `fico-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:14:65440201`
- `hots-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:12:490c950b`
- `mewaka-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:15:1e7cf8a8`
- `oecd-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:11:d8971ea3`
- `report-transformer-dispatch.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:48:f4dbdc25`
- `teach-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:13:10ca1a56`

## Tests (all, generated)
- `_shared.js` ← `tests/coaching/fidelity/fidelity-report.test.js`
- `fico-report-transformer.js` ← `tests/coaching/report-transformers/fico-report-transformer.test.js`
- `hots-report-transformer.js` ← `tests/coaching/hots-framework-alignment.test.js` · `tests/coaching/hots-framework.test.js` · `tests/coaching/report-transformers/hots-report-transformer.test.js`
- `mewaka-report-transformer.js` ← `tests/reports/mewaka-report.test.js`
- `oecd-report-transformer.js` ← `tests/coaching/fidelity/fidelity-report.test.js`
- `report-transformer-dispatch.js` ← `tests/coaching/framework-wiring.test.js` · `tests/coaching/multi-framework-report-integration.test.js` · `tests/reports/mewaka-report.test.js`
- `teach-report-transformer.js` ← `tests/coaching/fidelity/fidelity-report.test.js`

## Related (all, generated)
- docs: `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.index.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/reports/CLAUDE.md`?
