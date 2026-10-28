# report-v2 — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/report-v2 -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `score-adapters/` | Per-framework adapters turning analysis_data into hero scorecard groups → `score-adapters/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `hero-report.service.js` | Orchestrates the hero report: score adapter, narrative, trend, template, PNG plus caption; used by registry and observe |
| `hero-report.template.js` | HTML template of the one-page hero coaching report with embedded fonts, RTL-aware, no network at render |
| `narrative.service.js` | One LLM pass writing the celebration narrative (moment, strength, horizon) for the hero report |
| `score-adapter.service.js` | Normalises any framework's analysis_data into one ScoreViewModel for the hero template |

## Who reads this (all, generated)
- `hero-report.service.js` ← imported by `bot/shared/services/coaching/report-renderers/renderer-registry.js:48:35f8be35` · `bot/shared/services/observe/observe-send.service.js:631:6179311a`
- `hero-report.template.js` ← imported by `scripts/render-sample-report.js:25:cabfbec2` · `bot/shared/services/coaching/report-v2/hero-report.service.js:14:1db96725`
- `narrative.service.js` ← imported by `bot/shared/services/coaching/report-v2/hero-report.service.js:13:47a90ca2`
- `score-adapter.service.js` ← imported by `bot/shared/services/coaching/report-v2/hero-report.service.js:12:30c9abce`

## Tests (all, generated)
- `hero-report.service.js` ← `tests/coaching/hero-report-scoreless.test.js`
- `narrative.service.js` ← `tests/coaching/hero-narrative-corpus.test.js`
- `score-adapter.service.js` ← `tests/coaching/score-adapters.test.js`

## Related (all, generated)
- docs: `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/coaching/CLAUDE.index.md`?
