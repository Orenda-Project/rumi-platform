# routes — API routes behind the wizard: credentials, database, whatsapp

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/routes kg=857d10e3f174 gen=976c931b512a overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `credentials.js` — reads and writes .env via console runtime
- `whatsapp.js` — pairing via forked child
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `credentials.js` | API routes reading/writing .env via the console runtime and testing each credential |
| `database.js` | API routes inspecting the database, serving the exec_sql SQL and streaming schema application |
| `whatsapp.js` | API routes that run pairing in a forked child and stream QR payloads over SSE |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- `credentials.js` ← imported by `pinokio/onboarding/server.js:22:b5866cdf`
- `database.js` ← imported by `pinokio/onboarding/server.js:23:37baac60`
- `whatsapp.js` ← imported by `pinokio/onboarding/server.js:24:e4bfb722`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `pinokio/onboarding/CLAUDE.index.md`? · `pinokio/onboarding/CLAUDE.md`? · `pinokio/onboarding/routes/CLAUDE.md`?
