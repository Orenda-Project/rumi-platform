# routes — API routes behind the wizard: credentials, database, whatsapp

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding/routes kg=72a920bbeb3a gen=99ceb926948f overflow=0 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `credentials.js` — reads and writes .env via console runtime
- `whatsapp.js` — pairing via forked child
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `whatsapp.js` | API routes that run pairing in a forked child and stream QR payloads over SSE |
| `credentials.js` | API routes reading/writing .env via the console runtime and testing each credential |
| `database.js` | API routes inspecting the database and creating tables: over pg for bundled/postgres, via exec_sql for Supabase |

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
- docs: `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? · `pinokio/onboarding/CLAUDE.md`?
