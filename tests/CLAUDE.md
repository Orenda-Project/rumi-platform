# tests — Root Jest suite for bot, dashboard and portal; one folder per feature area
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests kg=931ef7570f05 gen=d53cc1e43acf overflow=2 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `jest.config.js` — Jest config: testMatch under tests/, module mappers that stub bot-only packages
- `setup.js` — global env defaults (dummy keys) loaded before every test
- `run.js` — what `npm test` runs; wraps Jest for Node 22+
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 42 sub-dirs, each with `CLAUDE.md` | `_helpers/` · `attendance/` · `cache/` · `characterization/` · `coaching/` · `config/` · `console/` · `dashboard/` · `database/` · `edit-class/` · `exam-checker/` · `flow-id-validator/` · `flow-response/` · `gateway/` · `homework/` · `language/` · `limits/` · `menu/` · `messaging/` · `nudges/` · `observe/` · `pic-to-lp/` · `portal/` · `queue/` · `quiz/` · `reading/` · `region/` · `registration/` · `reports/` · `routes/` · `scripts/` · `services/` · `settings/` · `setup/` · `status/` · `storage/` · `telemetry/` · `testpaper/` · `textbook-lp-v2/` · `unit/` · `video/` · `whatsapp/` |
| 2 sub-dirs without a door | `__mocks__/` (14 tests) · `fixtures/` (13 tests) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `student-video-feedback.test.js` | Pins student-video-feedback.service thumbs-up/down survey rows and snapshot, mirroring lp-feedback tests |
| `jest.config.js` | Jest config for the root suite: forces root node_modules resolution and stubs axios, pino, canvas and similar |
| … | 2 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `LLM_PROVIDER` · `NODE_OPTIONS` · `OPENROUTER_API_KEY` · `PORT` · `REDIS_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_URL` · `WHATSAPP_BOT_NUMBER`

## Never (human)
- Do not import bot-only packages by bare name unmocked: the root CI job runs before bot deps install (tests/jest.config.js:15-22)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `qa-testing`?
- docs: `AGENTS.md`? · `CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/console/views/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? (+61)
