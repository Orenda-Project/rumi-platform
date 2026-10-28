# src — Portal source: entry, routes, landing site, libs, i18n and the /portal app

<!-- kg:meta repo=rumi-platform dir=portal/src kg=e2df0a957289 gen=5b336d4117e2 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `App.tsx` — router; decides landing vs portal at / via isPortalTarget
- `main.tsx` — bootstrap: styles, i18n, render
- `portal/` — signed-in teacher and coach screens
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 38 files) |
| `components/` | Landing-site sections and chat-bubble demo widgets (not the signed-in portal) → `components/CLAUDE.md` |
| `hooks/` | Shared React hooks: chat-channel lookup, toasts, funnel tracking, mobile check → `hooks/CLAUDE.md` |
| `i18n/` | i18next setup for the landing site: languages, detection and RTL font swap → `i18n/CLAUDE.md` |
| `lib/` | Pure rules and adapters: app/portal detection, API base url, back key, tracking → `lib/CLAUDE.md` |
| `pages/` | Public marketing pages: landing, how-it-works and the 404 → `pages/CLAUDE.md` |
| `portal/` | The signed-in teacher and coach portal: pages, API client, auth hook, types → `portal/CLAUDE.md` |
| `test/` | → (no door; 1 test files) |
| `CLAUDE.md` | (unmapped) |
| `App.tsx` | Root component: query client, i18n lang/dir, and the route table for landing, /portal/* and /portal/observe pages |
| `index.css` | Tailwind layers plus the HSL design tokens (navy primary, coral accent), gradients and dark-mode variables |
| `main.tsx` | Entry point: imports styles and i18n config, then renders App into #root |
| `vite-env.d.ts` | Pulls in Vite's client type declarations for import.meta.env |

## Who reads this (generated)
- `App.tsx` ← imported by `portal/src/main.tsx:2:2af48748`
- `index.css` ← imported by `portal/src/main.tsx:3:3b87cfb4`

## Never (human)
- New routes must go above the catch-all NotFound route (App.tsx:90)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `portal/CLAUDE.index.md`? · `portal/CLAUDE.md`? · `portal/src/CLAUDE.md`? · `portal/src/components/CLAUDE.index.md`? · `portal/src/components/CLAUDE.md`? · `portal/src/hooks/CLAUDE.md`? (+5)
