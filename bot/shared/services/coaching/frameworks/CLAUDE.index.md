# frameworks — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/frameworks -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `fico-framework.js` | FICO observation rubric (5 domains, 21 indicators, scale 1-4) with prompts and LP-fidelity mapping hook |
| `framework-registry.js` | Lazy registry returning a framework module by key; used by selector and fidelity recompute |
| `framework-selector.js` | Picks the observation framework from user preference, region default or env default; called by analysis-processor |
| `hots-framework.js` | HOTS rubric (5 areas, 16 indicators, scale 1-3) with prompts and scoring; used by registry, adapter and observe |
| `mewaka-framework.js` | Tanzanian MEWAKA CPD rubric (6 domains, 25 indicators, scale 0-3) in English and Swahili |
| `oecd-framework.js` | OECD high-quality-teaching rubric (default framework) extracted from gpt5-mini for multi-framework use |
| `teach-framework.js` | World Bank Teach Primary rubric (9 elements, 1-5 scoring plus time on task); used by registry and observe |

## Who reads this (all, generated)
- `fico-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/fico-adapter.js:9:43d8e647` · `bot/shared/services/coaching/frameworks/framework-registry.js:18:56ca4420`
- `framework-registry.js` ← imported by `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:49:195fa206` · `bot/shared/services/coaching/frameworks/framework-selector.js:21:49aa8acd`
- `framework-selector.js` ← imported by `bot/shared/services/coaching/analysis-processor.service.js:21:aeea2696`
- `hots-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/hots-adapter.js:9:a6cc910e` · `bot/shared/services/observe/observe-framework.js:29:908f5abe` · `bot/shared/services/coaching/frameworks/framework-registry.js:16:b63c8eac`
- `mewaka-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/mewaka-adapter.js:14:159130a0` · `bot/shared/services/observe/observe-framework.js:30:56a95d34` · `bot/shared/services/coaching/frameworks/framework-registry.js:19:7318445b`
- `oecd-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/oecd-adapter.js:10:6fddfa12` · `bot/shared/services/coaching/frameworks/framework-registry.js:15:a3ede969`
- `teach-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/teach-adapter.js:10:8084d2e6` · `bot/shared/services/observe/observe-framework.js:28:248fb8f0` · `bot/shared/services/coaching/frameworks/framework-registry.js:17:283df1bd`

## Tests (all, generated)
- `fico-framework.js` ← `tests/coaching/fico-framework.test.js` · `tests/coaching/fidelity/fico-hook-recompute.test.js`
- `framework-registry.js` ← `tests/coaching/fidelity/analysis-processor-fidelity.test.js` · `tests/coaching/framework-registry.test.js` · `tests/coaching/framework-wiring.test.js`
- `framework-selector.js` ← `tests/coaching/framework-registry.test.js` · `tests/coaching/framework-wiring.test.js`
- `hots-framework.js` ← `tests/coaching/hots-framework-alignment.test.js` · `tests/coaching/hots-framework.test.js`
- `oecd-framework.js` ← `tests/coaching/analyze-pedagogy-framework-dispatch.test.js` · `tests/coaching/oecd-framework.test.js`
- `teach-framework.js` ← `tests/coaching/teach-framework.test.js` · `tests/observe/observe-plumbing.test.js`

## Related (all, generated)
- skills: `coaching`?
- docs: `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.index.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/observe/CLAUDE.index.md`?
