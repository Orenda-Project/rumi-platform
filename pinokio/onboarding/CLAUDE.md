# onboarding — GUI setup wizard server: three screens beside Rumi's console, loopback only
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=pinokio/onboarding kg=1f995b12a08d gen=041b8b871c1e overflow=7 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `server.js` — mounts the console and the wizard UI
- `bridge.js` — the only place that requires Rumi code
- `guards.js` — loopback, Host and header guards
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `public/` | Browser UI of the wizard: step machine, DOM helpers, API client, styles → `public/CLAUDE.md` |
| `routes/` | API routes behind the wizard: credentials, database, whatsapp → `routes/CLAUDE.md` |
| `bridge.js` | The only module that requires Rumi checkout code; each load is defensive so one rename disables one step |
| `async-route.js` | Wraps an async express handler so a rejected promise reaches the error handler |
| `launch.js` | (unmapped) |
| `guards.js` | Loopback-only, Host allowlist, no-CORS and custom-header guards for the wizard's routes |
| `local-redis.js` | Starts a local Redis for the wizard only when a check needs one and REDIS_URL points at this machine |
| `sse.js` | Server-sent-events helper (anti-buffering headers) for streaming schema progress and QR codes |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `async-route.js` ← imported by `pinokio/onboarding/routes/credentials.js:17:b351fbaa` · `pinokio/onboarding/routes/database.js:21:b351fbaa` (+2)
- `local-redis.js` ← imported by `pinokio/onboarding/routes/credentials.js:18:4207b702` · `pinokio/onboarding/server.js:21:fa45a93c`
- `sse.js` ← imported by `pinokio/onboarding/routes/database.js:22:ee8d22b0` · `pinokio/onboarding/routes/whatsapp.js:21:ee8d22b0`
- `bridge.js` ← imported by `pinokio/onboarding/server.js:19:ad911989`
- … 4 more → `CLAUDE.index.md`

## Never (human)
- Never require Rumi modules outside bridge.js; one upstream rename would take the server down (bridge.js:4)
- Never add CORS headers or non-loopback binding (guards.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/pinokio/launch.test.js` (launch.js)

## Related (generated)
- docs: `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? · `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md`? · `pinokio/CLAUDE.md`? · `pinokio/README.md`?
