# testpaper — The /testpaper feature: source, generation, rendering and versioned storage
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/testpaper kg=75c09a468ba2 gen=70d67a8727f0 overflow=19 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `testpaper-orchestrator.service.js` — the conversation from request to queued paper, my papers, edits
- `paper-generation.service.js` — assembles the prompt pack and makes the one model call
- `testpaper-store.service.js` — test_paper_requests and immutable test_papers versions
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `question-types.js` | Question-type catalogue per subject family, presets and parsers for counts, mixes and total marks |
| `testpaper*` | 7 files; most used `testpaper-store.service.js`: Stores test_paper_requests and immutable versioned test_papers; edits insert a new version |
| `paper*` | 3 files; most used `paper-renderer.js`: Lays out the printable exam paper and answer key as HTML (marking header, instructions, questions, RTL aware) |

## Who reads this (generated)
- `paper-renderer.js` ← imported by `bot/shared/services/testpaper/testpaper-delivery.service.js:24:f3605e0d` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:33:8676e962` (+1)
- `question-types.js` ← imported by `bot/shared/services/testpaper/paper-generation.service.js:29:d8f39c3f` · `bot/shared/services/testpaper/testpaper-orchestrator.service.js:32:6efce8ec` (+1)
- `testpaper-strings.js` ← imported by `bot/workers/testpaper.worker.js:30:6de41432` · `bot/shared/services/testpaper/testpaper-delivery.service.js:25:bd3e2155` (+1)
- … 9 more → `CLAUDE.index.md`

## Never (human)
- A ready paper is never rewritten; an edit inserts the next version (bot/shared/services/testpaper/testpaper-store.service.js:8)
- Every store read must be owner-checked by user_id in the query (bot/shared/services/testpaper/testpaper-store.service.js:138)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/testpaper/paper-generation.test.js` (paper-generation.service.js, question-types.js, testpaper-prompts.json)
- `tests/testpaper/testpaper-orchestrator.test.js` (testpaper-orchestrator.service.js, testpaper-store.service.js)
- … 10 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/CLAUDE.md`? · `docs/features/test-papers.md`?
