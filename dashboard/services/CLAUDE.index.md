# services — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/services -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `api-health/` | One health probe per vendor feeding the API Health page → `api-health/CLAUDE.md` |
| `queue/` | → (no door; 1 files) |
| `access-scope.service.js` | Creates and reads partner access scopes (country, school, phone list) in access_scopes for RLS; reads dashboard_users. |
| `ama.service.js` | Stores AMA chats (ama_conversations, ama_messages); open-source build answers with a feature-disabled message. |
| `auth.service.js` | Dashboard login, password hashing and user CRUD on dashboard_users; loads access_scopes, writes dashboard_audit_log. |
| `brief.service.js` | Pure helpers that load the latest Morning Brief manifest and panels from local render or Supabase bucket. |
| `byof-agent.service.js` | Anthropic-powered chat agent for BYOF sessions that reads the codebase to draft bug reports and plans. |
| `byof.service.js` | BYOF data layer: role checks, sessions, messages, plans, approvals (byof_* tables, dashboard_users). |
| `coach-observations.service.js` | Builds the coach's portal "My observations" view from observation_schedules, coaching_sessions, leader_schools, users. |
| `coach-section-b.js` | Maps coaching_sessions.analysis_data section_b/lp_fidelity to a whitelisted lesson-plan-fidelity view for coaches. |
| `coaching-observability.service.js` | Paginated, filtered coaching session list and detail queries (coaching_sessions joined to users) with RLS client. |
| `code-chunker.service.js` | Splits source files into function/class chunks by regex for the BYOF code search index. |
| `code-embedder.service.js` | Creates OpenAI text-embedding-3-small embeddings for code chunks used by BYOF vector search. |
| `email.service.js` | Nodemailer (SMTP/Gmail) sender for dashboard invitation and notification emails. |
| `github-api.service.js` | Fetches files, directories and trees from GitHub repos so the BYOF agent can read code remotely. |
| `gpt-cache.service.js` | Redis cache wrapper (withCache) for GPT-4o-mini transcript and AMA responses; degrades without Redis. |
| `invitation.service.js` | Creates, emails, validates and accepts partner invitations (invitations, dashboard_users) with secure tokens. |
| `materialized-views.service.js` | Reads mv_dashboard_stats, mv_users_activity, mv_retention_cohorts and refreshes them; tracks mv_view_refresh_status. |
| `mv-refresh-scheduler.service.js` | setInterval scheduler refreshing the dashboard materialized views every 5 minutes, concurrently. |
| `password-reset.service.js` | Teacher-portal password reset: 6-digit codes, expiry, attempt limits; reads users, sends via the bot's internal API. |
| `r2.service.js` | Proxies private R2 file downloads and issues presigned URLs for the portal; logs only redacted URLs. |
| `redis-cache.service.js` | ioredis cache with circuit breaker wrapping GitHub API calls (5-minute TTL). |
| `resend-email.service.js` | Resend API sender for invitations and notices; fails loudly when EMAIL_FROM is unset. |
| `retention.service.js` | Weekly cohort retention and activation analytics via the calculate_retention function, MV-first. |
| `transcript-processor.service.js` | Uses GPT-4o-mini to fix Urdu spacing, relabel speakers, section and summarise coaching transcripts. |
| `transcript-ux-helpers.service.js` | Maps SLO mastery and classroom-climate data to traffic-light statuses for the transcript view. |
| `vector-db.service.js` | In-memory cosine-similarity vector store with JSON persistence for BYOF code search. |
| `video-observability.service.js` | Admin video gallery queries (video_requests joined to users) with pagination, filters and RLS client. |
| `whatsapp-broadcast.service.js` | Creates Meta message templates, polls approval and sends broadcasts, tracking delivery; uses database/queries. |
| `wordcloud.service.js` | Builds word-frequency data from conversations/chat_sessions messages with stop-word filtering. |

