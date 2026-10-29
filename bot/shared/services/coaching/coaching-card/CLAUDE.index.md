# coaching-card — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/coaching-card -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `card-image.service.js` | Renders the 600x400 coaching commitment card PNG; called by report-generator |
| `card-response.service.js` | Stores a teacher's coaching-card button tap in coaching_sessions.prioritized_action; no non-test importer (dead) |
| `card-template.js` | HTML template for the commitment card screenshot, with RTL-aware text wrapping; used by card-image.service |
| `commitment-card.service.js` | Writes card content by fusing the teacher's reflective answer with one LLM action; called by report-generator |
| `prioritized-action.service.js` | Picks one improvement tip from the analysis indicators; feeds commitment-card.service |

## Who reads this (all, generated)
- `card-image.service.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:219:bca040f7`
- `card-template.js` ← imported by `bot/shared/services/coaching/coaching-card/card-image.service.js:147:c67a4de1`
- `commitment-card.service.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:218:98589872`
- `prioritized-action.service.js` ← imported by `bot/shared/services/coaching/coaching-card/commitment-card.service.js:21:e5cd3ca1`
- column `coaching_sessions.prioritized_action` (written by `card-response.service.js`) ← read by `bot/shared/services/coaching/report-generator.service.js:231:cfc5016d` · `bot/shared/services/coaching/transcription-processor.service.js:222:cfc5016d`
- table `coaching_sessions` whole row (`*`) (written by `card-response.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+10: `python3 kg/kg.py who-reads coaching_sessions`)
- table `coaching_sessions` (written by `card-response.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+49: `python3 kg/kg.py who-reads coaching_sessions`)

## Tests (all, generated)
- `card-image.service.js` ← `tests/coaching/coaching-card.test.js` · `tests/coaching/coaching-flow-integration.test.js`
- `card-response.service.js` ← `tests/coaching/coaching-card.test.js` · `tests/coaching/coaching-flow-integration.test.js`
- `card-template.js` ← `tests/coaching/render-commitment-card-image.test.js`
- `commitment-card.service.js` ← `tests/coaching/commitment-card-content.test.js` · `tests/coaching/commitment-card-fallback.test.js`
- `prioritized-action.service.js` ← `tests/coaching/coaching-card.test.js` · `tests/coaching/coaching-flow-integration.test.js`

## Related (all, generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`? · `docs/customization.md`?
