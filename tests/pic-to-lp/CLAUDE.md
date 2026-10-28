# pic-to-lp — Tests for picture-to-lesson-plan: classify a book photo, build prompts, hand off
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/pic-to-lp kg=771c495dd7f1 gen=ae02156e7441 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `image-handler-routing.test.js` — how photos enter the pic-LP path
- `section-registry.test.js` — pins the illustrated-LP section order
- `flow-options-sync.test.js` — Flow JSON stays in step with flow-options.js
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `flow-options-sync.test.js` | Guards that docs/flows/pic-lp-confirm-flow.json dropdown examples match flow-options.js, which had drifted |
| `section-registry.test.js` | Pins SECTION_REGISTRY canonical order and that every built prompt (en/ur, page 1/2) contains its registry section labels |
| `classifier.test.js` | Pins pic-to-lp classifier defaults: returns OTHER on non-JSON or thrown errors, OpenAI mocked |
| `flow-options.test.js` | Pins pic-to-lp flow-options: region-agnostic grade, subject and language dropdown sources for the OSS build |
| `image-handler-routing.test.js` | Pins pic-LP routing in image-message.handler: tryPicLpRoute and handleCoalescedBatch (book page vs vision fallback) |
| `kieai-client.test.js` | Pins kieai-client pure routing: pickBackend by language and inputFieldFor by model, no network |
| `kieai-prompt-builder.test.js` | Pins Kie.ai prompt builder page-1/page-2 assembly and env-driven coaching-number sanitization |
| `lp-handoff.test.js` | Pins lp-handoff.pickBackend default with no AB setting row: kieai if its key exists, else gamma |
| `pic*` | 3 files; most used `pic-lp-wait-message.test.js`: Pins pic-lp wait-message multilingual copy and the content vs system language split driving text and timing |

## Who reads this (generated)
- env read here: `GAMMA_API_KEY` · `OPENAI_API_KEY`

## Never (human)
- flow-options.js is the source of truth; the Flow JSON copy must match it (flow-options-sync.test.js:4-6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/pic-to-lp/CLAUDE.index.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? (+2)
