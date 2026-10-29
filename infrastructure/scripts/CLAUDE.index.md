# scripts — full index (generated)

<!-- kg:index repo=rumi-platform dir=infrastructure/scripts -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `backfill-user-channels.js` | One-off re-runnable backfill giving every existing user a primary whatsapp row in user_channels |
| `bootstrap-db.js` | Fresh-install bootstrap: applies 00 schema, 01 RLS, 02 seed, then versioned migrations via exec_sql |
| `exec-sql-helper.js` | Holds the one-time exec_sql SECURITY DEFINER SQL (service_role-only) pasted into a new Supabase project |
| `migrate.js` | Applies V*.sql migrations in version order to an existing deployment, tracking them in schema_versions |
| `repo-env.js` | Loads the repo-root .env into process.env for scripts run from the root where dotenv is absent |
| `sql-statements.js` | Splits a SQL file into single statements (dollar-quote and string safe) for exec_sql, one per RPC |
| `sync-from-internal.sh` | Maintainer tool: builds a patch from the internal repo into this public repo using sync/manifest.json |
| `test-connections.js` | Checks connectivity to Supabase, Redis and the LLM provider; run via npm run validate:connections |

## Who reads this (all, generated)
- `bootstrap-db.js` ← imported by `bot/scripts/setup/db-setup.js:138:fc4dd291`
- `exec-sql-helper.js` ← imported by `bot/scripts/setup/db-setup.js:18:f0eb4ee3` · `infrastructure/scripts/bootstrap-db.js:5:c3819f64` · `infrastructure/scripts/migrate.js:5:6ea0e11f`
- `repo-env.js` ← imported by `infrastructure/scripts/bootstrap-db.js:182:560c9d91` · `infrastructure/scripts/migrate.js:6:d115ab38`
- `sql-statements.js` ← imported by `infrastructure/scripts/bootstrap-db.js:4:c56cb184`
- env `LLM_PROVIDER` read at `infrastructure/scripts/test-connections.js:56:d406880d`
- env `OPENAI_API_KEY` read at `infrastructure/scripts/test-connections.js:58:5a71544e`
- env `OPENROUTER_API_KEY` read at `infrastructure/scripts/test-connections.js:59:7d95c2e1`
- env `REDIS_URL` read at `infrastructure/scripts/test-connections.js:40:992fa62f`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `infrastructure/scripts/backfill-user-channels.js:94:f365c12e` · `infrastructure/scripts/bootstrap-db.js:184:9ea5621a` · `infrastructure/scripts/migrate.js:264:9ea5621a` · `infrastructure/scripts/test-connections.js:20:f365c12e`
- env `SUPABASE_URL` read at `infrastructure/scripts/backfill-user-channels.js:93:eb12de3c` · `infrastructure/scripts/bootstrap-db.js:183:71c0cc32` · `infrastructure/scripts/migrate.js:263:71c0cc32` · `infrastructure/scripts/test-connections.js:19:eb12de3c`

## Tests (all, generated)
- `bootstrap-db.js` ← `tests/setup/bootstrap-db.test.js`
- `exec-sql-helper.js` ← `tests/setup/exec-sql-service-role-only.test.js` · `tests/setup/sql-statements.test.js`
- `migrate.js` ← `tests/setup/migrate.test.js`
- `repo-env.js` ← `tests/setup/migrate-cli.test.js`
- `sql-statements.js` ← `tests/setup/sql-statements.test.js`

## Related (all, generated)
- docs: `docs/local-stack.md`? · `infrastructure/CLAUDE.md`? · `infrastructure/sync/README.md`?
