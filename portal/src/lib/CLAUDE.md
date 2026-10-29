# lib — Pure rules and adapters: app/portal detection, API base url, back key, tracking
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=portal/src/lib kg=89006ccdbbe3 gen=9003e644e8a0 overflow=15 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `runtime.ts` — reads the environment; the one place that detects the app
- `app-target.cjs` — pure decisions: portal vs landing, API base url, OTA url
- `funnelTracking.ts` — visit and CTA events posted to the tracking API
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `utils.ts` | cn() helper merging class names with clsx and tailwind-merge |
| `runtime.ts` | Reads Capacitor, Vite env and location, for app-target rules: isNativeApp, isPortalTarget, getApiBaseUrl |
| `funnelTracking.ts` | Posts visit and CTA-click events to VITE_TRACKING_API_URL (default /api/track) and builds the WhatsApp chat url |
| `app*` | 4 files; most used `app-target.cjs`: Pure rules for 'portal or marketing site' and API base url, incl. native-app and OTA url; wrapped by runtime.ts |
| `back-button.cjs` | Pure rule for the Android back key: close dialog, leave from home pages, else go back; used by BackButtonHandler |
| … | 5 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `utils.ts` ← imported by `portal/src/components/ui/badge.tsx:4:a05a987a` · `portal/src/components/ui/button.tsx:5:a05a987a` (+50)
- `funnelTracking.ts` ← imported by `portal/src/components/FinalCTA.tsx:4:36974acc` · `portal/src/components/Hero.tsx:5:36974acc` (+4)
- `runtime.ts` ← imported by `portal/src/App.tsx:8:84711a37` · `portal/src/hooks/useChatChannel.ts:2:d55d64c9` (+4)
- `app-links.cjs` ← imported by `portal/src/portal/components/AppLinkListener.tsx:4:1cf0cb7e` · `portal/src/lib/runtime.ts:10:7dd7b9ce`
- … 9 more → `CLAUDE.index.md`

## Never (human)
- Tracking failures must never throw or break the page (src/lib/funnelTracking.ts:55)
- .cjs files must stay free of project imports so the repo-root Jest suite can test them (src/lib/app-links.cjs:14, vitest.config.ts:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `portal/src/lib/greeting.test.ts` (greeting.ts)
- `tests/portal/android-app-config.test.js` (app-config.cjs)
- … 7 more → `CLAUDE.index.md`

## Related (generated)
- docs: `portal/ANDROID.md`? · `portal/src/CLAUDE.md`?
