# db — Tests for the database layer: pg adapter parity, real schema, drivers, built-in DB

<!-- kg:meta repo=rumi-platform dir=tests/db kg=ed6928dc9855 gen=a6d7fdfb8df6 overflow=0 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `pg-client.test.js` — adapter vs supabase-js behaviour on a real Postgres
- `pg-client-real-schema.test.js` — every shipped select against the real schema
<!-- read: db-rollout 2026-11-02 -->

## Children (generated)
| path | purpose |
|---|---|
| `bundled-database.test.js` | Pins the built-in database end to end: password, start/reuse, full schema creation, no-op rerun, wrong-port guard |
| `pg-client-real-schema.test.js` | Runs every literal select in shipped code against the real schema through the adapter, plus real call shapes |
| `postgrest-syntax.test.js` | Pins the PostgREST select / column-ref / logic-tree / in-list parsers used by the pg adapter |
| `pg-client.test.js` | Pins the pg adapter's supabase-js parity on a real Postgres: filters, embeds, writes, rpc, counts, error codes |
| `db-driver.test.js` | Pins DB_DRIVER resolution, required env, bundled URL, pool settings, sslmode handling and the exit-78 boot gate |
| `pg-adapter-dashboard-copy.test.js` | Pins dashboard/lib/pg-adapter as a byte-identical copy of bot/shared/services/db/pg-adapter |
| `rollout-fixes.test.js` | Pins built-in-DB fixes outside the DB layer: Brief database URL, settings catalogue cards, A/B impression fallback |

## Who reads this (generated)
- (none)

## Never (human)
- Remove a KNOWN_DRIFT entry when its query is fixed; the test fails if a listed select starts succeeding (pg-client-real-schema.test.js)
<!-- read: db-rollout 2026-11-02 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/db/pg-adapter/CLAUDE.md`? · `dashboard/lib/pg-adapter/CLAUDE.md`? · `infrastructure/db/CLAUDE.md`? · `tests/CLAUDE.md`?
