# dashboard — Tests for the Express dashboard's CSP, HTML escaping, AMA routes and boot deps
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/dashboard kg=10914aa6440d gen=7f9ad4cc567e overflow=5 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `admin-csp.test.js` — strict nonce CSP, no unsafe-inline, pinned script URLs
- `ejs-raw-output-allowlist.test.js` — every raw EJS tag is reviewed
- `production-dependencies.test.js` — runtime packages must not be devDependencies
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `admin-view-escaping/` | → (no door; 10 tests) |
| `helpers/` | → (no door; 1 files: 0 test + 1 support) |
| `ama-routes.test.js` | Mounts ama.routes.js over the real AMA service and fake Supabase; pins the routes no longer answering 500 |
| `admin-csp.test.js` | Pins dashboard/lib/admin-csp.js: strict per-response nonce CSP, no unsafe-inline, exact pinned script URLs |
| `portal-channels.test.js` | Pins GET /api/portal/channels env mapping: CHANNEL_DRIVER=none hides WhatsApp, PORTAL_CHAT_URL only if a web link |
| `admin-views-raw-output.test.js` | Renders admin views with a hostile value each and checks no teacher or user text reaches the page as markup |
| `csp-actions-views.test.js` | Scans admin EJS views so every data-on-* handler used is registered with window.cspActions |
| `database-ssl.test.js` | Pins the dashboard Postgres pool dropping SSL with SUPABASE_DB_SSL=off for the local stack |
| `ejs-raw-output-allowlist.test.js` | Pins every raw <%- %> in admin views being an include, safeJson or listed constant, and no <%= %> in scripts |
| … | 5 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Admin script-src must never allow unsafe-inline or CDN origins (tests/dashboard/admin-csp.test.js:5)
- Data into an inline script must go through safeJson (tests/dashboard/ejs-raw-output-allowlist.test.js:3)
- A package the dashboard requires must be in dependencies (tests/dashboard/production-dependencies.test.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `dashboard/lib/CLAUDE.md`? · `dashboard/routes/CLAUDE.md`? · `docs/features/admin-views-security.md`? (+1)
