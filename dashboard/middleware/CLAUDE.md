# middleware — Express middleware: session auth, request timeouts, latency logging, RBAC

<!-- kg:meta repo=rumi-platform dir=dashboard/middleware kg=68b387c08ea5 gen=eaa971f20e5e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `auth.js` — requireAuth, requireAdmin, addUserToLocals
- `rbac/index.js` — barrel for database-context, role and feature-access guards
- `timeout.js` — per-route timeouts (GPT routes get 120s)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `rbac/` | Role checks, feature gating and the per-request RLS database context → `rbac/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `auth.js` | requireAuth/requireAdmin/addUserToLocals: session check, admin-role test and dashboard_users lookup for views. |
| `latency-logger.js` | Logs request duration and flags requests slower than 5s to console/Axiom. |
| `timeout.js` | Per-route request timeouts (30s default, 120s for GPT routes, 10s static). |

## Who reads this (generated)
- `auth.js` ← imported by `dashboard/index.js:18:4e45b290`
- `latency-logger.js` ← imported by `dashboard/index.js:20:93d3201a`
- `timeout.js` ← imported by `dashboard/index.js:19:f961953a`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/middleware/CLAUDE.md`? · `dashboard/middleware/rbac/CLAUDE.md`?
