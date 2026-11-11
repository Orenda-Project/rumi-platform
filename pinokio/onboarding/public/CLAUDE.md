# public — Browser UI of the wizard: step machine, DOM helpers, API client, styles

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/public kg=b0c632d2be63 gen=e39df64e13d9 overflow=0 rendered=2026-11-11 kg.py=1.1.0 -->

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
| `jacks.js` | (unmapped) |
| `app.js` | Browser step machine for the three-screen wizard (asleep, plug in, launching); renders each screen lazily |
| `index.html` | Single page shell for the three-screen setup wizard |
| `styles.css` | Stylesheet for the setup wizard page |
| `favicon.svg` | (unmapped) |

## Who reads this (generated)
- `api.js` ← imported by `pinokio/onboarding/public/steps/credentials.js:12:8bc78e33` · `pinokio/onboarding/public/steps/database.js:10:0a179878` (+4)
- `dom.js` ← imported by `pinokio/onboarding/public/steps/credentials.js:13:dc6da53a` · `pinokio/onboarding/public/steps/database.js:11:b14b2888` (+4)
- `jacks.js` ← imported by `pinokio/onboarding/public/app.js:15:cff10902`

## Never (human)
- Never assign innerHTML from .env or catalogue values (dom.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/pinokio/jacks.test.js`? (jacks.js)

## Related (generated)
- docs: `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? · `pinokio/README.md`? · `pinokio/onboarding/CLAUDE.md`?
