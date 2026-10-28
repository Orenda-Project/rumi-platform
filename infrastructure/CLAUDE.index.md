# infrastructure — full index (generated)

<!-- kg:index repo=rumi-platform dir=infrastructure -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `local/` | (no description yet) → `local/CLAUDE.md` |
| `railway/` | → (no door; 2 files) |
| `scripts/` | (no description yet) → `scripts/CLAUDE.md` |
| `supabase/` | (no description yet) → `supabase/CLAUDE.md` |
| `sync/` | (no description yet) → `sync/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- skills: `database-analysis`? · `digital-coach`?
- docs: `CLAUDE.md`? · `README.md`? · `docs/local-stack.md`? · `infrastructure/sync/README.md`?

## Previous notes (human, unverified — moved here from the old CLAUDE.md)
**Parent:** [../CLAUDE.md](../CLAUDE.md) · Supabase (Postgres) schema + deployment configs.

## Layout

| Path | What's there |
|------|--------------|
| `supabase/00_complete-schema.sql` | The single fresh-install artifact — 76 tables, functions, triggers, + an idempotent column-reconcile section at the end |
| `supabase/01_rls-policies.sql` | Row-level security policies |
| `supabase/02_seed-data.sql` | Reference data (reading benchmarks) + `region_features` default row (fail-open gating) |
| `supabase/migrations/V*.sql` | Versioned upgrades, tracked in `schema_versions` |
| `supabase/verify-schema.sql` | Sanity checks |
| `scripts/bootstrap-db.js` | **`npm run bootstrap:db`** — applies schema → RLS → seed → every `V*.sql` migration (recorded in `schema_versions`), in order (idempotent, stops on first error) |
| `scripts/migrate.js` | Applies pending `V*.sql` migrations via the `exec_sql` RPC |
| `scripts/test-connections.js` | `npm run validate:connections` |
| `railway/` | Deployment configs |
| `local/` | Supabase-free local stack: `up.sh` / `down.sh` start Postgres + PostgREST + a `/rest/v1` proxy + Redis on a laptop, no Docker (see `docs/local-stack.md`) |

## Rules

- **Fresh install** = `npm run bootstrap:db` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and an
  `exec_sql` function — see the script header). It is idempotent, so re-running is safe. It ends by applying
  the migrations and recording them, so a fresh install has every migration and `migrate.js` finds none pending.
- **A new migration still belongs in `00_complete-schema.sql` too** — bootstrap's migration step is a backstop,
  not a replacement: the complete schema stays the readable picture of the database.
- **Schema is the source of truth, and CI enforces it both ways:** every `.from()` table and every `.rpc()`
  function the bot uses must exist here, every insert/select column must exist, and every table must be
  referenced somewhere. If you add a `.from('x')` / new column / new `.rpc()`, add it here or the
  `tests/setup/{schema,column}-completeness` + `table-usage-conformance` guards fail.
- **Adding a column to an existing table:** put it in the column-reconcile `ALTER … ADD COLUMN IF NOT EXISTS`
  section at the bottom (keeps fresh-install + re-run both correct), and keep the trailing `NOTIFY pgrst`
  last so PostgREST reloads the cache.
- **Region gating** lives in `region_features` (DB, fail-open) — not in code constants.
