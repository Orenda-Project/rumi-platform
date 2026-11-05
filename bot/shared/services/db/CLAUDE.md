# db — Database client by DB_DRIVER: built-in Postgres, any Postgres, or Supabase

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/db kg=fba467e7caad gen=69a67c9ce6b1 overflow=0 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `index.js` — the client every module gets (via config/supabase.js); exit-78 env gate
- `pg-adapter/` — supabase-js API over pg; `drivers.js` decides which database
<!-- read: db-rollout 2026-11-02 -->

## Children (generated)
| path | purpose |
|---|---|
| `pg-adapter/` | supabase-js query API (from/rpc) compiled to SQL over a pg Pool → `pg-adapter/CLAUDE.md` |
| `index.js` | Database client entry and cold-boot env gate: picks the DB_DRIVER (bundled/postgres/supabase) and exits 78 if its env is missing |
| `postgres.js` | Direct-Postgres driver: the supabase-js from/rpc surface over a lazily created pg Pool; warns once if the built-in DB is down |
| `supabase.js` | Supabase driver: the service-role supabase-js client (PostgREST over HTTPS), unchanged from the original |

## Who reads this (generated)
- `index.js` ← imported by `bot/shared/config/supabase.js:8:473bce9a`
- `postgres.js` ← imported by `bot/shared/services/db/index.js:60:d2f88fe8`
- `supabase.js` ← imported by `bot/shared/services/db/index.js:60:d2f88fe8`
- env read here: `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_URL`

## Never (human)
- Never require a driver (`postgres.js`/`supabase.js`) directly; require the index or config/supabase.js (index.js:60)
- Edit pg-adapter here, then copy it to dashboard/lib/pg-adapter — a test fails on any difference (tests/db/pg-adapter-dashboard-copy.test.js)
<!-- read: db-rollout 2026-11-02 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/CLAUDE.md`?
