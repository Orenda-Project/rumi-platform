# assets — One-off scripts for Flow JSON and reading-passage background assets

<!-- kg:meta repo=rumi-platform dir=bot/scripts/assets kg=900e21bc6529 gen=94afcd9f561e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `upload-flow.js` — pushes a Flow JSON to Meta for a flow id
- `get-flow-errors.js` — reads a flow's validation errors
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `generate-passage-backgrounds.js` | One-off: generates child-friendly reading-passage backgrounds with DALL-E 3 and uploads them to R2 |
| `get-flow-errors.js` | Dev tool: fetches Meta's detailed validation errors for a WhatsApp Flow id; read-only call |
| `upload-flow.js` | Dev tool: uploads a Flow JSON file to Meta for an existing flow id (writes to the WABA) |

## Who reads this (generated)
- env read here: `OPENAI_API_KEY` · `R2_ACCESS_KEY_ID` · `R2_BUCKET_NAME` · `R2_ENDPOINT` · `R2_SECRET_ACCESS_KEY` · `READING_ASSESSMENT_FLOW_ID` · `WHATSAPP_TOKEN`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/assets/CLAUDE.md`?
