# lib — Small pure helpers: CSP, rate limits, proxy IP, URL redaction, safe JSON
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/lib kg=646c162631df gen=2073c8efbaba overflow=17 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `admin-csp.js` — nonce-based CSP for rendered admin views
- `portal-auth-limits.js` — rate limits on portal sign-in, setup and reset routes
- `safe-json.js` — the only safe way to put data in an inline script in a view
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `safe-json.js` | Serialises data for inline script tags in EJS views, escaping < > & and U+2028/9 to prevent XSS. |
| `admin-csp.js` | Sets a per-request nonce CSP on rendered admin views (no unsafe-inline); applied from res.render. |
| `portal*` | 3 files; most used `portal-auth-limits.js`: Redis-backed (memory fallback) per-IP and per-account rate limits for portal login, setup and reset routes. |
| `client-ip.js` | Resolves the caller IP from TRUST_PROXY/X-Forwarded-For for per-IP rate limits. |
| … | 4 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `client-ip.js` ← imported by `dashboard/index.js:60:3962e0d9` · `dashboard/lib/portal-auth-limits.js:42:0d418631`
- `portal-app-origins.js` ← imported by `dashboard/index.js:143:3c8ff0bd` · `dashboard/routes/portal.routes.js:36:f5af05fe`
- `portal-auth-limits.js` ← imported by `dashboard/index.js:59:ff15cd53` · `dashboard/routes/portal.routes.js:37:9af46cb0`
- `redact-url.js` ← imported by `dashboard/routes/portal.routes.js:39:746bd98f` · `dashboard/services/r2.service.js:9:746bd98f`
- … 5 more → `CLAUDE.index.md`

## Never (human)
- script-src must never allow unsafe-inline; views bind events via data-on-* (lib/admin-csp.js:9)
- Always send one identical 429 whether or not the account exists (lib/portal-auth-limits.js:7)
- Log only redacted file URLs, never signed ones (lib/redact-url.js, services/r2.service.js imports it)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/dashboard/ama-routes.test.js` (admin-csp.js, safe-json.js)
- `tests/portal/portal-client-ip.test.js` (client-ip.js, portal-auth-limits.js)
- … 10 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `docs/features/admin-views-security.md`? · `portal/ANDROID.md`?
