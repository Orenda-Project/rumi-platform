# dashboard — Operator dashboard (Express + EJS) and teacher-portal API, one deployable
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard kg=4c669c06de89 gen=ac4bda11237c overflow=24 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `index.js` — Express app: sessions, login, CSP, every /observability route and the /api/portal mount
- `cluster.js` — npm start target; forks workers that run index.js
- `entrypoint.js` — Railway start: portal server, or the SQS worker when WORKER_MODE=sqs
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 9 sub-dirs, each with `CLAUDE.md` | `database/` · `docs/` · `lib/` · `middleware/` · `routes/` · `scripts/` · `services/` · `tests/` · `views/` |
| 5 sub-dirs without a door | `config/` (2) · `portal-frontend/` (1) · `public/` (6) · `supabase/` (4) · `workers/` (1) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `README.md` | Explains the optional Phase 2 operator dashboard: what it shows and how to deploy it after the bot. |
| `package.json` | Package manifest for rumi-dashboard: scripts (cluster start, tailwind build, jest) and dependencies. |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `index.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+51)
- column `coaching_sessions.analysis_data` (written by `index.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/shared/services/coaching/coaching-trend.service.js:82:8162476b` (+19)
- table `coaching_sessions` whole row (`*`) (written by `index.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+8)
- … 14 more → `CLAUDE.index.md`

## Never (human)
- Admin routes must be mounted behind requireAuth, super-admin ones behind requireSuperAdmin (index.js:2496)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/dashboard/admin-csp.test.js` (tailwind.config.js)
- `tests/jest.config.js`? (jest.config.js)

## Related (generated)
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `dashboard/database/CLAUDE.index.md`? (+24)
- service: `railway.toml`