## Who reads this (all, generated)
- `access-scope.service.js` ← imported by `dashboard/index.js:78:1e0a6ccd` · `dashboard/services/invitation.service.js:15:cfcf45a5`
- `ama.service.js` ← imported by `dashboard/routes/ama.routes.js:21:cc7134d2` · `dashboard/workers/portal-sqs-worker.js:214:cc7134d2`
- `auth.service.js` ← imported by `dashboard/index.js:28:8ef35abd` · `dashboard/routes/settings.js:8:fffb4120`
- `brief.service.js` ← imported by `dashboard/routes/brief.routes.js:22:daa0bedd`
- `byof-agent.service.js` ← imported by `dashboard/routes/byof.routes.js:11:16a032fb`
- `byof.service.js` ← imported by `dashboard/routes/byof.routes.js:10:f7ffd89f` · `dashboard/services/byof-agent.service.js:14:236f5ba4`
- `coach-observations.service.js` ← imported by `dashboard/routes/portal-coach.routes.js:20:18aa7f56` · `dashboard/routes/portal.routes.js:41:7ca4d61c`
- `coach-section-b.js` ← imported by `dashboard/services/coach-observations.service.js:49:671b315c`
- `coaching-observability.service.js` ← imported by `dashboard/index.js:52:7a03acff`
- `github-api.service.js` ← imported by `dashboard/services/byof-agent.service.js:16:30db2334` · `dashboard/services/redis-cache.service.js:9:30db2334`
- `gpt-cache.service.js` ← imported by `dashboard/index.js:58:e2d25ad0` · `dashboard/services/transcript-processor.service.js:13:1cac73a0`
- `invitation.service.js` ← imported by `dashboard/index.js:84:8f00ab4b`
- `materialized-views.service.js` ← imported by `dashboard/database/queries.js:13:3d4e1345` · `dashboard/index.js:81:3d7a2e1b` · `dashboard/services/mv-refresh-scheduler.service.js:20:6b533c81` · `dashboard/services/retention.service.js:13:6b533c81`
- `mv-refresh-scheduler.service.js` ← imported by `dashboard/index.js:3414:701d14a4`
- `password-reset.service.js` ← imported by `dashboard/routes/portal.routes.js:557:428c28e7`
- `r2.service.js` ← imported by `dashboard/index.js:91:9abc3fe3` · `dashboard/routes/portal.routes.js:35:193f114b`
- `redis-cache.service.js` ← imported by `dashboard/services/byof-agent.service.js:15:1bd19dde`
- `resend-email.service.js` ← imported by `dashboard/index.js:87:812c3951` · `dashboard/routes/settings.js:9:72f2cdfb`
- `retention.service.js` ← imported by `dashboard/index.js:72:18ebac15`
- `transcript-processor.service.js` ← imported by `dashboard/index.js:94:fce50392` · `dashboard/workers/portal-sqs-worker.js:55:ff7cdd25` · `dashboard/scripts/backfill-processed-transcripts.js:17:4befdff3`
- `transcript-ux-helpers.service.js` ← imported by `dashboard/index.js:55:e8dd245d`
- `video-observability.service.js` ← imported by `dashboard/index.js:63:eafba43c`
- `whatsapp-broadcast.service.js` ← imported by `dashboard/index.js:2711:c1295629`
- `wordcloud.service.js` ← imported by `dashboard/routes/wordcloud.js:7:84d60556`
- column `dashboard_users.email` (written by `auth.service.js`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.is_active` (written by `auth.service.js`) ← read by `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.role` (written by `auth.service.js`) ← read by `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.username` (written by `auth.service.js`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/ama.service.js:185:0c330467` · `dashboard/services/byof.service.js:359:3df8e978`
- table `dashboard_users` whole row (`*`) (written by `byof.service.js`) ← read by `dashboard/services/auth.service.js:19:d2b02c3e`?
- table `users` whole row (`*`) (written by `password-reset.service.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `access_scopes` (written by `access-scope.service.js`) ← read by `dashboard/services/auth.service.js:43:2be8f4d7`?
- table `dashboard_users` (written by `auth.service.js`, `byof.service.js`, `invitation.service.js`) ← read by `dashboard/index.js:484:36baffc0`? · `dashboard/middleware/auth.js:76:9a69d293`? · `dashboard/middleware/rbac/feature-access.js:53:9a69d293`? · `dashboard/middleware/rbac/rbac.js:49:9a69d293`? (+6: `python3 kg/kg.py who-reads dashboard_users`)
- table `invitations` (written by `invitation.service.js`) ← read by `dashboard/index.js:1982:535a79c0`?
- table `users` (written by `password-reset.service.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+52: `python3 kg/kg.py who-reads users`)
- env `ANTHROPIC_API_KEY` read at `dashboard/services/byof-agent.service.js:22:4eda5959`
- env `BOT_DOMAIN` read at `dashboard/services/whatsapp-broadcast.service.js:21:ba0a0ce3`
- env `DASHBOARD_URL` read at `dashboard/services/email.service.js:33:05b8d0f2` · `dashboard/services/resend-email.service.js:15:05b8d0f2`
- env `DATABASE_URL` read at `dashboard/services/mv-refresh-scheduler.service.js:44:8feb0fbd`
- env `EMAIL_APP_PASSWORD` read at `dashboard/services/email.service.js:16:ff0d8d9b`
- env `EMAIL_FROM` read at `dashboard/services/email.service.js:32:67187f3b` · `dashboard/services/resend-email.service.js:14:21cde03c`
- env `EMAIL_HOST` read at `dashboard/services/email.service.js:22:9ca3fcca`
- env `EMAIL_PASSWORD` read at `dashboard/services/email.service.js:27:1627ea9f`
- env `EMAIL_PORT` read at `dashboard/services/email.service.js:23:7809b906`
- env `EMAIL_SECURE` read at `dashboard/services/email.service.js:24:9e262301`
- env `EMAIL_SERVICE` read at `dashboard/services/email.service.js:11:4a8aa458`
- env `EMAIL_USER` read at `dashboard/services/email.service.js:15:1289f07d`
- env `GITHUB_BRANCH_BOT` read at `dashboard/services/github-api.service.js:16:7bfcc624`
- env `GITHUB_ORG` read at `dashboard/services/github-api.service.js:11:7f60d0a9`
- env `GITHUB_REPO_BOT` read at `dashboard/services/github-api.service.js:15:3976b97a`
- env `GITHUB_REPO_DASHBOARD` read at `dashboard/services/github-api.service.js:20:e246ea42`
- env `GITHUB_REPO_PORTAL` read at `dashboard/services/github-api.service.js:25:ace10233`
- env `GITHUB_REPO_WEBSITE` read at `dashboard/services/github-api.service.js:30:9aeeb11a`
- env `GITHUB_TOKEN` read at `dashboard/services/github-api.service.js:44:0d0c9448`
- env `GPT_CACHE_TTL` read at `dashboard/services/gpt-cache.service.js:20:890b343c`
- env `GRAPH_API_VERSION` read at `dashboard/services/byof.service.js:13:ddcada1f`
- env `INTERNAL_API_KEY` read at `dashboard/services/password-reset.service.js:31:af81d754`
- env `MAIN_BOT_URL` read at `dashboard/services/password-reset.service.js:30:0a9107fd`
- env `NOTIFICATION_ACCESS_TOKEN` read at `dashboard/services/byof.service.js:797:aec3ddc9`
- env `NOTIFICATION_PHONE_ID` read at `dashboard/services/byof.service.js:796:64fe0bd3`
- env `OBSERVE_ENABLED` read at `dashboard/services/coach-observations.service.js:64:23ca6b03`
- env `OBSERVE_LEADER_ROLES` read at `dashboard/services/coach-observations.service.js:70:d9b6abea`
- env `OPENAI_API_KEY` read at `dashboard/services/code-embedder.service.js:18:f1ad06eb` · `dashboard/services/transcript-processor.service.js:24:206dad27`
- env `PHONE_NUMBER_ID` read at `dashboard/services/whatsapp-broadcast.service.js:16:c79e4792`
- env `PORTAL_RESET_CODE_MAX_ATTEMPTS` read at `dashboard/services/password-reset.service.js:46:5cabc09b`
- env `PORTAL_URL` read at `dashboard/services/email.service.js:44:e53f27de`
- env `R2_ACCESS_KEY_ID` read at `dashboard/services/r2.service.js:23:d6f2a7a2`
- env `R2_BUCKET_NAME` read at `dashboard/services/r2.service.js:30:90ddb4d1`
- env `R2_ENDPOINT` read at `dashboard/services/r2.service.js:21:2684789e`
- env `R2_SECRET_ACCESS_KEY` read at `dashboard/services/r2.service.js:24:5687c9ca`
- env `REDIS_URL` read at `dashboard/services/redis-cache.service.js:30:3c9a24c4`
- env `RESEND_API_KEY` read at `dashboard/services/resend-email.service.js:22:d309a45a`
- env `RUMI_FEATURE_OBSERVE` read at `dashboard/services/coach-observations.service.js:65:f2aa7ea4`
- env `STAGING_PHONE_NUMBER` read at `dashboard/services/byof.service.js:875:a32884fc`
- env `VECTOR_STORE_PATH` read at `dashboard/services/vector-db.service.js:20:dfd40a6d`
- env `WABA_ID` read at `dashboard/services/whatsapp-broadcast.service.js:17:601afc5a`
- env `WHATSAPP_TOKEN` read at `dashboard/services/whatsapp-broadcast.service.js:15:60bafac2`

## Tests (all, generated)
- `ama.service.js` ← `dashboard/tests/ama-service.test.js` · `tests/dashboard/ama-routes.test.js`
- `brief.service.js` ← `tests/routes/brief-service.test.js`
- `byof-agent.service.js` ← `dashboard/tests/byof-agent.test.js`
- `byof.service.js` ← `dashboard/tests/byof-service.test.js`
- `coach-observations.service.js` ← `tests/observe/observe-portal-coach.service.test.js`
- `coach-section-b.js` ← `tests/observe/observe-portal-coach.service.test.js`
- `code-chunker.service.js` ← `dashboard/tests/code-chunker.test.js`
- `code-embedder.service.js` ← `dashboard/tests/embedder.test.js`
- `github-api.service.js` ← `dashboard/tests/github-api.test.js` · `dashboard/tests/redis-cache.test.js` · `tests/dashboard/github-api-not-found.test.js`
- `gpt-cache.service.js` ← `dashboard/tests/gpt-cache.test.js`
- `materialized-views.service.js` ← `dashboard/tests/materialized-views-partner.service.test.js` · `dashboard/tests/materialized-views.test.js`
- `password-reset.service.js` ← `tests/portal/portal-reset-code-attempts.test.js` · `tests/portal/portal-reset-request.test.js`
- `r2.service.js` ← `tests/storage/r2-key-error-no-url.test.js`
- `redis-cache.service.js` ← `dashboard/tests/redis-cache.test.js`
- `resend-email.service.js` ← `tests/dashboard/resend-email-lazy.test.js`
- `transcript-ux-helpers.service.js` ← `dashboard/tests/transcript-ux-helpers.test.js` · `tests/dashboard/admin-view-escaping/transcript-enhanced.test.js` · `tests/dashboard/admin-views-raw-output.test.js`
- `vector-db.service.js` ← `dashboard/tests/vector-db.test.js`
- `video-observability.service.js` ← `dashboard/tests/video-observability-service.test.js`

## Related (all, generated)
- docs: `dashboard/CLAUDE.md`?
