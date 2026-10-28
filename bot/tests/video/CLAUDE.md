# video — Tests for the video flow: style, language, PDF, R2, watermark, parallelism

<!-- kg:meta repo=rumi-platform dir=bot/tests/video kg=0708ef6ec69d gen=5bcfa4b2abd5 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `style-selection.test.js` — style carousel flow
- `r2-persistence.test.js` — asset upload
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `style-selection.test.js` | Tests the video style selection carousel flow where users pick a style via WhatsApp |
| `issue-58-ttl-logging.test.js` | Pins the video-flow Redis state TTL (longer than 5 minutes) and button-payload diagnostic logging |
| `CLAUDE.md` | (unmapped) |
| `watermark.test.js` | Tests the video watermark service that adds branding to generated videos |
| `design-quality.test.js` | Standalone script test checking video-slide GPT prompts contain the design-quality principles |
| `language-selection.test.js` | Standalone script test of the interactive language-selection step in the video generation flow |
| `layout-consistency.test.js` | Standalone script test that END frames are generated image-to-image from the START frame for layout consistency |
| `parallel-workers.test.js` | Tests RAILWAY_REPLICA_ID appears in worker identification and job-processing logs for replica support |
| `pdf-delivery.test.js` | Standalone script test of PDFKit-based slide PDF generation (not ImageMagick) for video slides |
| `r2-persistence.test.js` | Standalone script test of uploadVideoAsset() and the video service's R2 persistence |
| `video-parallelization.test.js` | Standalone script test of parallel video generation to cut user wait time |

## Who reads this (generated)
- env read here: `RAILWAY_REPLICA_ID` · `SQS_VIDEO_QUEUE_URL` · `VIDEO_WATERMARK_ENABLED`

## Never (human)
- Do not assume jest skips these: several files are standalone node scripts yet jest testMatch also picks them up (bot/jest.config.js:23)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/video/CLAUDE.index.md`? · `bot/shared/services/video/CLAUDE.md`? (+2)
