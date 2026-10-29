# report-transformers — Per-framework analysis to generic reportData for the PDF renderers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/report-transformers kg=966cf6b217db gen=b14140841918 overflow=12 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `report-transformer-dispatch.js` — framework key to transformer; unknown falls back to OECD
- `_shared.js` — fidelity extraction and date helpers shared by all
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `_shared.js` | Shared date, fidelity-extraction and partial-note helpers for the per-framework report transformers |
| `hots-report-transformer.js` | Maps HOTS analysis (5 areas, 1-3 scale) to the generic reportData shape for pdf-report.service |
| `report-transformer-dispatch.js` | Routes a framework key to its report transformer; unknown frameworks fall back to OECD |
| `fico-report-transformer.js` | Maps FICO analysis (5 domains, 1-4 scale) to the generic reportData the PDF renderer consumes |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `_shared.js` ← imported by `bot/shared/services/coaching/report-transformers/fico-report-transformer.js:14:67d49e41` · `bot/shared/services/coaching/report-transformers/hots-report-transformer.js:12:67d49e41` (+3)
- `fico-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:14:65440201`
- `hots-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:12:490c950b`
- `mewaka-report-transformer.js` ← imported by `bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:15:1e7cf8a8`
- … 3 more → `CLAUDE.index.md`

## Never (human)
- Unknown frameworks must keep falling back to OECD (bot/shared/services/coaching/report-transformers/report-transformer-dispatch.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/fidelity/fidelity-report.test.js` (_shared.js, oecd-report-transformer.js, teach-report-transformer.js)
- `tests/reports/mewaka-report.test.js` (mewaka-report-transformer.js, report-transformer-dispatch.js)
- … 6 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`?
