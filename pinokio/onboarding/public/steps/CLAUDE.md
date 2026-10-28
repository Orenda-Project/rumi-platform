# steps — One module per wizard step after welcome: credentials, database, whatsapp, done

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/public/steps kg=d8a5fc2a2093 gen=881699a1733f overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `credentials.js` — the .env form
- `database.js` — exec_sql paste and schema stream
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `credentials.js` | Wizard step rendering the .env credential form from the checkout's catalogue with live tests |
| `database.js` | Wizard step showing the exec_sql SQL to paste, polling for it, then streaming schema application |
| `done.js` | Wizard closing step showing the same pass/fail/skip report as `rumi doctor` |
| `whatsapp.js` | Wizard step showing the WhatsApp pairing QR as a self-refreshing image |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- `credentials.js` ← imported by `pinokio/onboarding/public/app.js:14:9b7a7322`
- `database.js` ← imported by `pinokio/onboarding/public/app.js:15:91cc26ca`
- `done.js` ← imported by `pinokio/onboarding/public/app.js:17:01bc2a49`
- `whatsapp.js` ← imported by `pinokio/onboarding/public/app.js:16:0a231094`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `pinokio/onboarding/public/CLAUDE.md`? · `pinokio/onboarding/public/steps/CLAUDE.md`?
