# routes — Express routers: AMA, BYOF, briefs, funnel tracking, settings, portal API
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/routes kg=7b68a7ad1d41 gen=265396d4da34 overflow=26 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `portal.routes.js` — teacher portal API (login, setup, reset, lesson plans, coaching), mounted at /api/portal
- `settings.js` — super-admin user and role management
- `byof.routes.js` — BYOF sessions and agent chat under /observability/byof
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `portal.routes.js` | Teacher portal API: invite validation, setup, login, reset, and a teacher's lesson plans, coaching, reading, videos. |
| `ama.routes.js` | AMA chat routes under /observability: per-user conversations, SSE answers, super-admin view of all chats. |
| `brief.routes.js` | Factory for the Morning Brief pages (daily/weekly panels) incl. token-authed wall-screen view. |
| `api-health.routes.js` | Serves /api/api-health JSON by calling the api-health aggregator for all or one service. |
| `byof.routes.js` | BYOF (Build Your Own Feature) routes at /observability/byof: sessions, chat with the agent, admin review. |
| … | 4 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `portal.routes.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- table `users` whole row (`*`) (written by `portal.routes.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? (+3)
- column `users.portal_activated` (written by `portal.routes.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/portal-invite.service.js:293:7575bd4a` (+2)
- `ama.routes.js` ← imported by `dashboard/index.js:75:44aec223`
- … 20 more → `CLAUDE.index.md`

## Never (human)
- Coach routes must 404 unless observe is on; the coach id must come from the session (portal-coach.routes.js:13, :31)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/dashboard/ama-routes.test.js` (ama.routes.js)
- `tests/dashboard/portal-channels.test.js` (portal.routes.js)
- … 6 more → `CLAUDE.index.md`

## Related (generated)
- skills: `morning-brief`?
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.md`?
