# _helpers — Shared test helpers used across suites

<!-- kg:meta repo=rumi-platform dir=tests/_helpers kg=93df88cb56d3 gen=9346ac315cb6 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `mock-bot-dependency.js` — mock a bot-only npm package under both bare and resolved keys
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `mock-bot-dependency.js` | Helper: jest.doMock a bot-only package (aws-sdk, playwright-core) under bare and resolved keys, ending order flake |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- Never use a bare virtual mock for bot-only packages (order-dependent); use this helper (tests/_helpers/mock-bot-dependency.js:3-9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/_helpers/CLAUDE.md`?
