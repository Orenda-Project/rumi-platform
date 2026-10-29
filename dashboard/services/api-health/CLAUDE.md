# api-health — One health probe per vendor feeding the API Health page
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/services/api-health kg=bcaf92911964 gen=5f008c93bc7c overflow=15 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `api-health-aggregator.service.js` — merges every vendor probe into one payload
- `soniox.service.js` — pattern for local-tracking probes that read api_usage_log
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `api-health-aggregator.service.js` | Fans out to every per-vendor health service and merges results for the API Health page. |
| `cloudflare-r2.service.js` | Reports Cloudflare R2 storage usage for the API Health page (5-minute cache). |
| `elevenlabs.service.js` | Reports ElevenLabs character usage and plan limits for the API Health page. |
| `gamma.service.js` | Reports Gamma AI credit balance and limits for the API Health page. |
| `openai.service.js` | Reports OpenAI usage, billing and credit grants for the API Health page. |
| `railway.service.js` | Queries the Railway GraphQL API for project usage and billing for the API Health page. |
| `soniox.service.js` | Estimates Soniox transcription usage from local tracking rows in api_usage_log (no vendor API). |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- column `api_usage_log.estimated_cost` (written by `soniox.service.js` (+1)) ← read by `dashboard/services/api-health/soniox.service.js:45:d8d3ca8f` · `dashboard/services/api-health/uplift.service.js:45:d8d3ca8f`
- column `api_usage_log.service` (written by `soniox.service.js` (+1)) ← read by `dashboard/services/api-health/soniox.service.js:46:637ddbd5` · `dashboard/services/api-health/uplift.service.js:46:c18825f7`
- column `api_usage_log.units_consumed` (written by `soniox.service.js` (+1)) ← read by `dashboard/services/api-health/soniox.service.js:45:d8d3ca8f` · `dashboard/services/api-health/uplift.service.js:45:d8d3ca8f`
- … 27 more → `CLAUDE.index.md`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/services/CLAUDE.md`?
