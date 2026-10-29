# database — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/database -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `migrations/` | SQL migrations adding bot tables and columns, run manually against Supabase → `migrations/CLAUDE.md` |
| `SCHEMA_GUIDE.md` | Plain-language tour of the v3.0 table set for non-engineers; a dated Nov 2025 snapshot, not the live schema |
| `SESSION_MIGRATION_GUIDE.md` | Explains the v3.1.0 chat_sessions change (30-minute timeout) that migration 001 introduced; historical note |
| `schema.sql` | Original v3.0 base schema (users, conversations, etc.) from Nov 2025; superseded by the canonical infrastructure schema |

## Who reads this (all, generated)
- column `conversations.content` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:120:830013e4` · `dashboard/services/wordcloud.service.js:65:5778b00e`
- column `conversations.created_at` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:454:e8356999` · `bot/shared/database/queries.js:71:324e62ac` · `bot/shared/handlers/text-message.handler.js:1985:e8356999` · `bot/shared/handlers/voice-message.handler.js:1030:e8356999` (+8: `python3 kg/kg.py who-reads conversations.created_at`)
- column `conversations.id` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:120:830013e4` · `bot/shared/services/menu.service.js:409:c4cc30e2` · `bot/shared/services/reading-assessment.service.js:126:c4cc30e2`
- column `conversations.message_type` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:28:bd0e9309` · `dashboard/database/queries.js:703:94eac64b`
- column `conversations.role` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:27:33d81df3` · `bot/shared/utils/telemetry.js:91:33d81df3` · `dashboard/database/queries.js:702:33d81df3` · `dashboard/services/wordcloud.service.js:66:33d81df3`
- column `conversations.user_id` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:453:219f5683` · `bot/shared/database/queries.js:69:aa3d7725` · `bot/shared/handlers/text-message.handler.js:1983:a819c701` · `bot/shared/handlers/voice-message.handler.js:1028:a819c701` (+8: `python3 kg/kg.py who-reads conversations.user_id`)
- column `lesson_plans.content` (written by `schema.sql`) ← read by `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/quiz/quiz-orchestrator.service.js:227:15e5b797` (+1: `python3 kg/kg.py who-reads lesson_plans.content`)
- column `lesson_plans.created_at` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:31:d69ad1fa` · `bot/shared/services/coaching/report-generator.service.js:370:e8356999` (+10: `python3 kg/kg.py who-reads lesson_plans.created_at`)
- column `lesson_plans.gamma_url` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `dashboard/routes/portal.routes.js:746:ca3fb650`
- column `lesson_plans.grade` (written by `schema.sql`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:31:d69ad1fa` (+5: `python3 kg/kg.py who-reads lesson_plans.grade`)
- column `lesson_plans.id` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/fidelity-session.js:56:58e633e9` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` (+13: `python3 kg/kg.py who-reads lesson_plans.id`)
- column `lesson_plans.subject` (written by `schema.sql`) ← read by `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` · `bot/shared/services/quiz/quiz-orchestrator.service.js:227:15e5b797` · `bot/shared/services/quiz/quiz-scheduler.service.js:24:8a8c6d5b` (+3: `python3 kg/kg.py who-reads lesson_plans.subject`)
- column `lesson_plans.topic` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service.js:99:15e5b797` (+7: `python3 kg/kg.py who-reads lesson_plans.topic`)
- column `lesson_plans.type` (written by `schema.sql`) ← read by `bot/shared/services/coaching/lp-coaching/lp-step.service.js:33:e125cbb9` · `dashboard/database/queries.js:718:e125cbb9` · `dashboard/routes/portal.routes.js:746:ca3fb650`
- column `lesson_plans.user_id` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:555:219f5683` · `bot/shared/routes/quiz-flow-endpoint.js:160:219f5683` · `bot/shared/services/coaching/lp-coaching/lp-step.service.js:32:219f5683` · `bot/shared/services/coaching/report-generator.service.js:369:3e703e26` (+10: `python3 kg/kg.py who-reads lesson_plans.user_id`)
- column `schema_versions.version` (written by `schema.sql`) ← read by `infrastructure/scripts/migrate.js:87:9e9cfc5f`
- column `users.created_at` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `dashboard/database/queries.js:688:06c5e28d`
- column `users.grade` (written by `schema.sql`) ← read by `bot/shared/services/pic-to-lp/completion-handler.service.js:51:1cb9ba93`
- column `users.id` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/bot-helpers.js:30:4da212da` (+49: `python3 kg/kg.py who-reads users.id`)
- column `users.name` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` (+13: `python3 kg/kg.py who-reads users.name`)
- column `users.phone_number` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/bot-helpers.js:19:6b9ae1f2` (+32: `python3 kg/kg.py who-reads users.phone_number`)
- column `users.registration_completed` (written by `schema.sql`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/feature-registration.service.js:166:50676655` · `bot/shared/services/limits/daily-caps.js:175:d8f97c3d` (+5: `python3 kg/kg.py who-reads users.registration_completed`)
- table `conversations` whole row (`*`) (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:452:d2b02c3e`? · `dashboard/database/queries.js:694:7a0c163a`?
- table `lesson_plans` whole row (`*`) (written by `schema.sql`) ← read by `bot/shared/services/feature-registration.service.js:224:7a0c163a`? · `bot/shared/utils/telemetry.js:106:7a0c163a`? · `dashboard/database/queries.js:717:7a0c163a`?
- table `users` whole row (`*`) (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `schema_versions` (written by `schema.sql`) ← read by `infrastructure/scripts/migrate.js:86:b151663b`?

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/CLAUDE.md`?
