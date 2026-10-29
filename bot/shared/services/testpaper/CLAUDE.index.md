# testpaper — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/testpaper -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `paper-generation.service.js` | Builds the prompt from source text and makes the one model call that returns a test paper's question tree |
| `paper-json.util.js` | Repairs near-JSON model output (fences, missing commas, raw newlines, truncation) for test paper generation |
| `paper-renderer.js` | Lays out the printable exam paper and answer key as HTML (marking header, instructions, questions, RTL aware) |
| `question-types.js` | Question-type catalogue per subject family, presets and parsers for counts, mixes and total marks |
| `testpaper-delivery.service.js` | Renders a stored paper version and its answer key to two PDFs and sends them with an edit offer |
| `testpaper-orchestrator.service.js` | The /testpaper conversation: source, chapters, size, language, queue, my papers, edits |
| `testpaper-prompts.json` | Prompt pack (tp.system, per-subject, format, answer key, safety, revise) loaded by paper-generation.service |
| `testpaper-session.service.js` | Redis-backed (memory fallback) /testpaper conversation state with TTL so a redeploy does not lose a pick |
| `testpaper-sources.service.js` | Flattens a test paper's source (own lesson plans, loaded textbooks, uploaded chapter) to text; reads textbooks tables |
| `testpaper-store.service.js` | Stores test_paper_requests and immutable versioned test_papers; edits insert a new version |
| `testpaper-strings.js` | Per-language copy for the /testpaper conversation with English fallback and gender-neutral Urdu |

## Who reads this (all, generated)
- `paper-generation.service.js` ← imported by `bot/workers/testpaper.worker.js:28:83c277b8`
- `paper-json.util.js` ← imported by `bot/shared/services/testpaper/paper-generation.service.js:28:8c390e4f`
- `paper-renderer.js` ← imported by `bot/shared/services/testpaper/testpaper-delivery.service.js:24:f3605e0d` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:33:8676e962` · `bot/shared/services/testpaper/testpaper-sources.service.js:28:8676e962`
- `question-types.js` ← imported by `bot/shared/services/testpaper/paper-generation.service.js:29:d8f39c3f` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:32:6efce8ec` · `bot/shared/services/testpaper/testpaper-sources.service.js:27:d8f39c3f`
- `testpaper-delivery.service.js` ← imported by `bot/workers/testpaper.worker.js:29:302e9e03` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:436:613cd1ff`
- `testpaper-orchestrator.service.js` ← imported by `bot/shared/handlers/testpaper-trigger.js:33:a55e35c2`
- `testpaper-prompts.json` ← imported by `bot/shared/services/testpaper/paper-generation.service.js:31:0c2a6543`
- `testpaper-session.service.js` ← imported by `bot/shared/services/testpaper/testpaper-orchestrator.service.js:31:e2bf29bc`
- `testpaper-sources.service.js` ← imported by `bot/shared/services/testpaper/testpaper-orchestrator.service.js:29:e8b5b446`
- `testpaper-store.service.js` ← imported by `bot/workers/testpaper.worker.js:27:8b334762` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:30:562c2605`
- `testpaper-strings.js` ← imported by `bot/workers/testpaper.worker.js:30:6de41432` · `bot/shared/services/testpaper/testpaper-delivery.service.js:25:bd3e2155` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:34:bd3e2155`
- env `TESTPAPER_CURRICULUM` read at `bot/shared/services/testpaper/testpaper-sources.service.js:74:8adb952c`

## Tests (all, generated)
- `paper-generation.service.js` ← `tests/testpaper/paper-generation.test.js`
- `paper-json.util.js` ← `tests/testpaper/paper-json.util.test.js`
- `paper-renderer.js` ← `tests/testpaper/paper-renderer.test.js`
- `question-types.js` ← `tests/testpaper/paper-generation.test.js` · `tests/testpaper/question-types.test.js`
- `testpaper-delivery.service.js` ← `tests/testpaper/testpaper-delivery.test.js`
- `testpaper-orchestrator.service.js` ← `tests/testpaper/live-wiring-text.test.js` · `tests/testpaper/live-wiring-webhook.test.js` · `tests/testpaper/testpaper-orchestrator.test.js`
- `testpaper-prompts.json` ← `tests/testpaper/paper-generation.test.js`
- `testpaper-session.service.js` ← `tests/testpaper/testpaper-session.test.js`
- `testpaper-sources.service.js` ← `tests/testpaper/testpaper-sources.test.js`
- `testpaper-store.service.js` ← `tests/testpaper/testpaper-orchestrator.test.js` · `tests/testpaper/testpaper-store.test.js` · `tests/testpaper/testpaper-worker.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/CLAUDE.md`? · `docs/features/test-papers.md`?
