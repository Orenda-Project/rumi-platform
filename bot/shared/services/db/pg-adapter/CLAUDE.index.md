# pg-adapter — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/db/pg-adapter -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `drivers.js` | DB_DRIVER resolution, required env per driver, placeholder-aware isSet, bundled connection URL and pg Pool settings |
| `errors.js` | Maps adapter and Postgres errors to PostgREST-shaped {message, details, hint, code} plus HTTP status |
| `pg-client.js` | createPgClient(pool): supabase-js-shaped from()/rpc() over pg, reloading the schema cache once on a miss |
| `postgrest-syntax.js` | Parsers for PostgREST select strings, column refs (JSON paths, casts), .or() trees and in-lists; rejects non-identifiers |
| `query-builder.js` | supabase-js-compatible query builder compiling reads, writes and rpc to one SQL statement; never throws, returns {data, error} |
| `rpc.js` | Builds supabase.rpc() calls as named-argument SQL and decides the result shape from the function's return type |
| `schema-cache.js` | Reads foreign keys, primary/unique keys and function signatures from the pg catalog once per pool |
| `sql-compiler.js` | Compiles filters, select trees (embeds via FKs, JSON built in Postgres), order and limit into SQL with bound params |

## Who reads this (all, generated)
- `drivers.js` ← imported by `bot/scripts/setup/db-setup.js:26:db1c579e` · `bot/scripts/setup/doctor.js:31:2e1eab1a` · `bot/shared/config/feature-availability.js:37:b2764947` · `bot/shared/routes/slack-modal-interactions.handler.js:36:d91ffe7d` (+10: `python3 kg/kg.py who-reads drivers.js`)
- `errors.js` ← imported by `bot/shared/services/db/pg-adapter/postgrest-syntax.js:10:55a89b19` · `bot/shared/services/db/pg-adapter/query-builder.js:15:28d09d4e` · `bot/shared/services/db/pg-adapter/rpc.js:12:55a89b19` · `bot/shared/services/db/pg-adapter/sql-compiler.js:12:55a89b19`
- `pg-client.js` ← imported by `bot/shared/services/db/postgres.js:8:1bb04c6f` · `infrastructure/db/schema.js:19:ac51ce39`
- `postgrest-syntax.js` ← imported by `bot/shared/services/db/pg-adapter/query-builder.js:11:4efad78c` · `bot/shared/services/db/pg-adapter/sql-compiler.js:11:d7906dea`
- `query-builder.js` ← imported by `bot/shared/services/db/pg-adapter/pg-client.js:6:fcc6f515`
- `rpc.js` ← imported by `bot/shared/services/db/pg-adapter/query-builder.js:16:a8e56cc4`
- `schema-cache.js` ← imported by `bot/shared/services/db/pg-adapter/pg-client.js:7:cd96d647` · `bot/shared/services/db/pg-adapter/sql-compiler.js:13:5e2ebf28`
- `sql-compiler.js` ← imported by `bot/shared/services/db/pg-adapter/query-builder.js:14:352ecace` · `bot/shared/services/db/pg-adapter/rpc.js:13:48de49b2`

## Tests (all, generated)
- `drivers.js` ← `tests/db/bundled-database.test.js`
- `pg-client.js` ← `tests/db/pg-client-real-schema.test.js`
- `postgrest-syntax.js` ← `tests/db/postgrest-syntax.test.js`

## Related (all, generated)
- docs: `bot/shared/services/db/CLAUDE.md`?
