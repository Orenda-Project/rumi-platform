# scripts — One-off ops scripts: SQS queue setup, backfills, Railway linking, funnel checks

<!-- kg:meta repo=rumi-platform dir=dashboard/scripts kg=80f0999644c6 gen=560d3c2b9c4f overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `deployment/setup-portal-sqs.sh` — creates the portal's own FIFO SQS queue
- `backfill-processed-transcripts.js` — pre-processes coaching transcripts into coaching_sessions
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `deployment/` | → (no door; 2 files) |
| `backfill-processed-transcripts.js` | Backfills processed coaching transcripts (GPT-4o-mini) into coaching_sessions so viewing is instant. |
| `check-progress.sh` | Ad hoc shell that tails /tmp logs of re-transcription runs; one-off, stale. |
| `link-railway.sh` | One-time helper that runs `railway link` for the dashboard project. |
| `verify-funnel-tables.js` | Counts rows in website_visits, cta_clicks and chat_starts to confirm the funnel tables exist. |

## Who reads this (generated)
- table `coaching_sessions` (written by `backfill-processed-transcripts.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+51)
- column `coaching_sessions.analysis_data` (written by `backfill-processed-transcripts.js`) ← read by `bot/scripts/generate-coaching-excel.js:39:32a5a57f` · `bot/shared/services/coaching/coaching-trend.service.js:82:8162476b` (+19)
- table `coaching_sessions` whole row (`*`) (written by `backfill-processed-transcripts.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? (+8)
- env read here: `OPENAI_API_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_URL`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/CLAUDE.md`?
