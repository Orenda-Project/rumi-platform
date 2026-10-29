# coaching-card — Builds the post-reflection commitment card image and its action text
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/coaching-card kg=1d3539b4de21 gen=eefa09e0477d overflow=6 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `commitment-card.service.js` — fuses the teacher's own commitment with one lesson-rooted action
- `card-image.service.js` — renders the card PNG; `card-response.service.js` is not imported by runtime code
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `commitment-card.service.js` | Writes card content by fusing the teacher's reflective answer with one LLM action; called by report-generator |
| `card*` | 3 files; most used `card-template.js`: HTML template for the commitment card screenshot, with RTL-aware text wrapping; used by card-image.service |
| `prioritized-action.service.js` | Picks one improvement tip from the analysis indicators; feeds commitment-card.service |

## Who reads this (generated)
- table `coaching_sessions` (written by `card-response.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+51)
- table `coaching_sessions` whole row (`*`) (written by `card-response.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+12)
- column `coaching_sessions.prioritized_action` (written by `card-response.service.js`) ← read by `bot/shared/services/coaching/report-generator.service.js:231:cfc5016d` · `bot/shared/services/coaching/transcription-processor.service.js:222:cfc5016d`
- `card-image.service.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:219:bca040f7`
- … 3 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/coaching-card.test.js` (card-image.service.js, card-response.service.js, prioritized-action.service.js)
- `tests/coaching/coaching-flow-integration.test.js` (card-image.service.js, card-response.service.js, prioritized-action.service.js)
- … 3 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`? · `docs/customization.md`?
