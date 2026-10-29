# database — SQL layer: analytics queries, migration runner and migration files

<!-- kg:meta repo=rumi-platform dir=dashboard/database kg=d31dda7347a5 gen=1b61d7447989 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `queries.js` — all dashboard analytics queries; take the RLS client (req.dbClient) as first argument
- `run-sql-migration.js` — runs one .sql file: node database/run-sql-migration.js <file>
- `migrations/` — the schema history; read the numbered files in order
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `migrations/` | Numbered SQL migrations for dashboard tables, RLS and materialized views → `migrations/CLAUDE.md` |
| `queries.js` | Analytics query layer (stats, users, sessions, funnel, retention) taking req.dbClient; falls back to MV views. |
| `README.md` | Explains how to run and write SQL migrations with run-sql-migration.js. |
| `apply-user-columns-migration.md` | Manual steps to add four funnel columns to users via the Supabase SQL editor (migration 002). |
| `run-sql-migration.js` | CLI that runs one .sql file against the database over pg. |
| `verify-funnel-migration.js` | Script that checks the funnel tables and users columns exist after migration 001/002. |

## Who reads this (generated)
- `queries.js` ← imported by `dashboard/index.js:49:4830149d` · `dashboard/services/whatsapp-broadcast.service.js:12:dfc14022`
- column `broadcast_messages.broadcast_id` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:148:94ad840a`
- column `broadcast_messages.sent_at` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:231:dcdfb840`
- column `broadcast_messages.status` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:148:94ad840a`
- column `broadcast_messages.user_id` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:228:219f5683`
- table `broadcast_messages` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:147:5e6ab800`?
- env read here: `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_URL`

## Never (human)
- Never query with the service-role client; use the request client (req.dbClient) so RLS applies (queries.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/CLAUDE.md`?
