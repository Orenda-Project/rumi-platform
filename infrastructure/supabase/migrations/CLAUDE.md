# migrations — Versioned V<major.minor.patch>__name.sql changes for existing deployments
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=infrastructure/supabase/migrations kg=4cb0188faa1a gen=2572b89d8a18 overflow=51 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `V1.0.0__baseline.sql` — creates schema_versions
- `V2.7.0__exec_sql_service_role_only.sql` — locks down exec_sql
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |
| `V2*` | 10 files; most used `V2.9.0__lesson_quiz.sql`: Adds quizzes.coaching_session_id/language/meta, extra statuses and quiz_share_codes.teacher_to for lesson quizzes |
| `V1.0.0__baseline.sql` | Baseline marker migration: creates schema_versions; the full schema lives in 00_complete-schema.sql |

## Who reads this (generated)
- table `coaching_sessions` whole row (`*`) (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+14)
- column `coaching_sessions.observer_user_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-capture.service.js:183:6d26d258` · `bot/shared/services/observe/observe-debrief.service.js:119:2df9e8f4` (+6)
- column `coaching_sessions.observation_type` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/coaching/own-coaching.js:38:eb90e6da` · `bot/shared/services/observe/observe-brief-card.js:38:49f65bf4` (+5)
- column `quizzes.language` (written by `V2.9.0__lesson_quiz.sql`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` (+5)
- … 51 more → `CLAUDE.index.md`

## Never (human)
- Never write non-idempotent migrations; they must be safe to re-run (V2.9.0__lesson_quiz.sql:16)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `SETUP.md`? · `docs/CLAUDE.index.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/attendance.md`? · `docs/features/lesson-quiz.md`? (+8)
