# flow-response — Tests for routing completed Flow replies (NFM_REPLY) to the right handler

<!-- kg:meta repo=rumi-platform dir=tests/flow-response kg=92224d996019 gen=961b251eb9ff overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `endpoint-flow-routing.test.js` — all endpoint-only Flows recognised, not "Unknown flow ID"
- `exam-confirm-routing.test.js` — exam confirm completion goes to handleExamFlow
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `endpoint-flow-routing.test.js` | Pins the flow-response handler recognising all 8 endpoint-only Flows' NFM_REPLY instead of "Unknown flow ID" |
| `exam-confirm-routing.test.js` | Pins the exam confirm-students NFM completion routed to handleExamFlow with parsed students |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- Each endpoint Flow must have a routed NFM_REPLY branch, or it falls to the unknown-flow warning (tests/flow-response/endpoint-flow-routing.test.js:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/flow-response/CLAUDE.md`?
