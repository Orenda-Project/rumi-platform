# migrations — SQL migrations adding bot tables and columns, run manually against Supabase
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/database/migrations kg=dfa902d5d36e gen=01a669366773 overflow=118 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `003_classroom_coaching.sql` — coaching_sessions plus the job-queue functions the workers call
- `004_reading_assessments.sql` — reading_assessments and WCPM helper functions
- `014_attendance_tables.sql` — attendance tables; `015_exam_checker.sql` — exam checker tables
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `014_attendance_tables.sql` | Creates student_lists, students, attendance_sessions, attendance_records with RLS and summary functions |
| `015_exam_checker.sql` | Creates exam_check_sessions, exam_submissions, exam_grades, grade_audit_log and exam_templates |
| `001_add_chat_sessions.sql` | Creates chat_sessions table with 30-minute timeout tracking and links conversations to a session |
| `002_add_registration_fields.sql` | Adds first/last name, school, subjects_taught, turn_count to users and the increment_turn_count() function |
| … | 28 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `002_add_registration_fields.sql` (+4)) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+55)
- column `coaching_sessions.id` (written by `003_classroom_coaching.sql`) ← read by `bot/scripts/generate-coaching-excel.js:29:094f71c7` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` (+45)
- column `coaching_sessions.status` (written by `003_classroom_coaching.sql`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` (+28)
- … 99 more → `CLAUDE.index.md`

## Never (human)
- Never apply by sort order: numbers are not unique (three 003_*, three 006_*, two 007_*) and some files are unnumbered; apply by content
- Do not apply 016 or 017 unless the database applied 011's preferred_language CHECK (bot/database/migrations/016_add_indian_languages.sql:5-8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/database/CLAUDE.md`? · `docs/features/attendance.md`?
