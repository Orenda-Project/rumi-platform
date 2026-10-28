# lib — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/lib -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `admin-csp.js` | Sets a per-request nonce CSP on rendered admin views (no unsafe-inline); applied from res.render. |
| `asset-links.js` | Builds the Android assetlinks.json served at /.well-known for the portal app from ANDROID_APP_* env. |
| `client-ip.js` | Resolves the caller IP from TRUST_PROXY/X-Forwarded-For for per-IP rate limits. |
| `portal-app-origins.js` | Computes CORS origins and cookie SameSite policy for the Capacitor Android/iOS portal app. |
| `portal-auth-limits.js` | Redis-backed (memory fallback) per-IP and per-account rate limits for portal login, setup and reset routes. |
| `portal-channels.js` | Decides whether the deployment runs WhatsApp and which chat link the portal shows; served at /api/portal/channels. |
| `redact-url.js` | Reduces a file URL to host + path hash + extension so logs never hold openable signed URLs. |
| `safe-json.js` | Serialises data for inline script tags in EJS views, escaping < > & and U+2028/9 to prevent XSS. |

## Who reads this (all, generated)
- `admin-csp.js` ← imported by `dashboard/index.js:29:5ea6f3b2`
- `asset-links.js` ← imported by `dashboard/index.js:137:60938a24`
- `client-ip.js` ← imported by `dashboard/index.js:60:3962e0d9` · `dashboard/lib/portal-auth-limits.js:42:0d418631`
- `portal-app-origins.js` ← imported by `dashboard/index.js:143:3c8ff0bd` · `dashboard/routes/portal.routes.js:36:f5af05fe`
- `portal-auth-limits.js` ← imported by `dashboard/index.js:59:ff15cd53` · `dashboard/routes/portal.routes.js:37:9af46cb0`
- `portal-channels.js` ← imported by `dashboard/routes/portal.routes.js:38:b2d16800`
- `redact-url.js` ← imported by `dashboard/routes/portal.routes.js:39:746bd98f` · `dashboard/services/r2.service.js:9:746bd98f`
- `safe-json.js` ← imported by `dashboard/index.js:30:57997be3`
- env `SESSION_SECRET` read at `dashboard/lib/portal-auth-limits.js:103:e5da8385`

## Tests (all, generated)
- `admin-csp.js` ← `tests/dashboard/admin-csp.test.js` · `tests/dashboard/ama-routes.test.js`
- `asset-links.js` ← `tests/portal/android-app-links-assetlinks.test.js`
- `client-ip.js` ← `tests/portal/portal-client-ip.test.js`
- `portal-app-origins.js` ← `tests/portal/portal-app-session-runtime.test.js` · `tests/portal/portal-app-session.test.js`
- `portal-auth-limits.js` ← `tests/portal/portal-auth-limits.test.js` · `tests/portal/portal-client-ip.test.js`
- `portal-channels.js` ← `tests/dashboard/portal-channels.test.js`
- `redact-url.js` ← `tests/unit/redact-url.test.js`
- `safe-json.js` ← `tests/dashboard/admin-views-raw-output.test.js` · `tests/dashboard/ama-routes.test.js` · `tests/dashboard/helpers/render-admin-view.js` · `tests/dashboard/safe-json.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/README.md`? · `dashboard/lib/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/admin-views-security.md`? · `portal/ANDROID.md`? · `portal/CLAUDE.index.md`? · `tests/dashboard/CLAUDE.index.md`? · `tests/dashboard/CLAUDE.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`? · `tests/unit/CLAUDE.md`?
