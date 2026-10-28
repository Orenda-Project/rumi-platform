# portal — Tests for the teacher portal backend and Android app shell
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/portal kg=23f262daf761 gen=89e2564f17c9 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `portal-auth-limits.test.js` — rate limits on public sign-in routes
- `portal-reset-code-attempts.test.js` — reset-code guessing defences
- `android-ota.test.js` — remote-first app update behaviour
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `portal*` | 10 files; most used `portal-client-ip.test.js`: Pins dashboard client-ip resolution (TRUST_PROXY, X-Forwarded-For) used by the portal's per-IP limits |
| `app-target.test.js` | Pins app-target.cjs: API base and origin decisions that differ inside the Capacitor WebView (https://localhost) |
| `android*` | 7 files; most used `android-ota.test.js`: Pins remote-first OTA (PORTAL_APP_OTA=1): WebView loads the live portal SPA; shell and app-target agree |
| `api-base-url-never-localhost.test.js` | Pins resolveApiBaseUrl: a page on a real host never falls back to localhost (staging NODE_ENV bug) |
| `app-links.test.js` | Pins app-links.cjs: turns an incoming Android App Link into an in-app route |
| `back-button.test.js` | Pins back-button.cjs: what one Android hardware back press does (go up a page, only exit from the root) |

## Who reads this (generated)
- env read here: `CI` · `PORTAL_APP_ENABLED`

## Never (human)
- The admin login cookie must stay SameSite=Lax even with the app enabled (portal-app-session-runtime.test.js:159)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.md`? (+10)
