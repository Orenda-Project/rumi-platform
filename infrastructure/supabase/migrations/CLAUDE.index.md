# migrations — full index (generated)

<!-- kg:index repo=rumi-platform dir=infrastructure/supabase/migrations -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `V1.0.0__baseline.sql` | Baseline marker migration: creates schema_versions; the full schema lives in 00_complete-schema.sql |
| `V2.11.0__portal_access.sql` | Creates the portal_app_user role and seeds feature_permissions rows the admin dashboard checks |
| `V2.11.2__portal_reset_attempts.sql` | Adds users.password_reset_attempts to cap wrong portal reset-code tries |
| `V2.11.6__exam_ocr_provider_any_model.sql` | Drops the exam_check_sessions.ocr_provider CHECK so it can hold any vision model name |
| `V2.11.7__exam_session_columns.sql` | Adds exam_check_sessions columns the exam checker writes (ocr_results, grading_results, annotated_images) |
| `V2.4.0__test_papers.sql` | Adds test_paper_requests and test_papers tables with indexes and RLS for /testpaper |
| `V2.5.0__attendance_register.sql` | Adds schools, users.school_id/role and teacher_attendance_records; widens attendance status CHECK |
| `V2.5.1__teacher_nudges.sql` | Adds teacher_nudges table, indexes, RLS and user_channels.reply_identifier for scheduled nudges |
| `V2.6.0__observe_coach_assistant.sql` | Adds coaching_sessions observer/debrief columns, schools and users.role for the /observe feature |
| `V2.7.0__exec_sql_service_role_only.sql` | Revokes exec_sql EXECUTE from PUBLIC/anon/authenticated so only service_role can call it |
| `V2.9.0__lesson_quiz.sql` | Adds quizzes.coaching_session_id/language/meta, extra statuses and quiz_share_codes.teacher_to for lesson quizzes |

