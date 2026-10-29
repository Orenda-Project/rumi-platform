# local — No-Docker local stack (Postgres, PostgREST, proxy, Redis) for development

<!-- kg:meta repo=rumi-platform dir=infrastructure/local kg=1afa4410ebdc gen=4b8319b025b8 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `up.sh` — start the stack and print .env lines
- `supabase-shim.sql` — Supabase roles and auth schema for plain Postgres
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `mint-jwt.js` | Signs an HS256 service_role/anon API key for the local stack using only Node crypto |
| `rest-proxy.js` | Strips the /rest/v1 prefix and forwards to bare PostgREST so supabase-js works locally |
| `supabase-shim.sql` | Gives plain Postgres the Supabase roles, auth schema, auth.uid()/role() and default grants the schema expects |
| `up.sh` | Starts the no-Docker local stack (Postgres, PostgREST, proxy, Redis), applies schema, prints .env lines |
| `_lib.sh` | Sourced settings and helpers (state dir, ports 54329-54331/63799, wipe marker) for local up.sh and down.sh |
| `down.sh` | Stops the local proxy, PostgREST, Redis and Postgres from recorded pids; --wipe deletes the local data |

## Who reads this (generated)
- env read here: `ENV_FILE` · `LOCAL_DIR` · `LOG_DIR` · `MARKER_NAME` · `PGDATA_DIR` · `PGRST_CONF` · `PGRST_PORT` · `PG_BIN` · `PG_BIN_DIR` · `PG_PORT` · `POSTGREST_BIN` · `PROXY_PORT` (+16)

## Never (human)
- Never use the local stack for production; it is local development only (up.sh:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/setup/local-stack-rest-proxy.test.js` (rest-proxy.js)

## Related (generated)
- docs: `CHANGELOG.md`? · `docs/local-stack.md`? · `infrastructure/CLAUDE.md`?
