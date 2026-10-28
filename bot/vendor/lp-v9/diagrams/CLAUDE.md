# diagrams — Registry of diagram kinds, each drawing an SVG from a small JSON spec
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/vendor/lp-v9/diagrams kg=d0e9b7939ca4 gen=649b40b240f5 overflow=9 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `index.js` — dispatch and the renderDiagram contract
- `types_manifest.json` — roster of kinds and minimal specs
- `types/` — one file per diagram kind
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `assets/` | Static assets for diagrams, here the OpenMoji pictogram set → `assets/CLAUDE.md` |
| `lib/` | Shared helpers for diagram types: SVG builder, text measure, tokens, pictograms → `lib/CLAUDE.md` |
| `types/` | One module per diagram kind (clock, graph, circuit, molecule, punnett, ...) → `types/CLAUDE.md` |
| `index.js` | Diagram engine entry: renderDiagram(spec) returns an SVG string by dispatching to a registered diagram type |
| `types_manifest.json` | Machine-readable roster of every diagram kind, alias and minimal spec; checked against the live registry by tests |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- `index.js` ← imported by `bot/shared/services/quiz/transcript-quiz-figure-gates.js:18:b36a893b` · `bot/shared/services/quiz/transcript-quiz-figure.js:32:ac38be60`
- `types_manifest.json` ← imported by `bot/shared/services/quiz/transcript-quiz-figure.js:34:0cde44c6`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/quiz/base-ten-thousands.test.js` (index.js, types_manifest.json)
- `tests/quiz/transcript-quiz-figure-adaptive-scale.test.js` (index.js, types_manifest.json)
- `tests/quiz/transcript-quiz-figure-early-years.test.js` (index.js, types_manifest.json)
- `tests/quiz/transcript-quiz-figure-manipulatives.test.js` (index.js, types_manifest.json)
- `tests/quiz/transcript-quiz-figure-visible-subset.test.js` (index.js, types_manifest.json)
- … 9 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/vendor/lp-v9/CLAUDE.md`? · `bot/vendor/lp-v9/README.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.index.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/assets/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/lib/CLAUDE.index.md`? (+4)
