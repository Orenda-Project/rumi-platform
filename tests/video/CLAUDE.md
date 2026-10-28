# video — Tests for video job recovery and result-URL logging

<!-- kg:meta repo=rumi-platform dir=tests/video kg=af60e47e570b gen=914065eac10d overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `sqs-worker-stale-video-recovery.test.js` — requeue keeps the originating channel
- `video-result-url-not-logged.test.js` — result URLs are never logged
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `video-result-url-not-logged.test.js` | Pins that video_tasks.result_url is stored and used but never logged by video-image and video-animation services |
| `CLAUDE.md` | (unmapped) |
| `sqs-worker-stale-video-recovery.test.js` | Pins recoverStaleVideoRequests: requeue keeps channel `from`; apology goes to recipient_identifier |

## Who reads this (generated)
- (none)

## Never (human)
- video_tasks.result_url is used but never logged (video-result-url-not-logged.test.js:3)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/video/CLAUDE.index.md`? · `bot/shared/services/video/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/video/CLAUDE.md`?
