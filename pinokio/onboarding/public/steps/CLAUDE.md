# steps — One module per wizard step after welcome: credentials, database, whatsapp, done

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/public/steps kg=572267f65b64 gen=9e47c2bc4f3b overflow=0 rendered=2026-11-11 kg.py=1.1.0 -->

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
| `launching.js` | (unmapped) |
| `whatsapp.js` | Wizard step showing the WhatsApp pairing QR as a self-refreshing image |
| `launch-wait.js` | (unmapped) |

## Who reads this (generated)
- `credentials.js` ← imported by `pinokio/onboarding/public/app.js:17:9b7a7322`
- `database.js` ← imported by `pinokio/onboarding/public/app.js:18:91cc26ca`
- `done.js` ← imported by `pinokio/onboarding/public/app.js:20:01bc2a49`
- `launch-wait.js` ← imported by `pinokio/onboarding/public/steps/launching.js:14:f08503fd`
- `launching.js` ← imported by `pinokio/onboarding/public/app.js:21:d526a480`
- `whatsapp.js` ← imported by `pinokio/onboarding/public/app.js:19:0a231094`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/pinokio/launching.test.js`? (launching.js)

## Related (generated)
- docs: `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? · `pinokio/onboarding/public/CLAUDE.md`?
