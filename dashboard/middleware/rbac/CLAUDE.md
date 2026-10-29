# rbac — Role checks, feature gating and the per-request RLS database context

<!-- kg:meta repo=rumi-platform dir=dashboard/middleware/rbac kg=b72b9b48b624 gen=a0ff8d6768b0 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `database-context.js` — checks out a client, SET ROLE portal_app_user, releases on response finish
- `rbac.js` — requireRole/requireSuperAdmin against dashboard_users.role
- `feature-access.js` — per-feature gate backed by the feature_permissions table
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `index.js` | Barrel re-exporting database-context, role and feature-access middleware. |
| `database-context.js` | Checks out a pooled client per request, sets the RLS user context, releases on response finish. |
| `feature-access.js` | Gates routes by feature using the feature_permissions table and the user's dashboard role. |
| `rbac.js` | requireRole/requireSuperAdmin middleware checking dashboard_users.role (super_admin, partner_admin, viewer...). |
| `USAGE_EXAMPLES.md` | Examples of using setDatabaseContext, requireRole and requireFeatureAccess in Express routes. |

## Who reads this (generated)
- `index.js` ← imported by `dashboard/index.js:27:102018cb` · `dashboard/routes/settings.js:7:a91be657`
- `database-context.js` ← imported by `dashboard/middleware/rbac/index.js:10:c9a1c0b4`
- `feature-access.js` ← imported by `dashboard/middleware/rbac/index.js:24:30d1a34e`
- `rbac.js` ← imported by `dashboard/middleware/rbac/index.js:18:0a50f85d`

## Never (human)
- The pooled client must be released exactly once, after RESET ROLE, on finish/close (database-context.js:33, :47, :90)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/middleware/CLAUDE.md`?
