# steps — One module per wizard step after welcome: credentials, database, whatsapp, done

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/public/steps kg=c5d37c0d71d6 gen=e4fd3a196f40 overflow=0 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `credentials.js` — the .env form
- `database.js` — exec_sql paste and schema stream
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `credentials.js` | Wizard step rendering the .env credential form from the checkout's catalogue with live tests |
| `database.js` | Wizard step: built-in DB needs nothing; Supabase shows the exec_sql paste, polls for it, then streams schema application |
| `done.js` | Wizard closing step showing the same pass/fail/skip report as `rumi doctor` |
| `whatsapp.js` | Wizard step showing the WhatsApp pairing QR as a self-refreshing image |

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
- docs: `pinokio/onboarding/public/CLAUDE.md`?
