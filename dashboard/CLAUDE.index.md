# dashboard — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `config/` | → (no door; 2 files) |
| `database/` | SQL layer: analytics queries, migration runner and migration files → `database/CLAUDE.md` |
| `docs/` | Operator notes: DNS runbook, partner RBAC, API health, media, Postman collection → `docs/CLAUDE.md` |
| `lib/` | Small pure helpers: CSP, rate limits, proxy IP, URL redaction, safe JSON → `lib/CLAUDE.md` |
| `middleware/` | Express middleware: session auth, request timeouts, latency logging, RBAC → `middleware/CLAUDE.md` |
| `portal-frontend/` | → (no door; 1 files) |
| `public/` | → (no door; 6 files) |
| `routes/` | Express routers: AMA, BYOF, briefs, funnel tracking, settings, portal API → `routes/CLAUDE.md` |
| `scripts/` | One-off ops scripts: SQS queue setup, backfills, Railway linking, funnel checks → `scripts/CLAUDE.md` |
| `services/` | Business logic: auth, RBAC scopes, analytics, BYOF agent, SQS, email, API health → `services/CLAUDE.md` |
| `supabase/` | → (no door; 4 files) |
| `tests/` | Jest and standalone-script tests for dashboard services and queue workers → `tests/CLAUDE.md` |
| `views/` | EJS pages for the operator dashboard, plus nav and release-feed partials → `views/CLAUDE.md` |
| `workers/` | → (no door; 1 files) |
| `.gitignore` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `README.md` | Explains the optional Phase 2 operator dashboard: what it shows and how to deploy it after the bot. |
| `cluster.js` | Spawns several worker processes of index.js so one slow GPT request cannot block portal static files. |
| `entrypoint.js` | Railway start script: runs the portal server or, with WORKER_MODE=sqs, the portal SQS worker. |
| `index.js` | Main Express app: sessions (Redis), login, CSP, route mounting under /observability, portal API and admin pages. |
| `jest.config.js` | Default Jest config: node env, service/middleware/RLS test regex, setup.js. |
| `jest.rbac.config.js` | Jest config that runs only rls-policies.test.js with a 60s timeout. |
| `jest.service.config.js` | Jest config running only *.service.test.js without setup.js (avoids localStorage issue on Node 25). |
| `package.json` | Package manifest for rumi-dashboard: scripts (cluster start, tailwind build, jest) and dependencies. |
| `railway.toml` | Railway deploy config: nixpacks build, entrypoint.js start, /health check, restart ALWAYS up to 5. |
| `run-phase6-tests.sh` | Runs the GitHub API and Redis cache jest files one after another (Node 25 workaround). |
| `run-tests.sh` | npm test wrapper that unsets ELECTRON_RUN_AS_NODE and runs jest verbose. |
| `tailwind.config.js` | Tailwind theme (design-system colours via CSS variables) scanning views/*.ejs and public js for classes. |
| `test-login.js` | Manual script that checks a password against ADMIN_PASSWORD_HASH with bcrypt; not part of jest. |
| `test-portal-api.sh` | curl smoke script exercising the 12 teacher-portal API endpoints against a base URL. |
| `test-rls-with-supabase-client.js` | Manual script probing RLS through the Supabase client using access_scopes, dashboard_users and users. |

## Who reads this (all, generated)
- `index.js` ← imported by `dashboard/cluster.js:69:6e322920`
- `package.json` ← imported by `dashboard/index.js:3331:18bc4d40`
- column `access_scopes.dashboard_user_id` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/services/auth.service.js:45:ab5cd5e1`
- column `coaching_sessions.analysis_data` (written by `index.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/shared/services/coaching/coaching-trend.service.js:82:8162476b` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `bot/shared/services/coaching/reflective-conversation.service.js:42:9a821017` (+17: `python3 kg/kg.py who-reads coaching_sessions.analysis_data`)
- column `dashboard_users.email` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/auth.service.js:231:19a724f0` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.is_active` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/services/auth.service.js:21:f8c426e2` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.password_hash` (written by `index.js`, `test-rls-with-supabase-client.js`) ← read by `dashboard/services/auth.service.js:190:7a1021df`
- column `dashboard_users.role` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/services/auth.service.js:231:19a724f0` · `dashboard/services/byof.service.js:359:3df8e978`
- column `dashboard_users.username` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/index.js:485:f2112f9b` · `dashboard/services/ama.service.js:185:0c330467` · `dashboard/services/auth.service.js:20:824c5b0f` · `dashboard/services/byof.service.js:359:3df8e978`
- table `access_scopes` whole row (`*`) (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/services/auth.service.js:44:d2b02c3e`?
- table `coaching_sessions` whole row (`*`) (written by `index.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+6: `python3 kg/kg.py who-reads coaching_sessions`)
- table `dashboard_users` whole row (`*`) (written by `index.js`) ← read by `dashboard/services/auth.service.js:19:d2b02c3e`?
- table `access_scopes` (written by `test-rls-with-supabase-client.js`) ← read by `dashboard/services/access-scope.service.js:49:4c770aa9`? · `dashboard/services/auth.service.js:43:2be8f4d7`?
- table `coaching_sessions` (written by `index.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+49: `python3 kg/kg.py who-reads coaching_sessions`)
- table `dashboard_users` (written by `index.js`, `test-rls-with-supabase-client.js`) ← read by `dashboard/index.js:484:36baffc0`? · `dashboard/middleware/auth.js:76:9a69d293`? · `dashboard/middleware/rbac/feature-access.js:53:9a69d293`? · `dashboard/middleware/rbac/rbac.js:49:9a69d293`? (+6: `python3 kg/kg.py who-reads dashboard_users`)
- table `invitations` (written by `index.js`) ← read by `dashboard/services/invitation.service.js:60:dbabc154`?
- env `ADMIN_PASSWORD` read at `dashboard/test-login.js:9:68b2e053`
- env `ADMIN_PASSWORD_HASH` read at `dashboard/index.js:174:4a55f6fa` · `dashboard/test-login.js:12:fade072a`
- env `ADMIN_USERNAME` read at `dashboard/index.js:173:f83ca370`
- env `BROADCAST_PASSWORD` read at `dashboard/index.js:2775:3668487d`
- env `CLUSTER_ENABLED` read at `dashboard/cluster.js:17:06847e1e`
- env `CLUSTER_WORKERS` read at `dashboard/cluster.js:16:aa843f44`
- env `DASHBOARD_PORT` read at `dashboard/index.js:152:8d77e70c`
- env `DATABASE_URL` read at `dashboard/index.js:3416:309500d1`
- env `NODE_ENV` read at `dashboard/index.js:3344:3d55fed5`
- env `PORT` read at `dashboard/index.js:152:8d77e70c`
- env `PORTAL_URL` read at `dashboard/index.js:308:f16b34e0`
- env `REDIS_URL` read at `dashboard/index.js:198:6f542357`
- env `SESSION_COOKIE_NAME` read at `dashboard/index.js:271:79b1f2a1`
- env `SESSION_SECRET` read at `dashboard/index.js:270:982a5641`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `dashboard/test-rls-with-supabase-client.js:10:8817679a`
- env `SUPABASE_URL` read at `dashboard/test-rls-with-supabase-client.js:9:58448145`
- env `WEBSITE_URL` read at `dashboard/index.js:307:2dd1e187`
- env `WORKER_MODE` read at `dashboard/entrypoint.js:16:7b8b694c`

## Tests (all, generated)
- `jest.config.js` ← `tests/jest.config.js`?
- `tailwind.config.js` ← `tests/dashboard/admin-csp.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `dashboard/database/CLAUDE.index.md`? · `dashboard/database/CLAUDE.md`? · `dashboard/docs/CLAUDE.md`? · `dashboard/lib/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.md`? · `dashboard/middleware/CLAUDE.md`? · `dashboard/routes/CLAUDE.index.md`? · `dashboard/routes/CLAUDE.md`? · `dashboard/scripts/CLAUDE.md`? · `dashboard/services/CLAUDE.index.md`? · `dashboard/services/CLAUDE.md`? · `dashboard/tests/CLAUDE.index.md`? · `dashboard/tests/CLAUDE.md`? · `dashboard/views/CLAUDE.index.md`? · `dashboard/views/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/android-app.md`? · `docs/architecture.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/admin-views-security.md`? · `docs/monitoring.md`? · `docs/running-in-public.md`? · `tests/dashboard/CLAUDE.index.md`? · `tests/dashboard/CLAUDE.md`? · `tests/dashboard/admin-view-escaping/CLAUDE.md`?
- service: `railway.toml`
