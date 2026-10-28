# flow-id-validator — Test for the FLOW_ID startup check against the WABA's own flows list

<!-- kg:meta repo=rumi-platform dir=tests/flow-id-validator kg=5454d6a1a3f6 gen=50764689d201 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `flow-id-validator.test.js` — each FLOW_ID must be in the WABA's flows list
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `flow-id-validator.test.js` | Pins the FLOW_ID runtime check against the WABA's own flows list to catch cross-WABA contamination |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- Never check ownership via GET /{flow_id} alone; use the WABA's flow list (tests/flow-id-validator/flow-id-validator.test.js:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/flow-id-validator/CLAUDE.md`?
