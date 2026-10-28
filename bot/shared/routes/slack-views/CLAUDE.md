# slack-views — Slack Block Kit screen mappings for Flow-equivalent modals

<!-- kg:meta repo=rumi-platform dir=bot/shared/routes/slack-views kg=650e3e6ca466 gen=a1e5b2f94400 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `registration.view.js` — fullest mapping incl. country buckets
- `settings.view.js` — smallest screenToView/viewToScreenData example
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `attendance-marking.view.js` | Slack Block Kit mapping for tap-to-mark attendance (one checkboxes block for the roster) |
| `attendance.view.js` | Slack Block Kit mapping for attendance class setup and add-student loop |
| `registration.view.js` | Slack Block Kit mapping for registration screens (selects, multi-select subjects, country buckets) |
| `exam-confirm.view.js` | Slack Block Kit mapping for exam student confirmation checkboxes |
| `settings.view.js` | Slack Block Kit mapping for the settings screen (language and framework selects) |

## Who reads this (generated)
- `attendance.view.js` ← imported by `bot/shared/routes/slack-flow-registry.js:79:91b684ce` · `bot/shared/routes/slack-modal-interactions.handler.js:197:91b684ce`
- `registration.view.js` ← imported by `bot/shared/routes/slack-flow-registry.js:30:7de8fef8` · `bot/shared/routes/slack-modal-interactions.handler.js:50:7de8fef8`
- `attendance-marking.view.js` ← imported by `bot/shared/routes/slack-flow-registry.js:126:66e7f1bc`
- `exam-confirm.view.js` ← imported by `bot/shared/routes/slack-flow-registry.js:170:919eba44`
- `settings.view.js` ← imported by `bot/shared/routes/slack-flow-registry.js:48:b1673d6d`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/routes/slack-views-attendance-exam-confirm.test.js` (attendance-marking.view.js, attendance.view.js, exam-confirm.view.js)
- `tests/routes/slack-views.test.js` (registration.view.js, settings.view.js)
- `tests/attendance/marking-leave-and-staff.test.js` (attendance-marking.view.js)

## Related (generated)
- docs: `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.md`? · `bot/shared/routes/slack-views/CLAUDE.md`? · `tests/attendance/CLAUDE.index.md`? · `tests/attendance/CLAUDE.md`? · `tests/routes/CLAUDE.index.md`? (+1)
