# lib — Shared helpers for diagram types: SVG builder, text measure, tokens, pictograms
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/vendor/lp-v9/diagrams/lib kg=4da4b03962f9 gen=462f107678cc overflow=11 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `svg.js` — builder every diagram type draws with
- `tokens.js` — palette and design tokens
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `svg.js` | Svg builder every diagram type draws with; owns title strip, caption strip and the outer svg element |
| `pictogram.js` | Loads pictograms by noun for early-years types (count_objects, word_blank, pattern, match) and adds attribution |
| `tokens.js` | Design tokens (palette as CSS vars with fallbacks) for diagrams, so brand swaps are config edits |
| `measure.js` | Deterministic text-width measurement from a Helvetica advance table, so layout needs no browser |
| `degenerate.js` | checkDegenerate(svg) flags figures that are geometrically right but teach nothing, such as near-flat slivers |
| `imagesize.js` | Reads width, height and MIME type of JPEG/PNG/GIF/WebP buffers without a dependency, for aspect ratios |
| `tex.js` | Verbatim copy of shared/utils/tex-to-unicode so the vendored tree stays hermetic |

## Who reads this (generated)
- `svg.js` ← imported by `bot/shared/services/quiz/transcript-quiz-figure-gates.js:17:1d566be0` · `bot/vendor/lp-v9/diagrams/types/chem_equation.js:25:2648d588` (+28)
- `pictogram.js` ← imported by `bot/shared/services/quiz/transcript-quiz-author.service.js:17:8a3298ef` · `bot/shared/services/quiz/transcript-quiz-rewrite.js:822:8a3298ef` (+6)
- `tokens.js` ← imported by `bot/shared/services/quiz/transcript-quiz-figure.js:33:2dea0e22` · `bot/vendor/lp-v9/diagrams/types/flow.js:16:3e2a839f` (+5)
- `measure.js` ← imported by `bot/vendor/lp-v9/diagrams/index.js:124:e8130734` · `bot/vendor/lp-v9/diagrams/types/numberline.js:14:3f94a543` (+2)
- … 3 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/quiz/pictogram-school-bag.test.js` (pictogram.js)
- `tests/quiz/pictograms-lesson-objects.test.js` (pictogram.js)
- … 8 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/vendor/lp-v9/diagrams/CLAUDE.md`?
