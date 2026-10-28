# tests — Jest tests for bot handlers, services, menu, registration and video flows

<!-- kg:meta repo=rumi-platform dir=bot/tests kg=420bbde08361 gen=9414cba75256 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `services/audio.service.test.js` — ASR routing across Soniox and MMS
- `unit/lesson-plan-worker.test.js` — delivery idempotency
- `video/` — video generation flow tests
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `handlers/` | → (no door; 2 test files) |
| `menu/` | → (no door; 2 test files) |
| `registration/` | → (no door; 1 test files) |
| `routes/` | → (no door; 1 test files) |
| `services/` | Service-level tests: attendance, audio, vision, transcripts, reading → `services/CLAUDE.md` |
| `unit/` | Unit tests for lesson-plan storage and worker idempotency and logging utilities → `unit/CLAUDE.md` |
| `video/` | Tests for the video flow: style, language, PDF, R2, watermark, parallelism → `video/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `setup.js` | Jest setup helper configuring env and global mocks; not loaded, since jest.config.js leaves setupFilesAfterEnv empty |
| `bug-014-video-language.test.js` | Pins video-script prompts so Punjabi narration uses Punjabi vocabulary, not Urdu |
| `bug-003-false-promise.test.js` | Pins lesson-plan intent detection so a topic like 'Mathematics for grade 2' creates a plan instead of a false promise |
| `bug-005-audio-document.test.js` | Pins handling of audio sent as a document under 15 minutes, avoiding the misleading coaching-recording message |

## Who reads this (generated)
- (none)

## Never (human)
- Do not rely on tests/setup.js: it is not loaded, setupFilesAfterEnv is empty (bot/jest.config.js:29)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/console/views/CLAUDE.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? (+8)
