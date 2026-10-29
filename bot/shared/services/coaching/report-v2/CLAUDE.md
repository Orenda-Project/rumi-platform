# report-v2 — Hero coaching report image: score view model, narrative, template, PNG

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/report-v2 kg=af3b9ffe6237 gen=64410a79a55a overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `hero-report.service.js` — orchestrates adapter, narrative, trend and template
- `score-adapter.service.js` — normalises any framework into one view model
- `score-adapters/dispatch.js` — add a framework's adapter with one line
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `score-adapters/` | Per-framework adapters turning analysis_data into hero scorecard groups → `score-adapters/CLAUDE.md` |
| `hero-report.service.js` | Orchestrates the hero report: score adapter, narrative, trend, template, PNG plus caption; used by registry and observe |
| `hero-report.template.js` | HTML template of the one-page hero coaching report with embedded fonts, RTL-aware, no network at render |
| `narrative.service.js` | One LLM pass writing the celebration narrative (moment, strength, horizon) for the hero report |
| `score-adapter.service.js` | Normalises any framework's analysis_data into one ScoreViewModel for the hero template |

## Who reads this (generated)
- `hero-report.service.js` ← imported by `bot/shared/services/coaching/report-renderers/renderer-registry.js:48:35f8be35` · `bot/shared/services/observe/observe-send.service.js:631:6179311a`
- `hero-report.template.js` ← imported by `scripts/render-sample-report.js:25:cabfbec2` · `bot/shared/services/coaching/report-v2/hero-report.service.js:14:1db96725`
- `narrative.service.js` ← imported by `bot/shared/services/coaching/report-v2/hero-report.service.js:13:47a90ca2`
- `score-adapter.service.js` ← imported by `bot/shared/services/coaching/report-v2/hero-report.service.js:12:30c9abce`

## Never (human)
- The narrative pass must not produce try_next; the commitment-card action is the single next step (bot/shared/services/coaching/report-v2/narrative.service.js:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/hero-narrative-corpus.test.js` (narrative.service.js)
- `tests/coaching/hero-report-scoreless.test.js` (hero-report.service.js)
- `tests/coaching/score-adapters.test.js` (score-adapter.service.js)

## Related (generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`? · `docs/customization.md`?
