# pg-adapter — supabase-js query API (from/rpc) compiled to SQL over a pg Pool
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/db/pg-adapter kg=5cbf9d064d05 gen=139c867af16f overflow=9 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `pg-client.js` — createPgClient(pool)
- `query-builder.js` — the builder; `drivers.js` — DB_DRIVER and pool settings
<!-- read: db-rollout 2026-11-02 -->

## Children (generated)
| path | purpose |
|---|---|
| `drivers.js` | DB_DRIVER resolution, required env per driver, placeholder-aware isSet, bundled connection URL and pg Pool settings |
| `errors.js` | Maps adapter and Postgres errors to PostgREST-shaped {message, details, hint, code} plus HTTP status |
| `pg-client.js` | createPgClient(pool): supabase-js-shaped from()/rpc() over pg, reloading the schema cache once on a miss |
| `postgrest-syntax.js` | Parsers for PostgREST select strings, column refs (JSON paths, casts), .or() trees and in-lists; rejects non-identifiers |
| `schema-cache.js` | Reads foreign keys, primary/unique keys and function signatures from the pg catalog once per pool |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `drivers.js` ← imported by `bot/scripts/setup/db-setup.js:26:db1c579e` · `bot/scripts/setup/doctor.js:31:2e1eab1a` (+12)
- `errors.js` ← imported by `bot/shared/services/db/pg-adapter/postgrest-syntax.js:10:55a89b19` · `bot/shared/services/db/pg-adapter/query-builder.js:15:28d09d4e` (+2)
- `pg-client.js` ← imported by `bot/shared/services/db/postgres.js:8:1bb04c6f` · `infrastructure/db/schema.js:19:ac51ce39`
- `postgrest-syntax.js` ← imported by `bot/shared/services/db/pg-adapter/query-builder.js:11:4efad78c` · `bot/shared/services/db/pg-adapter/sql-compiler.js:11:d7906dea`
- … 4 more → `CLAUDE.index.md`

## Never (human)
- Never splice a value into SQL; every value is a bound param and every name passes the identifier check (sql-compiler.js)
- No requires outside this folder: the dashboard ships a byte-identical copy (tests/db/pg-adapter-dashboard-copy.test.js)
<!-- read: db-rollout 2026-11-02 -->

## Tests (generated)
- `tests/db/bundled-database.test.js` (drivers.js)
- `tests/db/pg-client-real-schema.test.js` (pg-client.js)
- … 2 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/db/CLAUDE.md`?
