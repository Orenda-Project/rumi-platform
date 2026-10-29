# scripts — Node scripts that create and migrate the database and test connections
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=infrastructure/scripts kg=5dbf8f698a56 gen=80ed2dc6c955 overflow=5 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `bootstrap-db.js` — fresh install: 00, 01, 02, then migrations
- `migrate.js` — applies pending versioned migrations
- `exec-sql-helper.js` — the one-time exec_sql SQL
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `exec-sql-helper.js` | Holds the one-time exec_sql SECURITY DEFINER SQL (service_role-only) pasted into a new Supabase project |
| `bootstrap-db.js` | Fresh-install bootstrap: applies 00 schema, 01 RLS, 02 seed, then versioned migrations via exec_sql |
| `migrate.js` | Applies V*.sql migrations in version order to an existing deployment, tracking them in schema_versions |
| `repo-env.js` | Loads the repo-root .env into process.env for scripts run from the root where dotenv is absent |
| `sql-statements.js` | Splits a SQL file into single statements (dollar-quote and string safe) for exec_sql, one per RPC |
| `sync-from-internal.sh` | Maintainer tool: builds a patch from the internal repo into this public repo using sync/manifest.json |
| `test-connections.js` | Checks connectivity to Supabase, Redis and the LLM provider; run via npm run validate:connections |
| … | 1 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `exec-sql-helper.js` ← imported by `bot/scripts/setup/db-setup.js:18:f0eb4ee3` · `infrastructure/scripts/bootstrap-db.js:5:c3819f64` (+1)
- `repo-env.js` ← imported by `infrastructure/scripts/bootstrap-db.js:182:560c9d91` · `infrastructure/scripts/migrate.js:6:d115ab38`
- `bootstrap-db.js` ← imported by `bot/scripts/setup/db-setup.js:138:fc4dd291`
- `sql-statements.js` ← imported by `infrastructure/scripts/bootstrap-db.js:4:c56cb184`
- … 6 more → `CLAUDE.index.md`

## Never (human)
- Never drop the REVOKE from exec_sql; anyone with the anon key could run SQL (exec-sql-helper.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/setup/sql-statements.test.js` (exec-sql-helper.js, sql-statements.js)
- `tests/setup/bootstrap-db.test.js` (bootstrap-db.js)
- … 3 more → `CLAUDE.index.md`

## Related (generated)
- docs: `docs/local-stack.md`? · `infrastructure/CLAUDE.md`? · `infrastructure/sync/README.md`?
