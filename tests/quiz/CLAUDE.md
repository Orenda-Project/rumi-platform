# quiz — Jest suites for the lesson quiz, class video quiz, figures and quiz PDFs
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/quiz kg=1f8fbb9566a6 gen=a04786a545eb overflow=187 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `transcript-quiz-generate.test.js` — the generate step end to end: author, validate, store, PDF, paced teacher messages
- `transcript-quiz-validator.test.js` — the pure validator that gates every question before rows are stored
- `lesson-quiz-router.test.js` — real webhook payloads showing which handler each tq_ quiz button reaches
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `fixtures/` | → (no door; 3 test files) |
| `helpers/` | Shared stubs and fixtures for quiz suites: Supabase fakes, solver, KaTeX, PDF ink readers → `helpers/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `transcript-quiz-typeset-maths.test.js` | Pins maths being typeset on pictures via quiz-notation and the author, never reaching a phone as TeX source |
| `transcript-quiz-summary-truth.test.js` | Pins that the teacher sheet never presents a mistake made in class as what was taught in the summary lines |
| `transcript-quiz-teacher-language.test.js` | Pins one stored teacher language deciding everything the teacher reads, with no fallback to transcript language |
| … | 187 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `CHANNEL_DRIVER` · `CLASS_CARD_ENABLED` · `DEFAULT_PHONE_COUNTRY_CODE` · `QUIET_HOURS` · `QUIZ_URDU_SPACING_V2` · `TRANSCRIPT_QUIZ_ENABLED`

## Never (human)
- Do not mock the code under test; wiring suites run the real handler and mock only the network boundary (tests/quiz/lesson-quiz-text-wiring.test.js:3)
- Fixture text must be synthetic, since this repo is public (tests/quiz/helpers/g1-numbers-urdu-fixture.js:7)
- Comments in quiz rendering files must use neutral placeholders, enforced by tests/quiz/quiz-comment-hygiene.test.js:3
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? (+23)
