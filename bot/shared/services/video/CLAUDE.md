# video — AI video lesson pipeline: script, images, animation, assembly, delivery
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/video kg=936939aa3112 gen=8c7bc8a4dee5 overflow=30 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `video-orchestrator.service.js` — public API: user request, rate limit, flow coordination
- `video-job-queue.service.js` — enqueues generation to SQS for the video worker
- `video-assembly.service.js` — FFmpeg assembly, PDF and delivery
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `video*` | 8 files; most used `video-orchestrator.service.js`: Public video generation API: handles user requests and rate limits, coordinates the flow; writes video_requests |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- table `video_requests` (written by `video-animation.service.js` (+4)) ← read by `bot/shared/services/context.service.js:179:31e6558b`? · `bot/shared/services/feature-registration.service.js:241:31e6558b`? (+10)
- column `video_requests.status` (written by `video-assembly.service.js` (+1)) ← read by `bot/shared/services/context.service.js:184:a69ef692` · `bot/shared/services/feature-registration.service.js:244:abb6a119` (+4)
- column `video_requests.user_id` (written by `video-orchestrator.service.js`) ← read by `bot/shared/services/context.service.js:183:219f5683` · `bot/shared/services/feature-registration.service.js:243:219f5683` (+3)
- `video-orchestrator.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:23:f0074ff4` · `bot/shared/handlers/voice-message.handler.js:12:f0074ff4` (+2)
- … 26 more → `CLAUDE.index.md`

## Never (human)
- Watermarking must stay non-blocking: on failure return the original video (video-watermark.service.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/video/style-selection.test.js` (video-orchestrator.service.js, video-script.service.js)
- `tests/video/video-result-url-not-logged.test.js` (video-animation.service.js, video-image.service.js)
- … 4 more → `CLAUDE.index.md`

## Related (generated)
- skills: `video-generation`?
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/video/CLAUDE.index.md`? · `bot/shared/services/video/CLAUDE.md`? · `bot/tests/CLAUDE.md`? · `bot/tests/video/CLAUDE.md`? (+1)
