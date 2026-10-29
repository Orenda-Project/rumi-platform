# video — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/video -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `video-animation.service.js` | Animates slide start/end frames into clips with Kling 2.1 via Kie.ai, with checkpoint/resume; writes video_tasks |
| `video-assembly.service.js` | Assembles the final video with FFmpeg, makes the PDF and delivers it; updates video_requests |
| `video-image.service.js` | Generates slide images with Nano Banana Pro via Kie.ai, with slide checkpoint and job-id resume; writes video_tasks |
| `video-job-queue.service.js` | Enqueues video generation jobs to SQS (same pattern as the lesson-plan queue) for the video worker |
| `video-orchestrator.service.js` | Public video generation API: handles user requests and rate limits, coordinates the flow; writes video_requests |
| `video-script.service.js` | Writes slide scripts with GPT and records ElevenLabs voiceovers for the video pipeline |
| `video-session.service.js` | Rate limiting and progress updates for video generation; reads/writes video_requests |
| `video-watermark.service.js` | Non-blocking Rumi watermark on generated videos; on failure returns the original video |

## Who reads this (all, generated)
- `video-animation.service.js` ← imported by `bot/workers/video-generation.worker.js:21:262b8348`
- `video-assembly.service.js` ← imported by `bot/workers/video-generation.worker.js:22:4d7ea422`
- `video-image.service.js` ← imported by `bot/workers/video-generation.worker.js:20:180cc7e7`
- `video-job-queue.service.js` ← imported by `bot/shared/services/video/video-orchestrator.service.js:11:d8787dd6`
- `video-orchestrator.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:23:f0074ff4` · `bot/shared/handlers/voice-message.handler.js:12:f0074ff4` · `bot/shared/services/menu.service.js:346:36b15dd1` · `bot/whatsapp-bot.js:811:fcc016b3`
- `video-script.service.js` ← imported by `bot/workers/video-generation.worker.js:19:6c0be82d`
- `video-session.service.js` ← imported by `bot/workers/video-generation.worker.js:18:fab5e61f` · `bot/shared/services/video/video-assembly.service.js:59:9a8bf4ba` · `bot/shared/services/video/video-orchestrator.service.js:10:9a8bf4ba`
- `video-watermark.service.js` ← imported by `bot/shared/services/video/video-assembly.service.js:113:a14408b1`
- column `video_requests.created_at` (written by `video-orchestrator.service.js`) ← read by `bot/shared/services/context.service.js:185:e8356999` · `dashboard/database/queries.js:743:06c5e28d` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.current_step` (written by `video-session.service.js`) ← read by `bot/workers/video-generation.worker.js:74:790c0376`
- column `video_requests.customization` (written by `video-orchestrator.service.js`) ← read by `bot/workers/sqs-worker.js:933:28884071`
- column `video_requests.language` (written by `video-orchestrator.service.js`) ← read by `bot/workers/sqs-worker.js:933:28884071` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.recipient_identifier` (written by `video-orchestrator.service.js`) ← read by `bot/workers/sqs-worker.js:933:28884071`
- column `video_requests.session_id` (written by `video-orchestrator.service.js`) ← read by `bot/workers/sqs-worker.js:933:28884071`
- column `video_requests.slide_urls` (written by `video-image.service.js`) ← read by `bot/workers/video-generation.worker.js:74:790c0376` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.status` (written by `video-assembly.service.js`, `video-orchestrator.service.js`) ← read by `bot/shared/services/context.service.js:184:a69ef692` · `bot/shared/services/feature-registration.service.js:244:abb6a119` · `bot/workers/sqs-worker.js:934:184894e4` · `bot/workers/video-generation.worker.js:54:1099729a` (+2: `python3 kg/kg.py who-reads video_requests.status`)
- column `video_requests.style` (written by `video-orchestrator.service.js`) ← read by `bot/workers/sqs-worker.js:933:28884071`
- column `video_requests.topic` (written by `video-orchestrator.service.js`) ← read by `bot/shared/services/context.service.js:323:8460890c` · `bot/workers/sqs-worker.js:933:28884071` · `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_requests.user_id` (written by `video-orchestrator.service.js`) ← read by `bot/shared/services/context.service.js:183:219f5683` · `bot/shared/services/feature-registration.service.js:243:219f5683` · `bot/workers/sqs-worker.js:933:28884071` · `dashboard/database/queries.js:818:31232ece` (+1: `python3 kg/kg.py who-reads video_requests.user_id`)
- column `video_requests.video_segment_urls` (written by `video-animation.service.js`) ← read by `bot/workers/video-generation.worker.js:74:790c0376`
- column `video_requests.video_url` (written by `video-assembly.service.js`) ← read by `dashboard/routes/portal.routes.js:1871:0b0b6afb`
- column `video_tasks.filename` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:167:1b2a53e5` · `bot/shared/services/video/video-image.service.js:212:1b2a53e5`
- column `video_tasks.result_url` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:165:1ddbf68a` · `bot/shared/services/video/video-image.service.js:210:aef2f5cb`
- column `video_tasks.status` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:165:1ddbf68a` · `bot/shared/services/video/video-image.service.js:210:aef2f5cb`
- column `video_tasks.task_id` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:165:1ddbf68a` · `bot/shared/services/video/video-image.service.js:210:aef2f5cb`
- column `video_tasks.video_request_id` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:166:07edcdd8` · `bot/shared/services/video/video-image.service.js:211:07edcdd8`
- table `video_requests` whole row (`*`) (written by `video-animation.service.js`, `video-assembly.service.js`, `video-image.service.js`, `video-orchestrator.service.js`, `video-session.service.js`) ← read by `bot/shared/services/feature-registration.service.js:242:7a0c163a`? · `dashboard/database/queries.js:741:7a0c163a`? · `dashboard/routes/portal.routes.js:1930:d2b02c3e`? · `bot/shared/services/video/video-session.service.js:145:3a0a473e`?
- table `video_requests` (written by `video-animation.service.js`, `video-assembly.service.js`, `video-image.service.js`, `video-orchestrator.service.js`, `video-session.service.js`) ← read by `bot/shared/services/context.service.js:179:31e6558b`? · `bot/shared/services/feature-registration.service.js:241:31e6558b`? · `bot/workers/sqs-worker.js:932:31e6558b`? · `bot/workers/video-generation.worker.js:53:31e6558b`? (+8: `python3 kg/kg.py who-reads video_requests`)
- table `video_tasks` (written by `video-animation.service.js`, `video-image.service.js`) ← read by `bot/shared/services/video/video-animation.service.js:164:88091ce0`? · `bot/shared/services/video/video-image.service.js:209:88091ce0`?
- env `ELEVENLABS_API_KEY` read at `bot/shared/services/video/video-script.service.js:18:a931f25a`
- env `KIE_API_KEY` read at `bot/shared/services/video/video-animation.service.js:18:afc63570` · `bot/shared/services/video/video-image.service.js:23:afc63570`
- env `RATE_LIMIT_BYPASS_NUMBERS` read at `bot/shared/services/video/video-session.service.js:63:62b925c4`
- env `SQS_VIDEO_QUEUE_URL` read at `bot/shared/services/video/video-job-queue.service.js:36:e02ca9ed`
- env `VIDEO_DAILY_LIMIT` read at `bot/shared/services/video/video-session.service.js:60:851cd404`
- env `VIDEO_GENERATION_ENABLED` read at `bot/shared/services/video/video-orchestrator.service.js:42:be419648`
- env `VIDEO_WATERMARK_ENABLED` read at `bot/shared/services/video/video-watermark.service.js:41:00715e02`
- env `VIDEO_WATERMARK_TEXT` read at `bot/shared/services/video/video-watermark.service.js:22:ea5398c0`

## Tests (all, generated)
- `video-animation.service.js` ← `tests/video/video-result-url-not-logged.test.js`
- `video-assembly.service.js` ← `tests/services/video/video-assembly-delivery.test.js`
- `video-image.service.js` ← `tests/video/video-result-url-not-logged.test.js`
- `video-orchestrator.service.js` ← `bot/tests/video/issue-58-ttl-logging.test.js` · `bot/tests/video/style-selection.test.js`
- `video-script.service.js` ← `bot/tests/bug-014-video-language.test.js` · `bot/tests/video/style-selection.test.js`
- `video-watermark.service.js` ← `bot/tests/video/watermark.test.js`

## Related (all, generated)
- skills: `video-generation`?
- docs: `bot/shared/services/CLAUDE.md`?
