# migrations — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/database/migrations -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `001_add_api_usage_tracking.sql` | Creates api_usage_log and api_health_snapshots (with indexes) for the API Health page. |
| `001_add_media_urls_to_conversations.sql` | Adds media_url, media_id and mime_type columns plus indexes to conversations for audio/PDF playback. |
| `001_create_funnel_tables.sql` | Creates website_visits, cta_clicks and chat_starts funnel tables; identical copy under supabase/migrations. |
| `002_add_user_funnel_columns.sql` | Adds source, session_id, first_message_at, registered_at to users with indexes; copy under supabase/migrations. |
| `002_dashboard_users_rbac.sql` | Creates dashboard_users and dashboard_audit_log with indexes and seeds one placeholder admin row. |
| `007_retention_calculation_function.sql` | Defines calculate_retention(text,date,date) cohort function and supporting indexes; superseded by 021. |
| `008_users_by_last_activity.sql` | Defines get_users_with_last_activity(), returning users ordered by latest conversation. |
| `009_create_ama_tables.sql` | Creates ama_conversations, ama_messages and ama_query_audit for the AMA chat. |
| `011_add_chart_image_url.sql` | Adds chart_image_url column to ama_messages for generated chart images. |
| `013_create_video_requests_table.sql` | Creates video_requests tracking video generation requests and pipeline progress, with indexes. |
| `014_create_release_notes_table.sql` | Creates release_notes (environment, category, icon, highlighted) and seeds initial rows for the release feed. |
| `015_create_broadcast_tables.sql` | Creates broadcast_logs and broadcast_messages for admin broadcasts with per-message delivery status. |
| `016_add_byof_role_to_dashboard_users.sql` | Adds dashboard_users.byof_role (partial index) controlling BYOF access. |
| `017_create_byof_tables.sql` | Creates byof_sessions, byof_messages, byof_plans and byof_approval_log for the BYOF feature. |
| `018_partner_rbac_system.sql` | Creates portal_organizations, access_scopes, feature_permissions, RLS policies and seed feature grants. |
| `019_rls_related_tables.sql` | Enables and forces RLS on coaching_sessions, video_requests, lesson_plan_requests, reading_assessments. |
| `020_invitations_and_scope_updates.sql` | Creates invitations, extends access_scopes with updated_at and trigger; non-idempotent first version. |
| `020_invitations_and_scope_updates_fixed.sql` | Idempotent rewrite of 020 (drops trigger first); the one to run. |
| `021_fix_retention_use_created_at.sql` | Redefines calculate_retention to cohort by users.created_at instead of registration_completed_at. |
| `022_create_dashboard_materialized_views.sql` | Creates mv_dashboard_stats, mv_users_activity, mv_retention_cohorts and mv_view_refresh_status. |
| `023_fix_mv_permissions.sql` | Grants SELECT on the four dashboard materialized views to PUBLIC and postgres to fix permission errors. |
| `024_add_scope_dimensions_to_mvs.sql` | Rebuilds mv_users_activity with country/school/test columns; adds mv_dashboard_stats_by_country. |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `add_lesson_plan_pdf_url.sql` | Adds lesson_plans.pdf_url (Gamma PDF link) with an index. |
| `add_portal_authentication.sql` | Adds portal_* password, invite, activation and reset-code columns to users for teacher-portal login. |
| `test_connection.sql` | One-off SELECT confirming the database connection; not a schema change. |
| `test_migration_20251107.sql` | Creates and inserts into a throwaway migration_test table to prove the SQL runner works. |

