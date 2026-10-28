# database — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/database -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `migrations/` | Numbered SQL migrations for dashboard tables, RLS and materialized views → `migrations/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `README.md` | Explains how to run and write SQL migrations with run-sql-migration.js. |
| `apply-user-columns-migration.md` | Manual steps to add four funnel columns to users via the Supabase SQL editor (migration 002). |
| `queries.js` | Analytics query layer (stats, users, sessions, funnel, retention) taking req.dbClient; falls back to MV views. |
| `run-sql-migration.js` | CLI that runs one .sql file against the database over pg. |
| `verify-funnel-migration.js` | Script that checks the funnel tables and users columns exist after migration 001/002. |

## Who reads this (all, generated)
- `queries.js` ← imported by `dashboard/index.js:49:4830149d` · `dashboard/services/whatsapp-broadcast.service.js:12:dfc14022`
- column `broadcast_messages.broadcast_id` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:148:94ad840a`
- column `broadcast_messages.sent_at` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:231:dcdfb840`
- column `broadcast_messages.status` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:148:94ad840a`
- column `broadcast_messages.user_id` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:228:219f5683`
- table `broadcast_messages` (written by `queries.js`) ← read by `bot/whatsapp-bot.js:147:5e6ab800`?
- env `SUPABASE_SERVICE_ROLE_KEY` read at `dashboard/database/verify-funnel-migration.js:7:90118d4a`
- env `SUPABASE_URL` read at `dashboard/database/verify-funnel-migration.js:6:e84bc099`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/database/CLAUDE.index.md`? · `dashboard/database/CLAUDE.md`? · `dashboard/database/README.md`? · `dashboard/database/apply-user-columns-migration.md`? · `dashboard/database/migrations/CLAUDE.index.md`? · `dashboard/database/migrations/CLAUDE.md`?
