# scripts — Node scripts that create and migrate the database and test connections
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=infrastructure/scripts kg=5ec6b324a823 gen=b6fd6759712e overflow=7 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `bootstrap-db.js` — fresh install: 00, 01, 02, then migrations
- `migrate.js` — applies pending versioned migrations
- `exec-sql-helper.js` — the one-time exec_sql SQL
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `repo-env.js` | Loads the repo-root .env into process.env for scripts run from the root where dotenv is absent |
| `bootstrap-db.js` | Fresh-install bootstrap: 00 schema, 01 RLS, 02 seed, then migrations — via exec_sql on Supabase, over pg otherwise |
| `exec-sql-helper.js` | Holds the one-time exec_sql SECURITY DEFINER SQL (service_role-only) pasted into a new Supabase project |
| `migrate.js` | Applies V*.sql migrations in version order to an existing deployment, tracking them in schema_versions |
| `sql-statements.js` | Splits a SQL file into single statements (dollar-quote and string safe) for exec_sql, one per RPC |
| `sync-from-internal.sh` | Maintainer tool: builds a patch from the internal repo into this public repo using sync/manifest.json |
| … | 2 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `repo-env.js` ← imported by `infrastructure/db/start.js:16:c8d44e81` · `infrastructure/db/apply.js:12:c8d44e81` (+3)
- `exec-sql-helper.js` ← imported by `bot/scripts/setup/db-setup.js:23:f0eb4ee3` · `infrastructure/scripts/bootstrap-db.js:5:c3819f64` (+1)
- `bootstrap-db.js` ← imported by `bot/scripts/setup/db-setup.js:183:fc4dd291` · `infrastructure/db/schema.js:17:1de73c2f`
- `migrate.js` ← imported by `infrastructure/db/schema.js:18:e37b5253`
- … 7 more → `CLAUDE.index.md`

## Never (human)
- Never drop the REVOKE from exec_sql; anyone with the anon key could run SQL (exec-sql-helper.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/setup/sql-statements.test.js` (exec-sql-helper.js, sql-statements.js)
- `tests/setup/bootstrap-db.test.js` (bootstrap-db.js)
- … 3 more → `CLAUDE.index.md`

## Related (generated)
- docs: `docs/local-stack.md`? · `infrastructure/CLAUDE.md`? · `infrastructure/sync/README.md`?
