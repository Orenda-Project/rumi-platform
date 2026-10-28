# pic-to-lp — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/pic-to-lp -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `classifier.test.js` | Pins pic-to-lp classifier defaults: returns OTHER on non-JSON or thrown errors, OpenAI mocked |
| `flow-options-sync.test.js` | Guards that docs/flows/pic-lp-confirm-flow.json dropdown examples match flow-options.js, which had drifted |
| `flow-options.test.js` | Pins pic-to-lp flow-options: region-agnostic grade, subject and language dropdown sources for the OSS build |
| `image-handler-routing.test.js` | Pins pic-LP routing in image-message.handler: tryPicLpRoute and handleCoalescedBatch (book page vs vision fallback) |
| `kieai-client.test.js` | Pins kieai-client pure routing: pickBackend by language and inputFieldFor by model, no network |
| `kieai-prompt-builder.test.js` | Pins Kie.ai prompt builder page-1/page-2 assembly and env-driven coaching-number sanitization |
| `lp-handoff.test.js` | Pins lp-handoff.pickBackend default with no AB setting row: kieai if its key exists, else gamma |
| `pic-lp-latency.test.js` | Pins pic-lp-latency RPC wrapper and cache: null on error, shaped row on success |
| `pic-lp-session.test.js` | Pins pic-lp-session TTL helper and status-set shapes |
| `pic-lp-wait-message.test.js` | Pins pic-lp wait-message multilingual copy and the content vs system language split driving text and timing |
| `section-registry.test.js` | Pins SECTION_REGISTRY canonical order and that every built prompt (en/ur, page 1/2) contains its registry section labels |

## Who reads this (all, generated)
- env `GAMMA_API_KEY` read at `tests/pic-to-lp/flow-options.test.js:54:6e0145c0`
- env `OPENAI_API_KEY` read at `tests/pic-to-lp/classifier.test.js:8:d8f039fe`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/pic-to-lp/CLAUDE.index.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/pic-to-lp/CLAUDE.index.md`? · `tests/pic-to-lp/CLAUDE.md`?
