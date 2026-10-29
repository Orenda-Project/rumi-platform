# supabase — Canonical schema (00), RLS (01), seed (02), verify script and migrations
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=infrastructure/supabase kg=d408b6e24a20 gen=caec7bd5d402 overflow=440 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `00_complete-schema.sql` — idempotent full schema
- `01_rls-policies.sql` — run after 00
- `verify-schema.sql` — post-setup table checks
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `migrations/` | Versioned V<major.minor.patch>__name.sql changes for existing deployments → `migrations/CLAUDE.md` |
| `00_complete-schema.sql` | Complete fresh-install schema: extensions, ~80 tables, functions, triggers, indexes; idempotent |
| `01_rls-policies.sql` | Enables row-level security on all tables and adds service_role policies; run after 00 schema |
| `02_seed-data.sql` | Seeds reference data: WCPM reading benchmarks and the region_features default; run after 00 and 01 |
| `verify-schema.sql` | Post-setup checks that expected tables exist (count >= 55) and each returns PASS/FAIL |

## Who reads this (generated)
- column `users.id` (written by `00_complete-schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+51)
- column `coaching_sessions.id` (written by `00_complete-schema.sql`) ← read by `bot/scripts/generate-coaching-excel.js:29:094f71c7` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` (+45)
- column `users.phone_number` (written by `00_complete-schema.sql`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+34)
- column `coaching_sessions.status` (written by `00_complete-schema.sql`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` (+28)
- … 440 more → `CLAUDE.index.md`

## Never (human)
- Never run 01 or 02 before 00_complete-schema.sql; the order is 00, 01, 02 (02_seed-data.sql:3)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `ab-testing`? · `database-analysis`? · `feature-tracer`?
- docs: `.claude/skills/database-analysis/reference/query-patterns.md`? · `CHANGELOG.md`? · `SECURITY.md`? · `SETUP.md`? · `dashboard/docs/PARTNER_RBAC_STATUS.md`? · `docs/agent-customization.md`? (+8)
