# portal — full index (generated)

<!-- kg:index repo=rumi-platform dir=portal -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `.github/` | → (no door; 1 files) |
| `android/` | → (no door; 40 files) |
| `public/` | → (no door; 5 files) |
| `src/` | Portal source: entry, routes, landing site, libs, i18n and the /portal app → `src/CLAUDE.md` |
| `.env.app.example` | (unmapped) |
| `.gitignore` | (unmapped) |
| `ANDROID.md` | Explains building, testing and releasing the Capacitor Android app that wraps the portal (JDK 21, SDK 36, OTA mode) |
| `GITHUB_ACTIONS_SETUP.md` | Walks through the PAT-and-secret setup for the Lovable-to-backend auto-deploy workflow; older setup note |
| `README.md` | Introduces the Phase 2 teacher portal: what it shows, prerequisites, npm commands and where deployment is documented |
| `capacitor.config.ts` | Configures the Capacitor Android shell: app id/name, API host, opt-in OTA server url and offline fallback page |
| `components.json` | shadcn/ui generator config: slate base colour, CSS variables, and the @/components, @/lib, @/hooks aliases |
| `eslint.config.js` | ESLint flat config: TypeScript + react-hooks + react-refresh rules for portal sources (unused-vars off) |
| `index.html` | Vite HTML shell: Rumi title/meta, Noto Nastaliq Urdu and Noto Sans Arabic fonts, mounts #root for main.tsx |
| `package.json` | Declares the portal's scripts (dev, build, build:app, android:*, test), React/Radix/axios/i18next deps, Apache-2.0 |
| `postcss.config.js` | PostCSS pipeline for the portal build: tailwindcss then autoprefixer |
| `tailwind.config.ts` | Tailwind theme: maps shadcn CSS-variable colours, container sizes and animations over src/** |
| `tsconfig.app.json` | TypeScript config for src/: ES2020, bundler resolution, non-strict, @/* alias |
| `tsconfig.json` | Root TypeScript project references plus the @/* path alias; strictness relaxed |
| `tsconfig.node.json` | TypeScript config for vite.config.ts only (ES2022, strict) |
| `vite.config.ts` | Vite config: React SWC, @ alias, port 8080, dev-only lovable-tagger, and the app-mode build guard |
| `vitest.config.ts` | Vitest config: jsdom, globals, setup file, runs src/**/*.test.{ts,tsx} component tests |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `.github/workflows/CLAUDE.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `README.md`? · `SETUP.md`? · `dashboard/lib/CLAUDE.md`? · `docs/android-app.md`? · `docs/features/android-portal-app.md`? · `docs/features/teacher-portal.md`? · `docs/monitoring.md`? · `portal/ANDROID.md`? · `portal/GITHUB_ACTIONS_SETUP.md`? · `portal/src/lib/CLAUDE.md`?
