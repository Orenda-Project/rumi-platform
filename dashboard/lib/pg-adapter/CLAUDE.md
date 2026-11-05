# pg-adapter — Byte-identical copy of bot/shared/services/db/pg-adapter for the dashboard
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/lib/pg-adapter kg=eae5133d9701 gen=e4d5df86ec05 overflow=5 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `pg-client.js` — createPgClient(pool), used by dashboard/config/supabase.js
<!-- read: db-rollout 2026-11-02 -->

## Children (generated)
| path | purpose |
|---|---|
| `errors.js` | Dashboard's byte-identical copy of bot pg-adapter/errors.js (the dashboard deploys alone); kept in sync by a test |
| `drivers.js` | Dashboard's byte-identical copy of bot pg-adapter/drivers.js (the dashboard deploys alone); kept in sync by a test |
| `postgrest-syntax.js` | Dashboard's byte-identical copy of bot pg-adapter/postgrest-syntax.js (the dashboard deploys alone); kept in sync by a test |
| `schema-cache.js` | Dashboard's byte-identical copy of bot pg-adapter/schema-cache.js (the dashboard deploys alone); kept in sync by a test |
| `sql-compiler.js` | Dashboard's byte-identical copy of bot pg-adapter/sql-compiler.js (the dashboard deploys alone); kept in sync by a test |
| `pg-client.js` | Dashboard's byte-identical copy of bot pg-adapter/pg-client.js (the dashboard deploys alone); kept in sync by a test |
| `query-builder.js` | Dashboard's byte-identical copy of bot pg-adapter/query-builder.js (the dashboard deploys alone); kept in sync by a test |
| … | 1 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `errors.js` ← imported by `dashboard/lib/pg-adapter/postgrest-syntax.js:10:55a89b19` · `dashboard/lib/pg-adapter/query-builder.js:15:28d09d4e` (+2)
- `drivers.js` ← imported by `dashboard/config/database.js:16:5b80ed49` · `dashboard/config/supabase.js:15:38348cc0` (+1)
- `postgrest-syntax.js` ← imported by `dashboard/lib/pg-adapter/query-builder.js:11:4efad78c` · `dashboard/lib/pg-adapter/sql-compiler.js:11:d7906dea`
- `schema-cache.js` ← imported by `dashboard/lib/pg-adapter/pg-client.js:7:cd96d647` · `dashboard/lib/pg-adapter/sql-compiler.js:13:5e2ebf28`
- … 4 more → `CLAUDE.index.md`

## Never (human)
- Never edit here; edit bot/shared/services/db/pg-adapter and copy (tests/db/pg-adapter-dashboard-copy.test.js)
<!-- read: db-rollout 2026-11-02 -->

## Tests (generated)
- `tests/db/pg-client.test.js`? (pg-client.js)
- `tests/db/postgrest-syntax.test.js`? (postgrest-syntax.js)

## Related (generated)
- docs: `dashboard/lib/CLAUDE.md`?
