# portal — Open-source teacher portal: React/Vite SPA, also wrapped as an Android app
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=portal kg=03dabf203ce8 gen=2fb4a9856379 overflow=8 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `src/App.tsx` — route table: landing pages plus every /portal/* screen
- `src/portal/services/api.ts` — every backend endpoint the portal calls
- `ANDROID.md` — Capacitor app build, OTA mode and release steps
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `.github/` | → (no door; 1 files) |
| `android/` | → (no door; 40 files) |
| `public/` | → (no door; 5 files) |
| `src/` | Portal source: entry, routes, landing site, libs, i18n and the /portal app → `src/CLAUDE.md` |
| `ANDROID.md` | Explains building, testing and releasing the Capacitor Android app that wraps the portal (JDK 21, SDK 36, OTA mode) |
| `CLAUDE.index.md` | (unmapped) |
| `README.md` | Introduces the Phase 2 teacher portal: what it shows, prerequisites, npm commands and where deployment is documented |
| `GITHUB_ACTIONS_SETUP.md` | Walks through the PAT-and-secret setup for the Lovable-to-backend auto-deploy workflow; older setup note |
| `capacitor.config.ts` | Configures the Capacitor Android shell: app id/name, API host, opt-in OTA server url and offline fallback page |
| `CLAUDE.md` | (unmapped) |
| `package.json` | Declares the portal's scripts (dev, build, build:app, android:*, test), React/Radix/axios/i18next deps, Apache-2.0 |
| `vite.config.ts` | Vite config: React SWC, @ alias, port 8080, dev-only lovable-tagger, and the app-mode build guard |
| `components.json` | shadcn/ui generator config: slate base colour, CSS variables, and the @/components, @/lib, @/hooks aliases |
| … | 8 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Do not hand-edit the backend's portal-frontend/dist; the deploy workflow wipes it (deploy-to-backend.yml:48)
- App-mode build must always have an absolute https VITE_API_BASE_URL, or it white-screens (vite.config.ts:11)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `.github/workflows/CLAUDE.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `README.md`? · `SETUP.md`? · `bot/shared/config/CLAUDE.index.md`? (+16)
