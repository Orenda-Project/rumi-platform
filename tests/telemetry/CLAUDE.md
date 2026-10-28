# telemetry — Tests for opt-in deployment telemetry and its setup consent step

<!-- kg:meta repo=rumi-platform dir=tests/telemetry kg=75d743a0fc92 gen=bb7262273585 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `telemetry.test.js` — silent unless opted in; never throws
- `telemetry-consent.test.js` — consent defaults to no
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `telemetry-consent.test.js` | Pins setup telemetry consent: default no, nothing sent on no, disclosure matches what the sender sends |
| `CLAUDE.md` | (unmapped) |
| `telemetry.test.js` | Pins opt-in deployment telemetry sender: silent unless opted in and never throws on network failure |

## Who reads this (generated)
- (none)

## Never (human)
- Telemetry must stay silent unless the operator opts in (telemetry.test.js:3-5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/telemetry/CLAUDE.md`?
