# cache — Tests for the Railway Redis service's error handling and missing methods

<!-- kg:meta repo=rumi-platform dir=tests/cache kg=8408cd9a74c0 gen=aee41e363493 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `redis-error-throttle.test.js` — error event must log at most once per 10s
- `redis-missing-methods.test.js` — setNX and setexWithCeiling exist and behave
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `redis-error-throttle.test.js` | Pins the Redis 'error' handler logging at most once per 10s when 50 events fire in a second |
| `redis-missing-methods.test.js` | Pins setNX and setexWithCeiling on the Redis service, whose absence once broke quiz delivery |

## Who reads this (generated)
- (none)

## Never (human)
- Do not assume a fresh Redis instance per test; the service exports a singleton (tests/cache/redis-error-throttle.test.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/cache/CLAUDE.md`?
