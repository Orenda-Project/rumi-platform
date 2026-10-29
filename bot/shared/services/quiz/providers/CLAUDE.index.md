# providers — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/quiz/providers -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `lp-generated.provider.js` | /quiz lesson provider listing a teacher's recent lesson_plans without a quiz and starting one on tap; writes quizzes |
| `topic.provider.js` | /quiz on a typed topic: asks for the topic, dedups, and starts a topic-sourced quiz row in quizzes |

## Who reads this (all, generated)
- `lp-generated.provider.js` ← imported by `bot/shared/services/quiz/quiz-lesson-providers.js:39:f7918fed`
- `topic.provider.js` ← imported by `bot/shared/handlers/text-message.handler.js:848:3e444f7b` · `bot/shared/services/quiz/transcript-quiz-list.service.js:34:c9c292c9`
- column `quizzes.grade` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/services/quiz/quiz-delivery.service.js:36:3b04b017` · `bot/shared/services/quiz/quiz-follow-up.service.js:73:b866cf07` · `bot/shared/services/quiz/quiz-report.service.js:33:a045eafb` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` (+3: `python3 kg/kg.py who-reads quizzes.grade`)
- column `quizzes.language` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:526:33377960` (+3: `python3 kg/kg.py who-reads quizzes.language`)
- column `quizzes.lesson_plan_id` (written by `lp-generated.provider.js`) ← read by `bot/shared/services/quiz/quiz-insight.service.js:166:be1cbc63` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523`
- column `quizzes.meta` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1578:f43d3314` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:294:b040fb66` (+3: `python3 kg/kg.py who-reads quizzes.meta`)
- column `quizzes.quiz_source` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:162:f6fc603d` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:274:23ea01cf` (+6: `python3 kg/kg.py who-reads quizzes.quiz_source`)
- column `quizzes.status` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-delivery.service.js:36:3b04b017` · `bot/shared/services/quiz/quiz-orchestrator.service.js:311:5c97f326` · `bot/shared/services/quiz/quiz-report.service.js:33:a045eafb` (+10: `python3 kg/kg.py who-reads quizzes.status`)
- column `quizzes.subject` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/services/quiz/quiz-follow-up.service.js:73:b866cf07` · `bot/shared/services/quiz/quiz-report.service.js:33:a045eafb` · `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` (+5: `python3 kg/kg.py who-reads quizzes.subject`)
- column `quizzes.teacher_id` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-report.service.js:33:a045eafb` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` (+8: `python3 kg/kg.py who-reads quizzes.teacher_id`)
- column `quizzes.topic` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:225:98889254` · `bot/shared/services/quiz/quiz-delivery.service.js:36:3b04b017` · `bot/shared/services/quiz/quiz-follow-up.service.js:73:b866cf07` · `bot/shared/services/quiz/quiz-orchestrator.service.js:311:5c97f326` (+12: `python3 kg/kg.py who-reads quizzes.topic`)
- table `quizzes` (written by `lp-generated.provider.js`, `topic.provider.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:224:2c6afb51`? · `bot/shared/services/quiz/quiz-delivery.service.js:35:2c6afb51`? · `bot/shared/services/quiz/quiz-follow-up.service.js:71:2c6afb51`? · `bot/shared/services/quiz/quiz-generation.service.js:44:2c6afb51`? (+18: `python3 kg/kg.py who-reads quizzes`)

## Tests (all, generated)
- `lp-generated.provider.js` ← `tests/quiz/quiz-lesson-providers.test.js`
- `topic.provider.js` ← `tests/quiz/quiz-lesson-providers.test.js`

## Related (all, generated)
- docs: `bot/shared/services/quiz/CLAUDE.md`?
