# characterization — Frozen legacy webhook wire responses used to prove gateway parity

<!-- kg:meta repo=rumi-platform dir=tests/characterization kg=ddaf38e53087 gen=670fde02c59e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `legacy-baseline.test.js` — records and asserts legacy GET/POST /webhook and /api/slack responses
- `differential-verification.test.js` — compares legacy against the refactored gateway, expects zero divergence
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `differential-verification.test.js` | Asserts the refactored gateway matches the legacy monolith's wire responses across Meta GET and POST permutations |
| `legacy-baseline.test.js` | Characterizes legacy GET/POST /webhook and POST /api/slack responses against the stored snapshot |
| `CLAUDE.md` | (unmapped) |
| `differential-verification-report.json` | Output report of the differential run: 29 synthetic events, 100% wire parity legacy vs gateway, zero divergence |
| `legacy-baseline-snapshot.json` | Recorded wire responses of the legacy webhook ingress; loaded by legacy-baseline.test.js |

## Who reads this (generated)
- (none)

## Never (human)
- Do not hand-edit legacy-baseline-snapshot.json; legacy-baseline.test.js records and asserts it (tests/characterization/legacy-baseline.test.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `TEST_READY.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/gateway/CLAUDE.index.md`? · `bot/gateway/CLAUDE.md`? · `docs/intent/webhook-gateway-modernization.md`? (+3)
