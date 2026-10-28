# pic-to-lp — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/pic-to-lp -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `caption-prefill.js` | Regex-extracts grade/subject/topic/language from a photo caption to pre-fill the pic-LP form before the LLM runs |
| `classifier.service.js` | One vision call deciding if an incoming image is a textbook page (BOOK_PAGE) vs classroom/student work/other |
| `completion-handler.service.js` | When page collection ends, runs metadata extraction and sends the pic-LP confirmation Flow; reads users |
| `flow-options.js` | Shared grade/subject/language/format dropdown arrays for the pic-LP Flow, used by completion handler and Flow endpoint |
| `gamma-client.service.js` | Wraps the Gamma generations API (en/ur/sw, sd mapped to ur) for pic-LP; one copy instead of a third duplicate |
| `image-batch-coalescer.service.js` | Buffers a teacher's album of photos arriving as N webhooks into one batch before the pic-LP entry path runs |
| `kieai-client.service.js` | Wraps the Kie.ai gpt-image-2 jobs API for pic-LP; picks 1K (en) vs 2K (ur/sd/pa) backend and latency |
| `kieai-handoff.service.js` | Takes the Flow submission, sends the wait message, enqueues the SQS job for the pic-lp-kieai worker, acks; reads users |
| `kieai-prompt-builder.service.js` | Pure builders of the page-1/page-2 image prompts for pic-LP (style preamble, section layout, Nastaliq rule) |
| `lp-handoff.service.js` | Gamma path of pic-LP: builds the prompt from OCR text, calls Gamma, delivers PDF; reads app_settings for backend A/B |
| `metadata-extractor.service.js` | One vision call over all collected pages + caption returning best-effort grade/subject/topic/ocr_text |
| `page-collector.service.js` | Runs the multi-photo collection UX (add another / Done buttons, timeout) after a teacher accepts the LP offer |
| `pic-lp-latency.service.js` | Caches the lp_latency_stats RPC for 5 min so the wait message can quote live p50/p90 generation times |
| `pic-lp-session.service.js` | CRUD over the pic_lp_sessions table (active/terminal statuses, TTLs, pages, flow-token lookup) |
| `pic-lp-wait-message.service.js` | Builds the 6-language upfront "this takes a few minutes" message sent right after the pic-LP form is submitted |

## Who reads this (all, generated)
- `caption-prefill.js` ← imported by `bot/shared/services/pic-to-lp/metadata-extractor.service.js:18:65e13cd7`
- `classifier.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:675:837252aa`
- `completion-handler.service.js` ← imported by `bot/shared/services/pic-to-lp/page-collector.service.js:203:5d02c979`
- `flow-options.js` ← imported by `bot/shared/routes/pic-lp-endpoint.js:25:54baecda` · `bot/shared/services/pic-to-lp/completion-handler.service.js:21:8566b326`
- `gamma-client.service.js` ← imported by `bot/shared/services/pic-to-lp/lp-handoff.service.js:21:b5fbb03e`
- `image-batch-coalescer.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:555:2f3fce99`
- `kieai-client.service.js` ← imported by `bot/workers/pic-lp-kieai.worker.js:35:62c40997` · `bot/shared/services/pic-to-lp/pic-lp-wait-message.service.js:17:a724623a`
- `kieai-handoff.service.js` ← imported by `bot/shared/services/pic-to-lp/lp-handoff.service.js:121:a5264f86`
- `kieai-prompt-builder.service.js` ← imported by `bot/workers/pic-lp-kieai.worker.js:36:071389bd`
- `lp-handoff.service.js` ← imported by `bot/shared/routes/pic-lp-endpoint.js:18:121e5168`
- `metadata-extractor.service.js` ← imported by `bot/shared/services/pic-to-lp/completion-handler.service.js:14:d7e2afcc`
- `page-collector.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:554:12dfb59f` · `bot/whatsapp-bot.js:870:d13dbcfe`
- `pic-lp-latency.service.js` ← imported by `bot/shared/services/pic-to-lp/kieai-handoff.service.js:16:3f075136`
- `pic-lp-session.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:553:8f98083e` · `bot/shared/routes/pic-lp-endpoint.js:17:8f98083e` · `bot/whatsapp-bot.js:871:865741f7` · `bot/workers/pic-lp-kieai.worker.js:34:086d2a2d` (+4: `python3 kg/kg.py who-reads pic-lp-session.service.js`)
- `pic-lp-wait-message.service.js` ← imported by `bot/shared/services/pic-to-lp/kieai-handoff.service.js:17:0c4ba662`
- env `COACHING_WHATSAPP_NUMBER` read at `bot/shared/services/pic-to-lp/kieai-prompt-builder.service.js:287:8ec80e8c`
- env `GAMMA_API_KEY` read at `bot/shared/services/pic-to-lp/flow-options.js:68:1d8b26ad` · `bot/shared/services/pic-to-lp/lp-handoff.service.js:64:887ffd98`
- env `KIE_API_KEY` read at `bot/shared/services/pic-to-lp/lp-handoff.service.js:63:4e4d3d76`
- env `KIE_API_KEY_PIC_LP` read at `bot/shared/services/pic-to-lp/lp-handoff.service.js:63:4e4d3d76`
- env `PIC_LP_CLASSIFIER_MODEL` read at `bot/shared/services/pic-to-lp/classifier.service.js:33:d8f4f509`
- env `PIC_LP_EXTRACTOR_MODEL` read at `bot/shared/services/pic-to-lp/metadata-extractor.service.js:29:d6ba9795`
- env `PIC_LP_FORCE_GAMMA` read at `bot/shared/services/pic-to-lp/lp-handoff.service.js:69:02bc1b88`
- env `PIC_LP_FORCE_KIEAI` read at `bot/shared/services/pic-to-lp/lp-handoff.service.js:75:0534d1b8`

## Tests (all, generated)
- `classifier.service.js` ← `tests/pic-to-lp/classifier.test.js`
- `flow-options.js` ← `tests/pic-to-lp/flow-options-sync.test.js` · `tests/pic-to-lp/flow-options.test.js`
- `kieai-client.service.js` ← `tests/pic-to-lp/kieai-client.test.js`
- `kieai-prompt-builder.service.js` ← `tests/pic-to-lp/kieai-prompt-builder.test.js` · `tests/pic-to-lp/section-registry.test.js`
- `lp-handoff.service.js` ← `tests/limits/lesson-plan-availability.test.js` · `tests/limits/userid-gates.test.js` · `tests/pic-to-lp/lp-handoff.test.js` · `tests/reports/report-temp-collision.test.js`
- `pic-lp-latency.service.js` ← `tests/pic-to-lp/pic-lp-latency.test.js`
- `pic-lp-session.service.js` ← `tests/pic-to-lp/pic-lp-session.test.js`
- `pic-lp-wait-message.service.js` ← `tests/pic-to-lp/pic-lp-wait-message.test.js`

## Related (all, generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/pic-to-lp/CLAUDE.index.md`? · `bot/shared/services/pic-to-lp/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? · `docs/customization.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/pic-to-lp.md`? · `tests/pic-to-lp/CLAUDE.index.md`? · `tests/pic-to-lp/CLAUDE.md`? · `tests/reports/CLAUDE.md`?
