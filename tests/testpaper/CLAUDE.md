# testpaper — Tests for the /testpaper feature: conversation, generation, rendering, worker
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/testpaper kg=c0f09014403a gen=07af2c2539ae overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `testpaper-orchestrator.test.js` — the conversation on any channel
- `testpaper-worker.test.js` — end-to-end write, store, deliver
- `helpers/fake-db.js` — in-memory query builder for these suites
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `helpers/` | → (no door; 1 files: 0 test + 1 support) |
| `paper*` | 3 files; most used `paper-generation.test.js`: Pins paper-generation: prompt order (safety last), model mocked at llm-client, post-processing into a question tree |
| `testpaper*` | 8 files; most used `testpaper-worker.test.js`: Runs testpaper.worker end to end in-process: real store, generator, renderer and delivery, boundaries mocked |
| `live-wiring-text.test.js` | Drives real handleTextMessage so /testpaper reaches the orchestrator (the connecting line in the live handler) |
| `live-wiring-webhook.test.js` | POSTs Meta-shaped webhooks into real handleWebhookPost to pin /testpaper wiring in whatsapp-bot.js |
| `model-registry.test.js` | Pins model-registry resolveModelForJob: per-job env override and a working default |
| `question-types.test.js` | Pins question-types catalogue per subject, count limits and parsing of numbers a teacher types |
| `sqs-worker-testpaper.test.js` | Pins sqs-worker routing of the two test-paper job types to testpaper.worker with a longer visibility timeout |
| `import-curriculum-corpus.test.js` | Pins import-curriculum-corpus script: page-truth into textbooks, textbook_toc and textbook_pages that papers draw on |

## Who reads this (generated)
- (none)

## Never (human)
- The test-paper migration must be additive: it runs on databases holding real data (testpaper-schema.test.js:4-5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/testpaper/CLAUDE.md`? · `tests/CLAUDE.md`?
