# _helpers — Shared test helpers used across suites

<!-- kg:meta repo=rumi-platform dir=tests/_helpers kg=62860f7336e2 gen=5bd19f731913 overflow=0 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `mock-bot-dependency.js` — mock a bot-only npm package under both bare and resolved keys
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `mock-bot-dependency.js` | Helper: jest.doMock a bot-only package (aws-sdk, playwright-core) under bare and resolved keys, ending order flake |
| `apply-rumi-schema.js` | Test helper loading the real schema (shim, 00, 01, 02, every V*.sql) into a plain Postgres, skipping pgvector |
| `embedded-pg.js` | Test helper starting a throwaway embedded Postgres on a free port (retrying a port race); returns {url, stop} |

## Who reads this (generated)
- (none)

## Never (human)
- Never use a bare virtual mock for bot-only packages (order-dependent); use this helper (tests/_helpers/mock-bot-dependency.js:3-9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/CLAUDE.md`?
