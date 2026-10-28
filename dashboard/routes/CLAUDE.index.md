# routes — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/routes -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `ama.routes.js` | AMA chat routes under /observability: per-user conversations, SSE answers, super-admin view of all chats. |
| `api-health.routes.js` | Serves /api/api-health JSON by calling the api-health aggregator for all or one service. |
| `brief.routes.js` | Factory for the Morning Brief pages (daily/weekly panels) incl. token-authed wall-screen view. |
| `byof.routes.js` | BYOF (Build Your Own Feature) routes at /observability/byof: sessions, chat with the agent, admin review. |
| `funnel-tracking.routes.js` | Public endpoints recording website visits and CTA clicks into website_visits and cta_clicks. |
| `portal-coach.routes.js` | Portal coach API (/api/portal/coach/*): observations, derived roster; reads users; gated by OBSERVE_ENABLED. |
| `portal.routes.js` | Teacher portal API: invite validation, setup, login, reset, and a teacher's lesson plans, coaching, reading, videos. |
| `settings.js` | Super-admin settings routes: invite, change role, deactivate/reactivate/delete dashboard users, change own password. |
| `wordcloud.js` | Routes returning word-frequency data for the conversation word cloud via wordcloud.service. |

## Who reads this (all, generated)
- `ama.routes.js` ← imported by `dashboard/index.js:75:44aec223`
- `api-health.routes.js` ← imported by `dashboard/index.js:124:868035bb`
- `brief.routes.js` ← imported by `dashboard/index.js:149:818e4cb9`
- `byof.routes.js` ← imported by `dashboard/index.js:146:7986ca93`
- `funnel-tracking.routes.js` ← imported by `dashboard/index.js:127:734cb817`
- `portal-coach.routes.js` ← imported by `dashboard/routes/portal.routes.js:40:f6484bfc`
- `portal.routes.js` ← imported by `dashboard/index.js:136:11af011f`
- `settings.js` ← imported by `dashboard/index.js:130:a35f0675`
- `wordcloud.js` ← imported by `dashboard/index.js:133:5176fec6`
- column `users.password_reset_attempts` (written by `portal.routes.js`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.password_reset_code` (written by `portal.routes.js`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.password_reset_expires_at` (written by `portal.routes.js`) ← read by `dashboard/services/password-reset.service.js:244:b7d38e8a`
- column `users.portal_activated` (written by `portal.routes.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/services/password-reset.service.js:91:0bba03e7` · `bot/scripts/deployment/get-portal-test-tokens.js:46:453298e7`
- column `users.portal_invite_expires_at` (written by `portal.routes.js`) ← read by `bot/shared/services/portal-invite.service.js:293:7575bd4a`
- column `users.portal_invite_token` (written by `portal.routes.js`) ← read by `bot/shared/services/portal-invite.service.js:294:53285ac9`
- table `users` whole row (`*`) (written by `portal.routes.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+1: `python3 kg/kg.py who-reads users`)
- table `cta_clicks` (written by `funnel-tracking.routes.js`) ← read by `dashboard/database/queries.js:963:523a1987`?
- table `users` (written by `portal.routes.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+52: `python3 kg/kg.py who-reads users`)
- table `website_visits` (written by `funnel-tracking.routes.js`) ← read by `dashboard/database/queries.js:962:340a8e70`?
- env `NODE_ENV` read at `dashboard/routes/byof.routes.js:122:a008d457` · `dashboard/routes/portal.routes.js:142:85c61416`
- env `R2_ACCESS_KEY_ID` read at `dashboard/routes/portal.routes.js:53:d6f2a7a2`
- env `R2_BUCKET_NAME` read at `dashboard/routes/portal.routes.js:1668:38ee6855`
- env `R2_ENDPOINT` read at `dashboard/routes/portal.routes.js:51:2684789e`
- env `R2_SECRET_ACCESS_KEY` read at `dashboard/routes/portal.routes.js:54:5687c9ca`

## Tests (all, generated)
- `ama.routes.js` ← `tests/dashboard/ama-routes.test.js`
- `brief.routes.js` ← `tests/routes/brief-routes.test.js`
- `portal.routes.js` ← `tests/dashboard/portal-channels.test.js` · `tests/observe/observe-portal-coach.routes.test.js` · `tests/portal/portal-app-session-runtime.test.js` · `tests/portal/portal-auth-limits.test.js` · `tests/portal/portal-client-ip.test.js` · `tests/portal/portal-reset-code-attempts.test.js`

## Related (all, generated)
- skills: `morning-brief`?
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/routes/CLAUDE.index.md`? · `dashboard/routes/CLAUDE.md`? · `tests/dashboard/CLAUDE.index.md`? · `tests/observe/CLAUDE.index.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`? · `tests/routes/CLAUDE.index.md`?
