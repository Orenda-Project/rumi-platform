# testpaper — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/testpaper -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `helpers/` | → (no door; 1 files: 0 test + 1 support) |
| `import-curriculum-corpus.test.js` | Pins import-curriculum-corpus script: page-truth into textbooks, textbook_toc and textbook_pages that papers draw on |
| `live-wiring-text.test.js` | Drives real handleTextMessage so /testpaper reaches the orchestrator (the connecting line in the live handler) |
| `live-wiring-webhook.test.js` | POSTs Meta-shaped webhooks into real handleWebhookPost to pin /testpaper wiring in whatsapp-bot.js |
| `model-registry.test.js` | Pins model-registry resolveModelForJob: per-job env override and a working default |
| `paper-generation.test.js` | Pins paper-generation: prompt order (safety last), model mocked at llm-client, post-processing into a question tree |
| `paper-json.util.test.js` | Pins defensive parsing of imperfect model JSON: fences, trailing commas, raw newlines, truncation |
| `paper-renderer.test.js` | Pins paper-renderer printable paper and answer key HTML, RTL decided by paper language |
| `question-types.test.js` | Pins question-types catalogue per subject, count limits and parsing of numbers a teacher types |
| `sqs-worker-testpaper.test.js` | Pins sqs-worker routing of the two test-paper job types to testpaper.worker with a longer visibility timeout |
| `testpaper-delivery.test.js` | Pins testpaper-delivery: stored version becomes paper PDF then answer-key PDF plus an edit follow-up |
| `testpaper-orchestrator.test.js` | Pins the /testpaper conversation on any channel: list and button picks through the messaging facade |
| `testpaper-schema.test.js` | Pins test-paper tables in consolidated schema, RLS policies and an additive versioned migration |
| `testpaper-session.test.js` | Pins testpaper-session conversation state: Redis-backed with in-memory fallback |
| `testpaper-sources.test.js` | Pins testpaper-sources: paper material from the teacher's lesson plans, imported textbooks or typed text |
| `testpaper-store.test.js` | Pins testpaper-store: version numbering, ready papers never rewritten, my-papers list, on a fake query builder |
| `testpaper-trigger.test.js` | Pins testpaper-trigger routing of /testpaper and /paper text into the conversation |
| `testpaper-worker.test.js` | Runs testpaper.worker end to end in-process: real store, generator, renderer and delivery, boundaries mocked |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/shared/services/testpaper/CLAUDE.md`? · `tests/CLAUDE.md`?
