# db — The built-in database: run it, create its tables, apply migrations without Supabase

<!-- kg:meta repo=rumi-platform dir=infrastructure/db kg=3c0dea4e7e4b gen=69a0f539ce10 overflow=0 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `start.js` — `npm run db:start`; startBundledDatabase() is what `rumi start` calls
- `schema.js` — ensureSchema(): create tables or apply pending migrations over pg
<!-- read: db-rollout 2026-11-02 -->

## Children (generated)
| path | purpose |
|---|---|
| `schema.js` | Creates Rumi's tables on a direct Postgres (shim, 00-02, migrations) or applies only pending migrations; inspects state |
| `bundled.js` | The built-in Postgres: data dir, generated password, probe, and starting it as a child that stops when its stdin closes |
| `start.js` | `npm run db:start` and startBundledDatabase(): start or reuse the built-in DB, then bring its tables up to date |
| `apply.js` | CLI used by bootstrap-db.js and migrate.js for bundled/postgres: creates tables or applies new migrations over pg |
| `init.js` | Install-time step (Pinokio): saves the built-in database's password to .env when no other database is configured |
| `postgres-shim.sql` | What the Supabase schema needs from plain Postgres: auth.role()/auth.uid() and a real[] stand-in for pgvector |
| `embedded-postgres.mjs` | Runs real Postgres from the embedded-postgres npm package on a port; prints a ready line, stops on signal or stdin end |

## Who reads this (generated)
- `schema.js` ← imported by `bot/scripts/setup/db-setup.js:30:dd9c8e21` · `bot/scripts/setup/doctor.js:171:80a5a4a2` (+3)
- `bundled.js` ← imported by `bot/scripts/setup/db-setup.js:29:646ac9c7` · `bot/scripts/setup/doctor.js:166:dc40055b` (+2)
- `start.js` ← imported by `bot/scripts/setup/db-setup.js:31:64b38c08` · `infrastructure/db/apply.js:14:faef1869`
- env read here: `RUMI_DB_PASSWORD` · `RUMI_DB_RUN_AS_ROOT`

## Never (human)
- Never commit .rumi-db/ — it is every teacher's data (.gitignore)
- Never pass the database password on the command line; it goes through RUMI_DB_PASSWORD (embedded-postgres.mjs:46)
<!-- read: db-rollout 2026-11-02 -->

## Tests (generated)
- `tests/db/bundled-database.test.js` (bundled.js, schema.js)

## Related (generated)
- docs: `infrastructure/CLAUDE.md`?
