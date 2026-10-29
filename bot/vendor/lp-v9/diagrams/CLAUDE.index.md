# diagrams — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/vendor/lp-v9/diagrams -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | Static assets for diagrams, here the OpenMoji pictogram set → `assets/CLAUDE.md` |
| `lib/` | Shared helpers for diagram types: SVG builder, text measure, tokens, pictograms → `lib/CLAUDE.md` |
| `types/` | One module per diagram kind (clock, graph, circuit, molecule, punnett, ...) → `types/CLAUDE.md` |
| `index.js` | Diagram engine entry: renderDiagram(spec) returns an SVG string by dispatching to a registered diagram type |
| `types_manifest.json` | Machine-readable roster of every diagram kind, alias and minimal spec; checked against the live registry by tests |

## Who reads this (all, generated)
- `index.js` ← imported by `bot/shared/services/quiz/transcript-quiz-figure-gates.js:18:b36a893b` · `bot/shared/services/quiz/transcript-quiz-figure.js:32:ac38be60`
- `types_manifest.json` ← imported by `bot/shared/services/quiz/transcript-quiz-figure.js:34:0cde44c6`

## Tests (all, generated)
- `index.js` ← `tests/quiz/base-ten-thousands.test.js` · `tests/quiz/pictogram-school-bag.test.js` · `tests/quiz/pictograms-lesson-objects.test.js` · `tests/quiz/transcript-quiz-figure-adaptive-scale.test.js` · `tests/quiz/transcript-quiz-figure-circle.test.js` · `tests/quiz/transcript-quiz-figure-early-years.test.js` (+8: `python3 kg/kg.py who-reads bot/vendor/lp-v9/diagrams/index.js`)
- `types_manifest.json` ← `tests/quiz/base-ten-thousands.test.js` · `tests/quiz/transcript-quiz-figure-adaptive-scale.test.js` · `tests/quiz/transcript-quiz-figure-early-years.test.js` · `tests/quiz/transcript-quiz-figure-manipulatives.test.js` · `tests/quiz/transcript-quiz-figure-visible-subset.test.js` · `tests/quiz/vendor-lp-v9-no-subprocess.test.js`

## Related (all, generated)
- docs: `bot/vendor/lp-v9/CLAUDE.md`? · `bot/vendor/lp-v9/README.md`?
