# public — Browser UI of the wizard: step machine, DOM helpers, API client, styles

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/public kg=5a4405650860 gen=4903c860b8de overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `app.js` — step machine
- `dom.js` — safe node builders
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `steps/` | One module per wizard step after welcome: credentials, database, whatsapp, done → `steps/CLAUDE.md` |
| `dom.js` | Browser DOM helpers that build nodes without innerHTML so .env text cannot inject markup |
| `api.js` | Browser fetch/stream helpers for the wizard; mutating calls carry the X-Rumi-Onboarding header |
| `CLAUDE.md` | (unmapped) |
| `app.js` | Browser step machine for the five-step wizard; renders each step lazily on arrival |
| `favicon.svg` | (unmapped) |
| `index.html` | Single page shell for the five-step setup wizard |
| `styles.css` | Stylesheet for the setup wizard page |

## Who reads this (generated)
- `api.js` ← imported by `pinokio/onboarding/public/steps/credentials.js:11:8bc78e33` · `pinokio/onboarding/public/steps/database.js:7:0a179878` (+3)
- `dom.js` ← imported by `pinokio/onboarding/public/steps/credentials.js:12:bc430a56` · `pinokio/onboarding/public/steps/database.js:8:b14b2888` (+3)

## Never (human)
- Never assign innerHTML from .env or catalogue values (dom.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `pinokio/CLAUDE.index.md`? · `pinokio/README.md`? · `pinokio/onboarding/CLAUDE.index.md`? · `pinokio/onboarding/CLAUDE.md`? · `pinokio/onboarding/public/CLAUDE.md`? · `pinokio/onboarding/public/steps/CLAUDE.md`?
