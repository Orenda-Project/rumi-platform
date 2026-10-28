# scripts — Helper scripts the Pinokio launcher scripts call: Redis, ports, console wait

<!-- kg:meta repo=rumi-platform dir=pinokio/scripts kg=7a84a9e4c241 gen=cfad0eabd6e3 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `pick-port.js` — stable port per server
- `local-redis.js` — start Redis only when REDIS_URL is local
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `redis.js` | Shared Pinokio step that starts the local Redis for start.js, onboard.js and doctor.js |
| `local-redis.js` | Runs redis-server only when REDIS_URL points at this machine; otherwise says so and exits |
| `CLAUDE.md` | (unmapped) |
| `pick-port.js` | Gives the bot or wizard a stable port across restarts, avoiding Pinokio's colliding {{port}} |
| `wait-for-console.js` | Waits for /health then prints the console URL alone on a line so Pinokio's 300-char match sees it |

## Who reads this (generated)
- `redis.js` ← imported by `pinokio/doctor.js:1:e1dd1c17` · `pinokio/start.js:1:e1dd1c17`
- `local-redis.js` ← imported by `pinokio/onboarding/local-redis.js:21:b6878074`
- env read here: `REDIS_URL`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `pinokio/CLAUDE.index.md`? · `pinokio/CLAUDE.md`? · `pinokio/README.md`? · `pinokio/scripts/CLAUDE.md`?
