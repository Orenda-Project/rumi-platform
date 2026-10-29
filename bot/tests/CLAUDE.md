# tests — Jest tests for bot handlers, services, menu, registration and video flows

<!-- kg:meta repo=rumi-platform dir=bot/tests kg=b0bd9bd1dbe2 gen=1efb7daa911f overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `services/audio.service.test.js` — ASR routing across Soniox and MMS
- `unit/lesson-plan-worker.test.js` — delivery idempotency
- `video/` — video generation flow tests
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `handlers/` | → (no door; 2 tests) |
| `menu/` | → (no door; 2 tests) |
| `registration/` | → (no door; 1 tests) |
| `routes/` | → (no door; 1 tests) |
| `services/` | → (no door; 13 tests) |
| `unit/` | → (no door; 5 tests) |
| `video/` | → (no door; 10 tests) |
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
- docs: `bot/CLAUDE.md`? · `bot/console/views/CLAUDE.md`? · `pinokio/CLAUDE.md`?
