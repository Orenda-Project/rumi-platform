# migrations — Numbered SQL migrations for dashboard tables, RLS and materialized views
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/database/migrations kg=86005e413553 gen=04ece5ae17d8 overflow=129 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `018_partner_rbac_system.sql` — portal_organizations, access_scopes, feature_permissions and RLS policies
- `022_create_dashboard_materialized_views.sql` — mv_* views the stats pages read, refreshed every 5 minutes
- `020_invitations_and_scope_updates_fixed.sql` — run this idempotent rewrite, not the plain 020
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `018_partner_rbac_system.sql` | Creates portal_organizations, access_scopes, feature_permissions, RLS policies and seed feature grants. |
| `001*` | 3 files; most used `001_create_funnel_tables.sql`: Creates website_visits, cta_clicks and chat_starts funnel tables; identical copy under supabase/migrations. |
| `002_add_user_funnel_columns.sql` | Adds source, session_id, first_message_at, registered_at to users with indexes; copy under supabase/migrations. |
| `002_dashboard_users_rbac.sql` | Creates dashboard_users and dashboard_audit_log with indexes and seeds one placeholder admin row. |
| … | 22 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `dashboard_users` (written by `002_dashboard_users_rbac.sql`) ← read by `dashboard/index.js:484:36baffc0`? · `dashboard/middleware/auth.js:76:9a69d293`? (+8)
- column `video_requests.id` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:323:8460890c` · `bot/shared/services/video/video-animation.service.js:364:df7f7cbf` (+7)
- column `video_requests.status` (written by `013_create_video_requests_table.sql`) ← read by `bot/shared/services/context.service.js:184:a69ef692` · `bot/shared/services/feature-registration.service.js:244:abb6a119` (+4)
- … 109 more → `CLAUDE.index.md`

## Never (human)
- Every mv_* view must keep a unique index, or REFRESH CONCURRENTLY fails (022_...views.sql:120)
- Never run 002_dashboard_users_rbac.sql anywhere real without replacing its placeholder seed credentials
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/database/CLAUDE.md`? · `dashboard/docs/PARTNER_RBAC_STATUS.md`?
