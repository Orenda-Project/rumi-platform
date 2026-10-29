# database — Reference SQL for a bot database: an old base schema plus hand-run migrations
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/database kg=9b635649c501 gen=0448865ee3c0 overflow=21 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `migrations/` — numbered and unnumbered .sql files, applied by hand in the SQL editor
- `schema.sql` — v3.0 base schema (9 tables); a Nov 2025 snapshot, not the full current schema
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `migrations/` | SQL migrations adding bot tables and columns, run manually against Supabase → `migrations/CLAUDE.md` |
| `SCHEMA_GUIDE.md` | Plain-language tour of the v3.0 table set for non-engineers; a dated Nov 2025 snapshot, not the live schema |
| `SESSION_MIGRATION_GUIDE.md` | Explains the v3.1.0 chat_sessions change (30-minute timeout) that migration 001 introduced; historical note |
| `schema.sql` | Original v3.0 base schema (users, conversations, etc.) from Nov 2025; superseded by the canonical infrastructure schema |

## Who reads this (generated)
- column `users.id` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+51)
- column `users.phone_number` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+34)
- column `lesson_plans.id` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` (+15)
- column `users.name` (written by `schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/observe-roster.js:81:44b70a83` (+15)
- column `lesson_plans.created_at` (written by `schema.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/routes/quiz-flow-endpoint.js:159:d69ad1fa` (+12)
- … 21 more → `CLAUDE.index.md`

## Never (human)
- Fresh installs must use infrastructure/supabase/00_complete-schema.sql, never schema.sql (bot/database/migrations/016_add_indian_languages.sql:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.md`?