## Who reads this (all, generated)
- column `coach_directory.leader_user_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/coach-directory.js:83:12d66012`
- column `coach_directory.work_email` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/coach-directory.js:82:9cc0bc90`
- column `coaching_sessions.debrief_status` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-completion.js:45:2d5e1cfa` · `bot/shared/services/observe/observe-debrief.service.js:99:b88b1700` · `bot/workers/sqs-worker.js:1085:27c5417a` · `dashboard/services/coach-observations.service.js:135:8424f2a9`
- column `coaching_sessions.observation_type` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/coaching/own-coaching.js:38:eb90e6da` · `bot/shared/services/observe/observe-brief-card.js:38:49f65bf4` · `bot/shared/services/observe/observe-debrief.service.js:121:49f65bf4` · `bot/shared/services/observe/observe-form.service.js:57:60fa5cd4` (+3: `python3 kg/kg.py who-reads coaching_sessions.observation_type`)
- column `coaching_sessions.observer_user_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-capture.service.js:183:6d26d258` · `bot/shared/services/observe/observe-debrief.service.js:119:2df9e8f4` · `bot/shared/services/observe/observe-form.service.js:57:60fa5cd4` · `bot/shared/services/observe/observe-resume.service.js:41:c24782c0` (+4: `python3 kg/kg.py who-reads coaching_sessions.observer_user_id`)
- column `leader_schools.leader_user_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-roster.service.js:25:9b7db283` · `dashboard/services/coach-observations.service.js:215:58569618`
- column `leader_schools.school_ext_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a`
- column `leader_schools.school_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a` · `dashboard/services/coach-observations.service.js:214:c73fca38`
- column `leader_schools.school_name` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-roster.service.js:24:c7cf393a` · `dashboard/services/coach-observations.service.js:214:c73fca38`
- column `observation_schedules.created_at` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-calendar.service.js:72:6ed1c3e8` · `bot/shared/services/observe/observe-schedule.service.js:70:2187231c` · `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.leader_user_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-schedule.service.js:45:12d66012` · `bot/shared/services/observe/observe-who.service.js:175:a631068d` · `dashboard/services/coach-observations.service.js:148:d95d5de9`
- column `observation_schedules.scheduled_for` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-schedule.service.js:105:9badaaa9` · `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.scheduled_slot` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `dashboard/services/coach-observations.service.js:192:8fa0dc3a`
- column `observation_schedules.school_ext_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-schedule.service.js:46:147fb73b`
- column `observation_schedules.school_name` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-debrief.service.js:141:2073485d` · `dashboard/services/coach-observations.service.js:147:2a1a25c3`
- column `observation_schedules.session_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-debrief.service.js:141:2073485d` · `bot/shared/services/observe/observe-who.service.js:175:a631068d` · `dashboard/services/coach-observations.service.js:147:2a1a25c3`
- column `observation_schedules.status` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-schedule.service.js:48:7da22d3d` · `bot/shared/services/observe/observe-who.service.js:175:a631068d` · `dashboard/services/coach-observations.service.js:194:8cc315e5`
- column `observation_schedules.teacher_ext_id` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-schedule.service.js:47:870b556d` · `dashboard/services/coach-observations.service.js:147:2a1a25c3`
- column `observation_schedules.teacher_name` (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/services/observe/observe-debrief.service.js:141:2073485d` · `dashboard/services/coach-observations.service.js:147:2a1a25c3`
- column `quizzes.coaching_session_id` (written by `V2.9.0__lesson_quiz.sql`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:294:b040fb66` (+1: `python3 kg/kg.py who-reads quizzes.coaching_session_id`)
- column `quizzes.language` (written by `V2.9.0__lesson_quiz.sql`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1606:8753b523` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:526:33377960` (+3: `python3 kg/kg.py who-reads quizzes.language`)
- column `quizzes.meta` (written by `V2.9.0__lesson_quiz.sql`) ← read by `bot/shared/services/quiz/transcript-lesson-provider.js:161:77be8067` · `bot/shared/services/quiz/transcript-quiz-generate.service.js:1578:f43d3314` · `bot/shared/services/quiz/transcript-quiz-handoff.service.js:55:71d5e195` · `bot/shared/services/quiz/transcript-quiz-list.service.js:294:b040fb66` (+3: `python3 kg/kg.py who-reads quizzes.meta`)
- column `schema_versions.version` (written by `V1.0.0__baseline.sql`) ← read by `infrastructure/scripts/migrate.js:87:9e9cfc5f`
- column `schools.ext_id` (written by `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/scripts/attendance/link-school.js:77:3c40a8fa` · `bot/scripts/observe-roster.js:108:5cc6b2b5` · `bot/shared/services/staff-attendance.service.js:57:87e081e3`
- column `schools.id` (written by `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/scripts/attendance/link-school.js:77:3c40a8fa` · `bot/scripts/observe-roster.js:108:5cc6b2b5` · `bot/shared/services/staff-attendance.service.js:57:87e081e3`
- column `schools.name` (written by `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/scripts/attendance/link-school.js:77:3c40a8fa` · `bot/scripts/observe-roster.js:108:5cc6b2b5` · `bot/shared/services/staff-attendance.service.js:57:87e081e3`
- column `teacher_attendance_records.date` (written by `V2.5.0__attendance_register.sql`) ← read by `bot/shared/services/staff-attendance.service.js:110:755594b8`
- column `teacher_attendance_records.school_id` (written by `V2.5.0__attendance_register.sql`) ← read by `bot/shared/services/staff-attendance.service.js:109:fa423b71`
- column `teacher_attendance_records.status` (written by `V2.5.0__attendance_register.sql`) ← read by `bot/shared/services/staff-attendance.service.js:136:5c2c47be`
- column `teacher_attendance_records.teacher_id` (written by `V2.5.0__attendance_register.sql`) ← read by `bot/shared/services/staff-attendance.service.js:108:ce75da8c`
- column `test_paper_requests.created_at` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:179:3daaf0e9`
- column `test_paper_requests.grade` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:179:3daaf0e9`
- column `test_paper_requests.id` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:113:7f798d18`
- column `test_paper_requests.language` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:179:3daaf0e9`
- column `test_paper_requests.source_label` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:179:3daaf0e9`
- column `test_paper_requests.subject` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:113:7f798d18`
- column `test_paper_requests.user_id` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:138:219f5683`
- column `test_papers.edited_from` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:82:b46b6882`
- column `test_papers.id` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:82:b46b6882`
- column `test_papers.question_count` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:187:9d05e686`
- column `test_papers.ready_at` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:187:9d05e686`
- column `test_papers.request_id` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:67:a62a38f3`
- column `test_papers.status` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:82:b46b6882`
- column `test_papers.title` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:187:9d05e686`
- column `test_papers.version` (written by `V2.4.0__test_papers.sql`) ← read by `bot/shared/services/testpaper/testpaper-store.service.js:66:9e9cfc5f`
- column `user_channels.reply_identifier` (written by `V2.5.1__teacher_nudges.sql`) ← read by `bot/shared/services/nudges/address.js:87:444eaf44`
- column `users.password_reset_attempts` (written by `V2.11.2__portal_reset_attempts.sql`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.role` (written by `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/observe/observe-debrief.service.js:719:a78a10fa` · `bot/shared/services/observe/observe-roster.service.js:49:8c646741` · `bot/shared/services/portal-invite.service.js:97:b8609ea6` (+3: `python3 kg/kg.py who-reads users.role`)
- column `users.school_id` (written by `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/scripts/attendance/link-school.js:101:fa423b71` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/observe/observe-roster.service.js:49:8c646741` · `bot/shared/services/staff-attendance.service.js:47:0085645a` (+1: `python3 kg/kg.py who-reads users.school_id`)
- table `coaching_sessions` whole row (`*`) (written by `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `exam_check_sessions` whole row (`*`) (written by `V2.11.7__exam_session_columns.sql`) ← read by `bot/shared/services/exam-checker/exam-session.service.js:37:d2b02c3e`?
- table `users` whole row (`*`) (written by `V2.11.2__portal_reset_attempts.sql`, `V2.5.0__attendance_register.sql`, `V2.6.0__observe_coach_assistant.sql`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `attendance_sessions` (written by `V2.5.0__attendance_register.sql`) ← read by `bot/shared/services/attendance-delivery.service.js:115:2a982732`?
- table `schema_versions` (written by `V1.0.0__baseline.sql`, `V2.4.0__test_papers.sql`, `V2.7.0__exec_sql_service_role_only.sql`) ← read by `infrastructure/scripts/migrate.js:86:b151663b`?

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `CHANGELOG.md`? · `SETUP.md`? · `docs/features/attendance.md`? · `docs/features/lesson-quiz.md`? · `docs/features/observe.md`? · `docs/features/teacher-nudges.md`? · `docs/features/test-papers.md`? · `docs/pulling-updates.md`? · `infrastructure/supabase/CLAUDE.md`?
