# score-adapters — Per-framework adapters turning analysis_data into hero scorecard groups

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/report-v2/score-adapters kg=97425df56698 gen=a91076024cae overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `dispatch.js` — routes a framework key to its adapter, empty scorecard if unknown
- `oecd-adapter.js` — goal-level groups from goalN_total, the pattern to copy
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `dispatch.js` | Routes a framework key to its score-adapter, with an empty scorecard for unknown frameworks |
| `teach-adapter.js` | Builds the 3 Teach areas plus Time on Task groups (scale 1-5) for the hero scorecard |
| `fico-adapter.js` | Builds the 5 FICO domain groups (scale 1-4) for the hero scorecard |
| `hots-adapter.js` | Builds the 5 HOTS area groups (scale 1-3) for the hero scorecard |
| `mewaka-adapter.js` | Builds the 6 MEWAKA domain groups, with Swahili display names, for the hero scorecard |
| `oecd-adapter.js` | Builds the 5 OECD goal groups from goalN_total scores for the hero scorecard |

## Who reads this (generated)
- `dispatch.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapter.service.js:23:25bde1fe`
- `fico-adapter.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:18:0e2e3e52`
- `hots-adapter.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:16:e71b22d3`
- `mewaka-adapter.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:19:c27f8f87`
- `oecd-adapter.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:15:f32d85b5`
- `teach-adapter.js` ← imported by `bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:17:3c9fa161`

## Never (human)
- A framework adapter must be added as one line in dispatch.js (bot/shared/services/coaching/report-v2/score-adapters/dispatch.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/score-adapters.test.js` (dispatch.js)
- `tests/observe/observe-framework-pack.test.js` (teach-adapter.js)

## Related (generated)
- docs: `bot/shared/services/coaching/report-v2/CLAUDE.md`? · `docs/customization.md`? · `docs/features/coaching.md`?
