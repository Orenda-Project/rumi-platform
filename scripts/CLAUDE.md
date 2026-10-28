# scripts — Standalone sample-report renderers for docs images (no DB, no PII)

<!-- kg:meta repo=rumi-platform dir=scripts kg=8eea4dcbed55 gen=412199afd571 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `render-sample-hero-report.js` — one hero PNG per framework
- `samples/_index.js` — the authored sample data index
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `samples/` | Hand-authored hero-report sample data, one JSON per scoring framework → `samples/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `render-sample-hero-report.js` | Renders one hero coaching-report PNG per framework from authored samples (offline stub LLM or live) for docs/samples |
| `render-sample-report.js` | Regenerates the sample MEWAKA hero coaching-report PDF in docs/samples from hand-authored data, no DB |

## Who reads this (generated)
- env read here: `CHROME_BIN`

## Never (human)
- Never put real teacher data in samples; they are hand-authored on purpose (scripts/samples/_index.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CLAUDE.md`? · `scripts/CLAUDE.md`? · `scripts/samples/CLAUDE.md`?
