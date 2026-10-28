# quiz — Class quizzes: lesson quiz from recording/plan/topic, video quiz, parent quiz, reports
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/quiz kg=5efe6112b6e6 gen=4853db8d8903 overflow=375 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `transcript-quiz-generate.service.js` — worker step: digest, author, validate, key-check, store, hand off
- `transcript-quiz-list.service.js` — the /quiz teacher menu; providers sit in quiz-lesson-providers.js
- `quiz-sources.js` — names every quizzes.quiz_source value and its per-source copy keys
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `providers/` | /quiz lesson providers for lesson plans and typed topics → `providers/CLAUDE.md` |
| `transcript-quiz-generate.service.js` | Worker step after "yes": resolve source, digest, author, validate, key-check, blind solve, store rows, PDF, hand off |
| … | 63 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `quizzes` (written by `quiz-delivery.service.js` (+10)) ← read by `bot/shared/routes/quiz-flow-endpoint.js:224:2c6afb51`? · `bot/shared/services/teacher-state.service.js:145:2c6afb51`? (+20)
- table `lesson_plans` (written by `quiz-scheduler.service.js`) ← read by `bot/shared/database/bot-helpers.js:553:611f2601`? · `bot/shared/routes/quiz-flow-endpoint.js:158:611f2601`? (+19)
- … 122 more → `CLAUDE.index.md`

## Never (human)
- Add quiz_source values only in quiz-sources.js; the quizzes table is shared by several lanes (bot/shared/services/quiz/quiz-sources.js:3)
- Rules a prompt asks for must be enforced in code by the validator, never left to the model (root rule 24c, bot/shared/services/quiz/transcript-quiz-validator.js:7)
- Provider modules must not require the list service; that is a require cycle the circular-deps guard refuses (bot/shared/services/quiz/transcript-lesson-provider.js:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- … 190 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/quiz/CLAUDE.index.md`? · `bot/shared/services/quiz/CLAUDE.md`? · `bot/shared/services/quiz/providers/CLAUDE.index.md`? · `bot/shared/services/quiz/providers/CLAUDE.md`? (+9)
