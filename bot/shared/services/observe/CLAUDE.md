# observe — Coach observation pipeline: capture, review form, debrief, teacher report
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/observe kg=10ee3cce13c5 gen=cb17bb07762b overflow=136 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `observe-capture.service.js` — starts an observation from a recording
- `observe-debrief.service.js` — guided debrief and coach feedback
- `observe-send.service.js` — sends the teacher their report
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `observe-strings.js` | All /observe user-facing copy as a language pack with English base and per-key overrides |
| `observe-state.service.js` | Redis state machine for a coach's capture steps (pick, audio, form, debrief audio) with 2h TTL |
| `observe-framework.js` | Observe framework pack selecting TEACH, HOTS or MEWAKA rubric by OBSERVE_FRAMEWORK for the pipeline |
| … | 36 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `observe-capture.service.js` (+8)) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? (+52)
- … 58 more → `CLAUDE.index.md`

## Never (human)
- The coach never sees a score or rubric internals (bot/shared/services/observe/observe-coach-feedback.js:11)
- Coach edits write v2 and never touch v1 autofill_analysis_data (bot/shared/services/observe/observe-edits.service.js:4)
- Section B question must never block or restart the capture (bot/shared/services/observe/observe-plan.service.js:10)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/observe/observe-draft-form.test.js` (observe-draft.service.js, observe-form.service.js, observe-framework.js, observe-plan.service.js, observe-state.service.js)
- `tests/observe/observe-section-b-form.test.js` (observe-draft.service.js, observe-edits.service.js, observe-form.service.js, observe-framework.js, observe-state.service.js)
- … 42 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/observe/CLAUDE.index.md`? · `bot/shared/services/observe/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/services/CLAUDE.md`?
