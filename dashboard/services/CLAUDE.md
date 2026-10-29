# services — Business logic: auth, RBAC scopes, analytics, BYOF agent, SQS, email, API health
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/services kg=7c9c19bb3f6c gen=0faa28ad95b4 overflow=78 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `materialized-views.service.js` — reads mv_* stats views, applies partner scopes, refreshes them
- `auth.service.js` — dashboard login and user CRUD on dashboard_users
- `access-scope.service.js` — partner scopes (country, school, phone list) that RLS enforces
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `api-health/` | One health probe per vendor feeding the API Health page → `api-health/CLAUDE.md` |
| `queue/` | → (no door; 1 files) |
| `materialized-views.service.js` | Reads mv_dashboard_stats, mv_users_activity, mv_retention_cohorts and refreshes them; tracks mv_view_refresh_status. |
| `github-api.service.js` | Fetches files, directories and trees from GitHub repos so the BYOF agent can read code remotely. |
| `ama.service.js` | Stores AMA chats (ama_conversations, ama_messages); open-source build answers with a feature-disabled message. |
| … | 25 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `password-reset.service.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- table `dashboard_users` (written by `auth.service.js` (+2)) ← read by `dashboard/index.js:484:36baffc0`? · `dashboard/middleware/auth.js:76:9a69d293`? (+8)
- table `users` whole row (`*`) (written by `password-reset.service.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? (+4)
- … 73 more → `CLAUDE.index.md`

## Never (human)
- Do not require the bot's modules here; the dashboard deploys without bot/ (lib/portal-channels.js:13)
- The R2 client must stay lazy so requiring the service never needs R2 env (services/r2.service.js:12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `dashboard/tests/redis-cache.test.js` (github-api.service.js, redis-cache.service.js)
- `tests/observe/observe-portal-coach.service.test.js` (coach-observations.service.js, coach-section-b.js)
- … 21 more → `CLAUDE.index.md`

## Related (generated)
- docs: `dashboard/CLAUDE.md`?
