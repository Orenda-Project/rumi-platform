# tests — Root Jest suite for bot, dashboard and portal; one folder per feature area
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests kg=f4e745c63f0b gen=12fd9c21a285 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `jest.config.js` — Jest config: testMatch under tests/, module mappers that stub bot-only packages
- `setup.js` — global env defaults (dummy keys) loaded before every test
- `run.js` — what `npm test` runs; wraps Jest for Node 22+
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 9 sub-dirs, each with `CLAUDE.md` | `_helpers/` · `attendance/` · `coaching/` · `dashboard/` · `messaging/` · `observe/` · `quiz/` · `setup/` · `testpaper/` |
| 35 sub-dirs without a door | `__mocks__/` (14 tests) · `cache/` (2 tests) · `characterization/` (4 tests) · `config/` (3 tests) · `console/` (8 tests) · +30 more → `CLAUDE.index.md` |
| `student-video-feedback.test.js` | Pins student-video-feedback.service thumbs-up/down survey rows and snapshot, mirroring lp-feedback tests |
| `jest.config.js` | Jest config for the root suite: forces root node_modules resolution and stubs axios, pino, canvas and similar |
| `setup.js` | Jest global setup: NODE_ENV=test and safe dummy Supabase, OpenRouter, Redis and WhatsApp env values |
| `run.js` | Test runner wrapper: adds Node 22+ --localstorage-file so Jest runs, then execs jest |

## Who reads this (generated)
- (none)

## Never (human)
- Do not import bot-only packages by bare name unmocked: the root CI job runs before bot deps install (tests/jest.config.js:15-22)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `qa-testing`?
- docs: `AGENTS.md`? · `CLAUDE.md`? · `bot/console/views/CLAUDE.md`? · `bot/shared/services/cache/CLAUDE.md`? · `dashboard/CLAUDE.md`?
