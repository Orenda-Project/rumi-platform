# portal — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/portal -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `android-allow-navigation.test.js` | Pins Capacitor allowNavigation so portal API-origin links (PDFs, certificates) stay in the WebView with their cookies |
| `android-app-config.test.js` | Pins portal app-config.cjs: package id, label, API host and OTA flag come from env or .env.app with neutral defaults |
| `android-app-links-assetlinks.test.js` | Pins dashboard/lib/asset-links and the /.well-known/assetlinks.json route Android needs for App Links verification |
| `android-build-pipeline.test.js` | Pins app-build-guard: the Android build must use vite --mode app so a web bundle never ships to the app |
| `android-docs-links.test.js` | Checks every relative link in the Android app guides resolves to a file in the repo |
| `android-native-shell.test.js` | Reads portal/android Gradle, manifest and Java as text to pin native-shell facts that only ship via a new APK |
| `android-ota.test.js` | Pins remote-first OTA (PORTAL_APP_OTA=1): WebView loads the live portal SPA; shell and app-target agree |
| `api-base-url-never-localhost.test.js` | Pins resolveApiBaseUrl: a page on a real host never falls back to localhost (staging NODE_ENV bug) |
| `app-links.test.js` | Pins app-links.cjs: turns an incoming Android App Link into an in-app route |
| `app-target.test.js` | Pins app-target.cjs: API base and origin decisions that differ inside the Capacitor WebView (https://localhost) |
| `back-button.test.js` | Pins back-button.cjs: what one Android hardware back press does (go up a page, only exit from the root) |
| `portal-app-session-runtime.test.js` | Runs real portal.routes session and CORS: app.sid stays SameSite-safe so no site can auto-post to admin endpoints |
| `portal-app-session.test.js` | Pins portal-app-origins: the app origin is accepted by the portal API without widening web or admin access |
| `portal-auth-limits.test.js` | Runs real portal.routes sign-in/setup/reset routes: per-IP and per-account rate limits answer a uniform 429 |
| `portal-client-ip.test.js` | Pins dashboard client-ip resolution (TRUST_PROXY, X-Forwarded-For) used by the portal's per-IP limits |
| `portal-invite-channel.test.js` | Pins portal invites for messenger-only users: setup link goes to their own channel (Matrix DM), never a bare number |
| `portal-invite-roster.test.js` | Pins observe-roster portal-invite <coach-phone>: sends the invite on the channel stored on the coach's roster entry |
| `portal-link-at-registration.test.js` | Pins feature-registration portal link after name capture: none minted for users with no signable phone number |
| `portal-reset-code-attempts.test.js` | Pins password-reset hardening: CSPRNG code, wrong-attempt counter, code never logged, lookup bound to the account |
| `portal-reset-code-channel.test.js` | Pins /api/internal/send-password-reset: the reset code is sent on the user's own channel, not a bare number |
| `portal-reset-request.test.js` | Pins password-reset.service request: finds account, stores code, tells the bot the userId; unknown number sends nothing |

## Who reads this (all, generated)
- env `CI` read at `tests/portal/portal-app-session-runtime.test.js:44:dab203a4` · `tests/portal/portal-auth-limits.test.js:35:dab203a4` · `tests/portal/portal-client-ip.test.js:35:dab203a4` · `tests/portal/portal-reset-code-attempts.test.js:232:6d97086b`
- env `PORTAL_APP_ENABLED` read at `tests/portal/portal-app-session-runtime.test.js:135:9c929e69`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/scripts/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.md`? · `dashboard/routes/CLAUDE.index.md`? · `dashboard/services/CLAUDE.index.md`? · `portal/ANDROID.md`? · `portal/CLAUDE.index.md`? · `portal/src/lib/CLAUDE.index.md`? · `portal/src/lib/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`?
