# lib — full index (generated)

<!-- kg:index repo=rumi-platform dir=portal/src/lib -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `app-build-guard.cjs` | Fails 'vite build --mode app' unless VITE_API_BASE_URL is an absolute https url; called from vite.config.ts |
| `app-config.cjs` | Reads app id, name, API url and OTA flag from env, then .env.app, then defaults; shared by capacitor.config.ts |
| `app-links.cjs` | Decides what a tapped Android App Link means: own-origin /portal/ paths navigate, everything else is ignored |
| `app-target.cjs` | Pure rules for 'portal or marketing site' and API base url, incl. native-app and OTA url; wrapped by runtime.ts |
| `back-button.cjs` | Pure rule for the Android back key: close dialog, leave from home pages, else go back; used by BackButtonHandler |
| `funnelTracking.ts` | Posts visit and CTA-click events to VITE_TRACKING_API_URL (default /api/track) and builds the WhatsApp chat url |
| `greeting.test.ts` | Pins welcomeBack: greets by first name, drops the name (not an empty one) when unknown |
| `greeting.ts` | welcomeBack(): builds the dashboard greeting, 'Welcome back!' when the first name is missing |
| `runtime.ts` | Reads Capacitor, Vite env and location, for app-target rules: isNativeApp, isPortalTarget, getApiBaseUrl |
| `utils.ts` | cn() helper merging class names with clsx and tailwind-merge |

## Who reads this (all, generated)
- `app-build-guard.cjs` ← imported by `portal/vite.config.ts:5:ccead7d7`
- `app-config.cjs` ← imported by `portal/capacitor.config.ts:5:11de0f55`
- `app-links.cjs` ← imported by `portal/src/portal/components/AppLinkListener.tsx:4:1cf0cb7e` · `portal/src/lib/runtime.ts:10:7dd7b9ce`
- `app-target.cjs` ← imported by `portal/capacitor.config.ts:3:eb551b02` · `portal/src/lib/runtime.ts:9:0566a3e7`
- `back-button.cjs` ← imported by `portal/src/portal/components/BackButtonHandler.tsx:4:8f28e5c4`
- `funnelTracking.ts` ← imported by `portal/src/components/FinalCTA.tsx:4:36974acc` · `portal/src/components/Hero.tsx:5:36974acc` · `portal/src/components/Navigation.tsx:5:36974acc` · `portal/src/hooks/useChatChannel.ts:3:3ab6b269` (+2: `python3 kg/kg.py who-reads funnelTracking.ts`)
- `greeting.ts` ← imported by `portal/src/portal/pages/PortalDashboard.tsx:17:003ef768`
- `runtime.ts` ← imported by `portal/src/App.tsx:8:84711a37` · `portal/src/hooks/useChatChannel.ts:2:d55d64c9` · `portal/src/portal/components/AppLinkListener.tsx:3:2073a29f` · `portal/src/portal/components/BackButtonHandler.tsx:3:d8ecf33b` (+2: `python3 kg/kg.py who-reads runtime.ts`)
- `utils.ts` ← imported by `portal/src/components/ui/badge.tsx:4:a05a987a` · `portal/src/components/ui/button.tsx:5:a05a987a` · `portal/src/components/ui/card.tsx:3:a05a987a` · `portal/src/components/ui/dialog.tsx:5:a05a987a` (+48: `python3 kg/kg.py who-reads utils.ts`)
- env `PROD` read at `portal/src/lib/runtime.ts:51:cc7428bc`
- env `VITE_API_BASE_URL` read at `portal/src/lib/runtime.ts:52:a6b1897d`
- env `VITE_APP_TARGET` read at `portal/src/lib/runtime.ts:42:f9f6e6f6`
- env `VITE_TRACKING_API_URL` read at `portal/src/lib/funnelTracking.ts:6:813d3283`

## Tests (all, generated)
- `app-build-guard.cjs` ← `tests/portal/android-build-pipeline.test.js`
- `app-config.cjs` ← `tests/portal/android-app-config.test.js` · `tests/portal/android-native-shell.test.js`
- `app-links.cjs` ← `tests/portal/app-links.test.js`
- `app-target.cjs` ← `tests/portal/android-ota.test.js` · `tests/portal/api-base-url-never-localhost.test.js` · `tests/portal/app-target.test.js`
- `back-button.cjs` ← `tests/portal/back-button.test.js`
- `greeting.ts` ← `portal/src/lib/greeting.test.ts`

## Related (all, generated)
- docs: `portal/ANDROID.md`? · `portal/src/CLAUDE.md`?
