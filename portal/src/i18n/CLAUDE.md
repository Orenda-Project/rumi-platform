# i18n — i18next setup for the landing site: languages, detection and RTL font swap

<!-- kg:meta repo=rumi-platform dir=portal/src/i18n kg=b0c9f30d703c gen=d26d27493f3c overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `config.ts` — registers en/es/ur/ar and applies Urdu/Arabic fonts
- `locales/en.json` — source strings; other locales follow its structure
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `locales/` | Landing-site string catalogs, one JSON per language (en, es, ur, ar) → `locales/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `config.ts` | Initialises i18next with en/es/ur/ar, localStorage detection, and swaps the document font for Urdu and Arabic |

## Who reads this (generated)
- `config.ts` ← imported by `portal/src/main.tsx:4:b92dfc33`

## Never (human)
- A language must be added to both resources and supportedLngs in config.ts (src/i18n/config.ts:21) and to LanguageSwitcher; App.tsx:45 sets RTL only for ar and ur
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `portal/src/components/LandingChannel.test.tsx` (config.ts)

## Related (generated)
- docs: `portal/src/CLAUDE.md`? · `portal/src/components/CLAUDE.index.md`? · `portal/src/components/CLAUDE.md`? · `portal/src/i18n/CLAUDE.md`? · `portal/src/i18n/locales/CLAUDE.md`?
