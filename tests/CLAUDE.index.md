# tests — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 14 test files) |
| `_helpers/` | Shared test helpers used across suites → `_helpers/CLAUDE.md` |
| `attendance/` | Tests for class and staff attendance marking, leave and monthly registers → `attendance/CLAUDE.md` |
| `cache/` | Tests for the Railway Redis service's error handling and missing methods → `cache/CLAUDE.md` |
| `characterization/` | Frozen legacy webhook wire responses used to prove gateway parity → `characterization/CLAUDE.md` |
| `coaching/` | Tests for coaching sessions, frameworks, hero reports and reflective debrief → `coaching/CLAUDE.md` |
| `config/` | Tests for deployment config readers: Discord regions, quiz languages, school clock → `config/CLAUDE.md` |
| `console/` | Tests for the operator console: auth gate, secret redaction, live feed, switches → `console/CLAUDE.md` |
| `dashboard/` | Tests for the Express dashboard's CSP, HTML escaping, AMA routes and boot deps → `dashboard/CLAUDE.md` |
| `database/` | Tests for user lookup and creation across channels → `database/CLAUDE.md` |
| `edit-class/` | Tests for the edit-class flow: phone validation and roster CRUD endpoint → `edit-class/CLAUDE.md` |
| `exam-checker/` | Tests for the exam checker: triggers, Flow, grading, storage and migrations → `exam-checker/CLAUDE.md` |
| `fixtures/` | → (no door; 13 test files) |
| `flow-id-validator/` | Test for the FLOW_ID startup check against the WABA's own flows list → `flow-id-validator/CLAUDE.md` |
| `flow-response/` | Tests for routing completed Flow replies (NFM_REPLY) to the right handler → `flow-response/CLAUDE.md` |
| `gateway/` | Tests for the webhook ingestion gateway: unit, stress, differential and standalone → `gateway/CLAUDE.md` |
| `homework/` | Test for the homework flow: lookup, request endpoint, bundle worker → `homework/CLAUDE.md` |
| `language/` | Tests for language enablement: French, French STT, six Indian languages → `language/CLAUDE.md` |
| `limits/` | Tests for public-deployment limits: rate limits, daily caps, model budget → `limits/CLAUDE.md` |
| `menu/` | Test for main-menu actions routing to flows → `menu/CLAUDE.md` |
| `messaging/` | Tests for channel drivers and adapters: Baileys, Matrix, Slack, Discord, text flows → `messaging/CLAUDE.md` |
| `nudges/` | Tests for proactive teacher nudges: store, sweeper, kinds, flags, wiring → `nudges/CLAUDE.md` |
| `observe/` | Tests for the /observe coach feature: capture, form, debrief, teacher report → `observe/CLAUDE.md` |
| `pic-to-lp/` | Tests for picture-to-lesson-plan: classify a book photo, build prompts, hand off → `pic-to-lp/CLAUDE.md` |
| `portal/` | Tests for the teacher portal backend and Android app shell → `portal/CLAUDE.md` |
| `queue/` | Tests for the queue drivers (SQS, BullMQ, memory) and job dedup → `queue/CLAUDE.md` |
| `quiz/` | Jest suites for the lesson quiz, class video quiz, figures and quiz PDFs → `quiz/CLAUDE.md` |
| `reading/` | Tests for the reading assessment: benchmarks, audio and passage images → `reading/CLAUDE.md` |
| `region/` | Test for DB-driven region feature gating → `region/CLAUDE.md` |
| `registration/` | Tests for teacher registration and name capture, incl. the Matrix offer → `registration/CLAUDE.md` |
| `reports/` | Tests for PDF and HTML report rendering and temp-file safety → `reports/CLAUDE.md` |
| `routes/` | Tests for Flow endpoints and the Slack/Discord modal route layer → `routes/CLAUDE.md` |
| `scripts/` | Tests for operator scripts: Morning Brief send/worker and Discord registration → `scripts/CLAUDE.md` |
| `services/` | Tests for service-level safety: temp paths, logging and downloads → `services/CLAUDE.md` |
| `settings/` | Test for the settings Flow: region config, language dropdown, endpoint → `settings/CLAUDE.md` |
| `setup/` | Repo-wide guards and setup-CLI tests: schema, docs, links, requires, CI, hygiene → `setup/CLAUDE.md` |
| `status/` | Test for the status Flow: active resources and cancel → `status/CLAUDE.md` |
| `storage/` | Tests for the R2/S3 storage client behaviour → `storage/CLAUDE.md` |
| `telemetry/` | Tests for opt-in deployment telemetry and its setup consent step → `telemetry/CLAUDE.md` |
| `testpaper/` | Tests for the /testpaper feature: conversation, generation, rendering, worker → `testpaper/CLAUDE.md` |
| `textbook-lp-v2/` | Tests for textbook lesson plans: ToC loading, topic matching, pre-generated lookup → `textbook-lp-v2/CLAUDE.md` |
| `unit/` | Unit tests for utils plus early public-release guard tests under sprint-N → `unit/CLAUDE.md` |
| `video/` | Tests for video job recovery and result-URL logging → `video/CLAUDE.md` |
| `whatsapp/` | Tests for the Meta WhatsApp driver's send methods → `whatsapp/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `jest.config.js` | Jest config for the root suite: forces root node_modules resolution and stubs axios, pino, canvas and similar |
| `run.js` | Test runner wrapper: adds Node 22+ --localstorage-file so Jest runs, then execs jest |
| `setup.js` | Jest global setup: NODE_ENV=test and safe dummy Supabase, OpenRouter, Redis and WhatsApp env values |
| `student-video-feedback.test.js` | Pins student-video-feedback.service thumbs-up/down survey rows and snapshot, mirroring lp-feedback tests |

