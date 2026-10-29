# _helpers — Shared test helpers used across suites

<!-- kg:meta repo=rumi-platform dir=tests/_helpers kg=93df88cb56d3 gen=40aa9a3d0ab4 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `mock-bot-dependency.js` — mock a bot-only npm package under both bare and resolved keys
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `mock-bot-dependency.js` | Helper: jest.doMock a bot-only package (aws-sdk, playwright-core) under bare and resolved keys, ending order flake |

## Who reads this (generated)
- (none)

## Never (human)
- Never use a bare virtual mock for bot-only packages (order-dependent); use this helper (tests/_helpers/mock-bot-dependency.js:3-9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/CLAUDE.md`?
