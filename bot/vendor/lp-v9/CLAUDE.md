# lp-v9 — Diagram engine that draws lesson-quiz figures, plus font and rich-text helpers

<!-- kg:meta repo=rumi-platform dir=bot/vendor/lp-v9 kg=7bced9853066 gen=c4aa9971f191 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `diagrams/index.js` — renderDiagram(spec) entry
- `lib/fonts.js` — font embedding for rendered HTML
- `README.md` — licences and the only consumer
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `diagrams/` | Registry of diagram kinds, each drawing an SVG from a small JSON spec → `diagrams/CLAUDE.md` |
| `fonts/` | → (no door; 4 files) |
| `lib/` | → (no door; 2 files) |
| `README.md` | Explains lp-v9, the first-party diagram engine used only by the lesson quiz, and its third-party fonts and pictograms |

## Who reads this (generated)
- (none)

## Never (human)
- Nothing under this tree may require bot/shared; it stays re-vendorable (diagrams/lib/tex.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/vendor/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/assets/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/assets/pictograms/ATTRIBUTION.md`? · `bot/vendor/lp-v9/diagrams/assets/pictograms/CLAUDE.md`? · `docs/features/lesson-quiz.md`?
