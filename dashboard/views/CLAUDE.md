# views — EJS pages for the operator dashboard, plus nav and release-feed partials
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/views kg=848f3554f4a8 gen=8a9a323819c5 overflow=28 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `partials/navigation.ejs` — shared nav; read it to see every page and who may see it
- `dashboard.ejs` — the Overview landing page
- `transcript-enhanced.ejs` — the largest page: processed coaching transcript
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `partials/` | → (no door; 2 files) |
| `ab-testing.ejs` | A/B test page: lists ab_tests with variants and results; rendered by GET /observability/ab-testing in index.js. |
| `admin-invitations.ejs` | Super-admin page to create, resend, revoke partner invitations with scope preview via /api/admin/invitations. |
| `admin-users.ejs` | Super-admin user table: edit access scope, deactivate, bulk-deactivate dashboard users via /api/admin/users. |
| `ama.ejs` | AMA chat UI: conversation list, streamed answers, charts; calls /observability/ama routes. |
| `api-health.ejs` | API Health page rendering per-service usage and limit cards from /observability/api/api-health. |
| `brief-screen.ejs` | Full-bleed single-panel Morning Brief page for office wall displays; refreshes itself. |
| `brief.ejs` | Morning Brief page: cover, panels with captions and dateline for the daily or weekly brief. |
| `broadcast-history.ejs` | Lists past WhatsApp broadcasts and their delivery status from broadcast_logs. |
| `broadcast.ejs` | Broadcast composer: pick audience, dry-run, submit, watch stats or cancel via /api/broadcast endpoints. |
| … | 25 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Data in inline scripts must go through safeJson, and HTML must be built via escapeHtml (lib/safe-json.js, escape-html.js)
- Never use inline onclick attributes; the CSP blocks them (lib/admin-csp.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/dashboard/admin-view-escaping/admin-invitations.test.js`? (admin-invitations.ejs)
- `tests/dashboard/admin-view-escaping/admin-users.test.js`? (admin-users.ejs)
- … 6 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.md`? · `docs/features/admin-views-security.md`?
