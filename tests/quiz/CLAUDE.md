# quiz — Jest suites for the lesson quiz, class video quiz, figures and quiz PDFs
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/quiz kg=247d4cb7bc5a gen=7ab60e4b4cca overflow=185 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `transcript-quiz-generate.test.js` — the generate step end to end: author, validate, store, PDF, paced teacher messages
- `transcript-quiz-validator.test.js` — the pure validator that gates every question before rows are stored
- `lesson-quiz-router.test.js` — real webhook payloads showing which handler each tq_ quiz button reaches
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `fixtures/` | → (no door; 3 files: 0 test + 3 support) |
| `helpers/` | Shared stubs and fixtures for quiz suites: Supabase fakes, solver, KaTeX, PDF ink readers → `helpers/CLAUDE.md` |
| `__snapshots__/` | → (not mapped: excluded; 1 files) |
| `transcript-quiz-typeset-maths.test.js` | Pins maths being typeset on pictures via quiz-notation and the author, never reaching a phone as TeX source |
| `transcript-quiz-summary-truth.test.js` | Pins that the teacher sheet never presents a mistake made in class as what was taught in the summary lines |
| `transcript-quiz-teacher-language.test.js` | Pins one stored teacher language deciding everything the teacher reads, with no fallback to transcript language |
| `plan*` | 8 files; most used `plan-quiz-key-check.test.js`: Pins plan-quiz-key-check.service: a key contradicting the lesson plan is rewritten or dropped, never shipped |
| … | 204 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Do not mock the code under test; wiring suites run the real handler and mock only the network boundary (tests/quiz/lesson-quiz-text-wiring.test.js:3)
- Fixture text must be synthetic, since this repo is public (tests/quiz/helpers/g1-numbers-urdu-fixture.js:7)
- Comments in quiz rendering files must use neutral placeholders, enforced by tests/quiz/quiz-comment-hygiene.test.js:3
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/quiz/providers/CLAUDE.md`? · `bot/shared/templates/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/lib/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/types/CLAUDE.md`? (+1)