## Who reads this (all, generated)
- column `access_scopes.dashboard_user_id` (written by `018_partner_rbac_system.sql`) ← read by `dashboard/services/auth.service.js:45:ab5cd5e1`
- column `ama_conversations.id` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:107:d5c6ba18`
- column `ama_conversations.is_archived` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:99:e4825c64`
- column `ama_conversations.updated_at` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:100:421dc8c2`
- column `ama_conversations.user_id` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:98:219f5683`
- column `ama_messages.conversation_id` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:123:ab4f52f0`
- column `ama_messages.created_at` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:124:1bf9df7d`
- column `ama_messages.id` (written by `009_create_ama_tables.sql`) ← read by `dashboard/services/ama.service.js:171:c4cc30e2`
- column `api_usage_log.created_at` (written by `001_add_api_usage_tracking.sql`) ← read by `dashboard/services/api-health/soniox.service.js:47:a2e0be99` · `dashboard/services/api-health/uplift.service.js:47:a2e0be99`
- column `api_usage_log.estimated_cost` (written by `001_add_api_usage_tracking.sql`) ← read by `dashboard/services/api-health/soniox.service.js:45:d8d3ca8f` · `dashboard/services/api-health/uplift.service.js:45:d8d3ca8f`
- column `api_usage_log.service` (written by `001_add_api_usage_tracking.sql`) ← read by `dashboard/services/api-health/soniox.service.js:46:637ddbd5` · `dashboard/services/api-health/uplift.service.js:46:c18825f7`
- column `api_usage_log.units_consumed` (written by `001_add_api_usage_tracking.sql`) ← read by `dashboard/services/api-health/soniox.service.js:45:d8d3ca8f` · `dashboard/services/api-health/uplift.service.js:45:d8d3ca8f`
- column `broadcast_logs.admin_user_id` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1911:5f9dec7a`
- column `broadcast_logs.admin_username` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1884:df477af9`
- column `broadcast_logs.completed_at` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1933:cf8671c6`
- column `broadcast_logs.created_at` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1743:e8356999`
- column `broadcast_logs.filters` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1954:74f3f5ef`
- column `broadcast_logs.id` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1760:63b406ac`
- column `broadcast_logs.message_content` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1912:7c047fd6`
- column `broadcast_logs.status` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1884:df477af9`
- column `broadcast_logs.template_name` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1954:74f3f5ef`
- column `broadcast_messages.broadcast_id` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:148:94ad840a` · `dashboard/database/queries.js:1852:d1becd29`
- column `broadcast_messages.id` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:148:94ad840a` · `dashboard/database/queries.js:1867:522e00e6`
- column `broadcast_messages.message_id` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:149:8d350454`
- column `broadcast_messages.phone_number` (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1867:522e00e6`
- column `broadcast_messages.replied_at` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:230:4580dbde`
- column `broadcast_messages.sent_at` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:231:dcdfb840`
- column `broadcast_messages.status` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:148:94ad840a` · `dashboard/database/queries.js:1869:f2fa95b2`
- column `broadcast_messages.user_id` (written by `015_create_broadcast_tables.sql`) ← read by `bot/whatsapp-bot.js:228:219f5683` · `dashboard/database/queries.js:1853:9437903a`
- column `byof_approval_log.action` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1022:e179198b`
- column `byof_approval_log.created_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1022:e179198b`
- column `byof_approval_log.id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1022:e179198b`
- column `byof_approval_log.reason` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1022:e179198b`
- column `byof_messages.created_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:133:142e8c51`
- column `byof_messages.session_id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:132:dfe28e20`
- column `byof_plans.completed_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1136:d461162a`
- column `byof_plans.created_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:442:e8356999`
- column `byof_plans.id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:476:11b7281c`
- column `byof_plans.pr_url` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:654:c696fba0`
- column `byof_plans.session_id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:441:dfe28e20`
- column `byof_plans.status` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:954:f8063afa`
- column `byof_sessions.created_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:944:5a0aae23`
- column `byof_sessions.id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:120:a617a545`
- column `byof_sessions.status` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:944:5a0aae23`
- column `byof_sessions.title` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1007:e9615765`
- column `byof_sessions.type` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:944:5a0aae23`
- column `byof_sessions.updated_at` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:165:60514017`
- column `byof_sessions.user_id` (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:164:219f5683`
- column `dashboard_users.byof_role` (written by `016_add_byof_role_to_dashboard_users.sql`) ← read by `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.created_at` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:231:19a724f0` · `dashboard/services/byof.service.js:920:6bc37086`
- column `dashboard_users.email` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/auth.service.js:231:19a724f0` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.id` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/ama.service.js:185:0c330467` · `dashboard/services/auth.service.js:37:a353bfba` · `dashboard/services/byof.service.js:336:8a647cbc` (+1: `python3 kg/kg.py who-reads dashboard_users.id`)
- column `dashboard_users.invite_expires_at` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:117:e76eca16`
- column `dashboard_users.invite_token` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:116:f91bcd01`
- column `dashboard_users.is_active` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:21:f8c426e2` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.last_login` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:231:19a724f0`
- column `dashboard_users.password_hash` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:190:7a1021df`
- column `dashboard_users.password_reset_expires_at` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:561:11311af9`
- column `dashboard_users.password_reset_token` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:562:a0112b9d`
- column `dashboard_users.role` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/services/auth.service.js:231:19a724f0` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.username` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/ama.service.js:185:0c330467` · `dashboard/services/auth.service.js:20:824c5b0f` · `dashboard/services/byof.service.js:359:3df8e978`
- column `lesson_plans.pdf_url` (written by `add_lesson_plan_pdf_url.sql`) ← read by `bot/shared/database/bot-helpers.js:554:5950c690` · `bot/shared/services/coaching/fidelity/lesson-plan-text.js:112:d78360fd` · `bot/shared/services/testpaper/testpaper-sources.service.js:298:a3bdef78` · `dashboard/routes/portal.routes.js:746:ca3fb650`
- column `release_notes.category` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `release_notes.created_at` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `release_notes.environment` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1393:c4f4a3e6`
- column `release_notes.icon` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `release_notes.id` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `release_notes.title` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `release_notes.version` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1392:5084f150`
- column `users.first_message_at` (written by `001_create_funnel_tables.sql`, `002_add_user_funnel_columns.sql`) ← read by `dashboard/database/verify-funnel-migration.js:50:680bf0db`
- column `users.password_reset_code` (written by `add_portal_authentication.sql`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.password_reset_expires_at` (written by `add_portal_authentication.sql`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.portal_activated` (written by `add_portal_authentication.sql`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/routes/portal.routes.js:254:7575bd4a` · `dashboard/services/password-reset.service.js:91:0bba03e7` (+1: `python3 kg/kg.py who-reads users.portal_activated`)
- column `users.portal_invite_expires_at` (written by `add_portal_authentication.sql`) ← read by `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/routes/portal.routes.js:254:7575bd4a`
- column `users.portal_invite_token` (written by `add_portal_authentication.sql`) ← read by `bot/shared/services/portal-invite.service.js:294:53285ac9` · `dashboard/routes/portal.routes.js:255:53285ac9`
- column `users.portal_password_hash` (written by `add_portal_authentication.sql`) ← read by `dashboard/routes/portal.routes.js:442:90501a4d`
- column `users.registered_at` (written by `001_create_funnel_tables.sql`, `002_add_user_funnel_columns.sql`) ← read by `dashboard/database/verify-funnel-migration.js:50:680bf0db`
- column `users.session_id` (written by `001_create_funnel_tables.sql`, `002_add_user_funnel_columns.sql`) ← read by `dashboard/database/verify-funnel-migration.js:50:680bf0db`
- column `users.source` (written by `001_create_funnel_tables.sql`, `002_add_user_funnel_columns.sql`) ← read by `dashboard/database/verify-funnel-migration.js:50:680bf0db`
- column `video_requests.completed_at` (written by `013_create_video_requests_table.sql`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.created_at` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:185:e8356999` · `dashboard/database/queries.js:743:06c5e28d` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.current_step` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/video-generation.worker.js:74:790c0376`
- column `video_requests.generation_time_seconds` (written by `013_create_video_requests_table.sql`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.id` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:323:8460890c` · `bot/shared/services/video/video-animation.service.js:364:df7f7cbf` · `bot/shared/services/video/video-assembly.service.js:223:df7f7cbf` · `bot/shared/services/video/video-image.service.js:433:df7f7cbf` (+5: `python3 kg/kg.py who-reads video_requests.id`)
- column `video_requests.language` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/sqs-worker.js:933:28884071` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.pdf_url` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/video-generation.worker.js:74:790c0376` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.retry_count` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/sqs-worker.js:933:28884071` · `bot/workers/video-generation.worker.js:361:d2f49837`
- column `video_requests.script_data` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/video-generation.worker.js:74:790c0376`
- column `video_requests.session_id` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/sqs-worker.js:933:28884071`
- column `video_requests.slide_urls` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/video-generation.worker.js:74:790c0376` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.started_at` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/sqs-worker.js:935:96ebd749`
- column `video_requests.status` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:184:a69ef692` · `bot/shared/services/feature-registration.service.js:244:abb6a119` · `bot/workers/sqs-worker.js:934:184894e4` · `bot/workers/video-generation.worker.js:54:1099729a` (+2: `python3 kg/kg.py who-reads video_requests.status`)
- column `video_requests.topic` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:323:8460890c` · `bot/workers/sqs-worker.js:933:28884071` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.user_id` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:183:219f5683` · `bot/shared/services/feature-registration.service.js:243:219f5683` · `bot/workers/sqs-worker.js:933:28884071` · `dashboard/database/queries.js:818:31232ece` (+1: `python3 kg/kg.py who-reads video_requests.user_id`)
- column `video_requests.video_segment_urls` (written by `013_create_video_requests_table.sql`) ← read by `bot/workers/video-generation.worker.js:74:790c0376`
- column `video_requests.video_url` (written by `013_create_video_requests_table.sql`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `website_visits.id` (written by `001_create_funnel_tables.sql`) ← read by `dashboard/routes/funnel-tracking.routes.js:84:c4cc30e2`
- column `website_visits.session_id` (written by `001_create_funnel_tables.sql`) ← read by `dashboard/routes/funnel-tracking.routes.js:85:3a858213`
- table `access_scopes` whole row (`*`) (written by `018_partner_rbac_system.sql`, `020_invitations_and_scope_updates.sql`, `020_invitations_and_scope_updates_fixed.sql`) ← read by `dashboard/services/auth.service.js:44:d2b02c3e`?
- table `broadcast_logs` whole row (`*`) (written by `015_create_broadcast_tables.sql`) ← read by `dashboard/database/queries.js:1742:d2b02c3e`?
- table `byof_approval_log` whole row (`*`) (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:1266:4d7ce3c1`?
- table `byof_messages` whole row (`*`) (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:131:d2b02c3e`?
- table `byof_plans` whole row (`*`) (written by `017_create_byof_tables.sql`) ← read by `dashboard/services/byof.service.js:440:d2b02c3e`?
- table `conversations` whole row (`*`) (written by `001_add_media_urls_to_conversations.sql`) ← read by `bot/shared/database/bot-helpers.js:452:d2b02c3e`? · `bot/shared/database/queries.js:26:7a0c163a`? · `dashboard/database/queries.js:694:7a0c163a`?
- table `dashboard_users` whole row (`*`) (written by `002_dashboard_users_rbac.sql`, `016_add_byof_role_to_dashboard_users.sql`, `018_partner_rbac_system.sql`) ← read by `dashboard/services/auth.service.js:19:d2b02c3e`?
- table `lesson_plans` whole row (`*`) (written by `add_lesson_plan_pdf_url.sql`) ← read by `bot/shared/services/feature-registration.service.js:224:7a0c163a`? · `bot/shared/utils/telemetry.js:106:7a0c163a`? · `dashboard/database/queries.js:717:7a0c163a`?
- table `release_notes` whole row (`*`) (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1413:d2b02c3e`?
- table `users` whole row (`*`) (written by `001_create_funnel_tables.sql`, `002_add_user_funnel_columns.sql`, `add_portal_authentication.sql`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `video_requests` whole row (`*`) (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/feature-registration.service.js:242:7a0c163a`? · `bot/shared/services/video/video-session.service.js:145:3a0a473e`? · `dashboard/database/queries.js:741:7a0c163a`? · `dashboard/routes/portal.routes.js:1930:d2b02c3e`?
- table `dashboard_users` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:484:36baffc0`? · `dashboard/middleware/auth.js:76:9a69d293`? · `dashboard/middleware/rbac/feature-access.js:53:9a69d293`? · `dashboard/middleware/rbac/rbac.js:49:9a69d293`? (+6: `python3 kg/kg.py who-reads dashboard_users`)
- table `feature_permissions` (written by `018_partner_rbac_system.sql`) ← read by `dashboard/middleware/rbac/feature-access.js:71:650ab5c2`?
- table `release_notes` (written by `014_create_release_notes_table.sql`) ← read by `dashboard/database/queries.js:1391:fd8949a0`?

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `dashboard/database/CLAUDE.index.md`? · `dashboard/database/CLAUDE.md`? · `dashboard/database/migrations/CLAUDE.index.md`? · `dashboard/database/migrations/CLAUDE.md`? · `dashboard/docs/CLAUDE.md`? · `dashboard/docs/PARTNER_RBAC_STATUS.md`?
