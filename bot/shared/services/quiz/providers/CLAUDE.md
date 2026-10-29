# providers — /quiz lesson providers for lesson plans and typed topics
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/quiz/providers kg=07b98ae0a22a gen=3489dec6f7d2 overflow=7 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `lp-generated.provider.js` — lists recent lesson_plans without a quiz and starts one on tap
- `topic.provider.js` — /quiz on a typed topic: asks, dedups, starts a topic-sourced quiz
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `topic.provider.js` | /quiz on a typed topic: asks for the topic, dedups, and starts a topic-sourced quiz row in quizzes |
| `lp-generated.provider.js` | /quiz lesson provider listing a teacher's recent lesson_plans without a quiz and starting one on tap; writes quizzes |

## Who reads this (generated)
- table `quizzes` (written by `lp-generated.provider.js` (+1)) ← read by `bot/shared/routes/quiz-flow-endpoint.js:224:2c6afb51`? · `bot/shared/services/quiz/quiz-delivery.service.js:35:2c6afb51`? (+20)
- column `quizzes.topic` (written by `lp-generated.provider.js` (+1)) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-delivery.service.js:36:3b04b017` (+14)
- column `quizzes.status` (written by `lp-generated.provider.js` (+1)) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-delivery.service.js:36:3b04b017` (+12)
- column `quizzes.teacher_id` (written by `lp-generated.provider.js` (+1)) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-report.service.js:33:a045eafb` (+10)
- column `quizzes.quiz_source` (written by `lp-generated.provider.js` (+1)) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:162:f6fc603d` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` (+8)
- … 7 more → `CLAUDE.index.md`

## Never (human)
- Providers must register through quiz-lesson-providers.js, one per source; a plan with no text or PDF gets no quiz (bot/shared/services/quiz/providers/lp-generated.provider.js:7-8,56)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/quiz/quiz-lesson-providers.test.js` (lp-generated.provider.js, topic.provider.js)

## Related (generated)
- docs: `bot/shared/services/quiz/CLAUDE.md`?
