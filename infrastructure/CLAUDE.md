# infrastructure — Install-time infra: DB schema and migrations, scripts, local stack, Railway

<!-- kg:meta repo=rumi-platform dir=infrastructure kg=21818ce14ecd gen=ba256414c340 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `supabase/00_complete-schema.sql` — full fresh-install schema
- `scripts/bootstrap-db.js` — applies schema, RLS, seed, migrations
- `scripts/migrate.js` — applies pending V*.sql to an existing DB
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `local/` | No-Docker local stack (Postgres, PostgREST, proxy, Redis) for development → `local/CLAUDE.md` |
| `railway/` | → (no door; 2 files) |
| `scripts/` | Node scripts that create and migrate the database and test connections → `scripts/CLAUDE.md` |
| `supabase/` | Canonical schema (00), RLS (01), seed (02), verify script and migrations → `supabase/CLAUDE.md` |
| `sync/` | Maintainer-only config for syncing internal code into this public repo → `sync/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `database-analysis`? · `digital-coach`?
- docs: `CLAUDE.md`? · `README.md`? · `docs/CLAUDE.index.md`? · `docs/local-stack.md`? · `infrastructure/CLAUDE.index.md`? · `infrastructure/CLAUDE.md`? (+7)
