# dashboard — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/dashboard -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `admin-view-escaping/` | jsdom tests that admin EJS views render hostile API values as text, not markup → `admin-view-escaping/CLAUDE.md` |
| `helpers/` | → (no door; 1 test files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `admin-csp.test.js` | Pins dashboard/lib/admin-csp.js: strict per-response nonce CSP, no unsafe-inline, exact pinned script URLs |
| `admin-views-raw-output.test.js` | Renders admin views with a hostile value each and checks no teacher or user text reaches the page as markup |
| `ama-routes.test.js` | Mounts ama.routes.js over the real AMA service and fake Supabase; pins the routes no longer answering 500 |
| `csp-actions-views.test.js` | Scans admin EJS views so every data-on-* handler used is registered with window.cspActions |
| `csp-actions.test.js` | Loads csp-actions.js into jsdom and pins that only registered handlers run, never window globals |
| `database-ssl.test.js` | Pins the dashboard Postgres pool dropping SSL with SUPABASE_DB_SSL=off for the local stack |
| `ejs-raw-output-allowlist.test.js` | Pins every raw <%- %> in admin views being an include, safeJson or listed constant, and no <%= %> in scripts |
| `github-api-not-found.test.js` | Pins getRepoTree answering "Branch not found" with the right branch name on a 404 (axios mocked) |
| `portal-channels.test.js` | Pins GET /api/portal/channels env mapping: CHANNEL_DRIVER=none hides WhatsApp, PORTAL_CHAT_URL only if a web link |
| `production-dependencies.test.js` | Pins that every package the dashboard and portal build require sits in dependencies, not devDependencies |
| `resend-email-lazy.test.js` | Pins the dashboard email service building its Resend client lazily so boot works without RESEND_API_KEY |
| `safe-json.test.js` | Pins safeJson escaping <, >, & and U+2028/9 so data in an admin inline script cannot close the tag |

## Who reads this (all, generated)
- env `CI` read at `tests/dashboard/admin-csp.test.js:202:dab203a4` · `tests/dashboard/admin-views-raw-output.test.js:25:dab203a4` · `tests/dashboard/ama-routes.test.js:21:dab203a4` · `tests/dashboard/csp-actions.test.js:26:252df85c` · `tests/dashboard/portal-channels.test.js:66:dab203a4`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/shared/config/CLAUDE.index.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `dashboard/lib/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.md`? · `dashboard/routes/CLAUDE.index.md`? · `dashboard/routes/CLAUDE.md`? · `dashboard/services/CLAUDE.index.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/admin-views-security.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/dashboard/CLAUDE.index.md`? · `tests/dashboard/CLAUDE.md`? · `tests/dashboard/admin-view-escaping/CLAUDE.md`?
