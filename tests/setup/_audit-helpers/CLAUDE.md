# _audit-helpers — Shared require-graph builder behind the circular, orphan and unresolved-require guards

<!-- kg:meta repo=rumi-platform dir=tests/setup/_audit-helpers kg=543ec77b55ca gen=abdb8517e630 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `require-graph.js` — builds reachability from entry points; read it before touching the audit guards
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `require-graph.js` | Builds the static require graph from bot entry points; used by the circular-dep, orphan and unresolved-require guards |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- Cycle and orphan exceptions must go in the allowlist JSON files with a reason, not in this helper (tests/setup/circular-deps.test.js:15)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/setup/CLAUDE.index.md`? · `tests/setup/CLAUDE.md`? · `tests/setup/_audit-helpers/CLAUDE.md`?