## Who reads this (all, generated)
- env `LLM_PROVIDER` read at `tests/setup.js:17:6259bb1a`
- env `NODE_OPTIONS` read at `tests/run.js:29:1f6b0e36`
- env `OPENROUTER_API_KEY` read at `tests/setup.js:14:572b8465`
- env `PORT` read at `tests/setup.js:16:eb1a89ba`
- env `REDIS_URL` read at `tests/setup.js:15:1168aff6`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `tests/setup.js:13:e0edb9fb`
- env `SUPABASE_URL` read at `tests/setup.js:12:88405bdc`
- env `WHATSAPP_BOT_NUMBER` read at `tests/setup.js:20:241d042e`

## Tests (all, generated)
- (none)

## Related (all, generated)
- skills: `qa-testing`?
- docs: `AGENTS.md`? · `CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/console/views/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `pinokio/CLAUDE.index.md`? · `pinokio/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/_helpers/CLAUDE.md`? · `tests/attendance/CLAUDE.index.md`? · `tests/attendance/CLAUDE.md`? · `tests/cache/CLAUDE.md`? · `tests/characterization/CLAUDE.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/CLAUDE.md`? · `tests/config/CLAUDE.md`? · `tests/console/CLAUDE.md`? · `tests/dashboard/CLAUDE.index.md`? · `tests/dashboard/CLAUDE.md`? · `tests/database/CLAUDE.md`? · `tests/edit-class/CLAUDE.md`? · `tests/exam-checker/CLAUDE.index.md`? · `tests/exam-checker/CLAUDE.md`? · `tests/flow-id-validator/CLAUDE.md`? · `tests/flow-response/CLAUDE.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/gateway/CLAUDE.md`? · `tests/homework/CLAUDE.md`? · `tests/language/CLAUDE.md`? · `tests/limits/CLAUDE.md`? · `tests/menu/CLAUDE.md`? · `tests/messaging/CLAUDE.index.md`? · `tests/messaging/CLAUDE.md`? · `tests/nudges/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/observe/CLAUDE.md`? · `tests/pic-to-lp/CLAUDE.index.md`? · `tests/pic-to-lp/CLAUDE.md`? · `tests/portal/CLAUDE.index.md`? · `tests/portal/CLAUDE.md`? · `tests/queue/CLAUDE.md`? · `tests/quiz/CLAUDE.index.md`? · `tests/quiz/CLAUDE.md`? · `tests/reading/CLAUDE.md`? · `tests/region/CLAUDE.md`? · `tests/registration/CLAUDE.md`? · `tests/reports/CLAUDE.md`? · `tests/routes/CLAUDE.index.md`? · `tests/routes/CLAUDE.md`? · `tests/scripts/CLAUDE.md`? · `tests/services/CLAUDE.md`? · `tests/settings/CLAUDE.md`? · `tests/setup/CLAUDE.index.md`? · `tests/setup/CLAUDE.md`? · `tests/status/CLAUDE.md`? · `tests/storage/CLAUDE.md`? · `tests/telemetry/CLAUDE.md`? · `tests/testpaper/CLAUDE.index.md`? · `tests/testpaper/CLAUDE.md`? · `tests/textbook-lp-v2/CLAUDE.md`? · `tests/unit/CLAUDE.md`? · `tests/video/CLAUDE.md`? · `tests/whatsapp/CLAUDE.md`?
