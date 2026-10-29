# frameworks — Observation rubrics (OECD, HOTS, Teach, FICO, MEWAKA) and how one is chosen
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/frameworks kg=66935db7605f gen=00a44a43ca75 overflow=16 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `framework-registry.js` — single registry of rubric modules by key
- `framework-selector.js` — user preference, then region default, then env default
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `framework-registry.js` | Lazy registry returning a framework module by key; used by selector and fidelity recompute |
| `hots-framework.js` | HOTS rubric (5 areas, 16 indicators, scale 1-3) with prompts and scoring; used by registry, adapter and observe |
| `teach-framework.js` | World Bank Teach Primary rubric (9 elements, 1-5 scoring plus time on task); used by registry and observe |
| `framework-selector.js` | Picks the observation framework from user preference, region default or env default; called by analysis-processor |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `hots-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/hots-adapter.js:9:a6cc910e` · `bot/shared/services/observe/observe-framework.js:29:908f5abe` (+1)
- `mewaka-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/mewaka-adapter.js:14:159130a0` · `bot/shared/services/observe/observe-framework.js:30:56a95d34` (+1)
- `teach-framework.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/teach-adapter.js:10:8084d2e6` · `bot/shared/services/observe/observe-framework.js:28:248fb8f0` (+1)
- … 4 more → `CLAUDE.index.md`

## Never (human)
- Rubrics must be added only through framework-registry.js, the single source of truth (bot/shared/services/coaching/frameworks/framework-registry.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/framework-registry.test.js` (framework-registry.js, framework-selector.js)
- `tests/coaching/framework-wiring.test.js` (framework-registry.js, framework-selector.js)
- … 9 more → `CLAUDE.index.md`

## Related (generated)
- skills: `coaching`?
- docs: `bot/shared/services/coaching/CLAUDE.md`? · `docs/customization.md`?
