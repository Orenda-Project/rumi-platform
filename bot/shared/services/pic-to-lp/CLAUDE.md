# pic-to-lp — Photo-of-a-textbook-page to lesson plan: collect, classify, form, generate, deliver
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/pic-to-lp kg=7dcfd23c0ff9 gen=5d5edcfa2607 overflow=35 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `page-collector.service.js` — multi-photo collection UX after the teacher accepts the LP offer
- `completion-handler.service.js` — extracts metadata and sends the confirmation Flow when collection ends
- `kieai-handoff.service.js` — acks the form and enqueues the SQS job the pic-lp-kieai worker runs
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `pic*` | 3 files; most used `pic-lp-session.service.js`: CRUD over the pic_lp_sessions table (active/terminal statuses, TTLs, pages, flow-token lookup) |
| `CLAUDE.index.md` | (unmapped) |
| `kieai*` | 3 files; most used `kieai-prompt-builder.service.js`: Pure builders of the page-1/page-2 image prompts for pic-LP (style preamble, section layout, Nastaliq rule) |
| … | 10 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `pic-lp-session.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:553:8f98083e` · `bot/shared/routes/pic-lp-endpoint.js:17:8f98083e` (+6)
- `flow-options.js` ← imported by `bot/shared/routes/pic-lp-endpoint.js:25:54baecda` · `bot/shared/services/pic-to-lp/completion-handler.service.js:21:8566b326`
- … 14 more → `CLAUDE.index.md`

## Never (human)
- Dropdown arrays must live only in flow-options.js; the Flow endpoint and completion handler both read it so they cannot drift (bot/shared/services/pic-to-lp/flow-options.js:7)
- Generation must not run in the webhook: handoff enqueues SQS and returns; the worker generates (bot/shared/services/pic-to-lp/kieai-handoff.service.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/limits/lesson-plan-availability.test.js` (lp-handoff.service.js)
- `tests/limits/userid-gates.test.js` (lp-handoff.service.js)
- … 11 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/pic-to-lp/CLAUDE.index.md`? · `bot/shared/services/pic-to-lp/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? (+6)
