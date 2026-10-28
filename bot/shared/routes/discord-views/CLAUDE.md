# discord-views — Discord screen mappings for Flow-equivalent forms (25-option menu cap)
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/routes/discord-views kg=e40419bbe05f gen=547c221d01c1 overflow=4 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `registration.view.js` — the most complex mapping, with the two-step country picker
- `settings.view.js` — simplest example of screenToSteps/mergeScreenData
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `attendance-marking.view.js` | Discord screen mapping for tap-to-mark attendance: chunked multi-selects within the 25-option cap |
| `registration.view.js` | Discord registration screens incl. two-step country picker and Pakistan/India region menus |
| `settings.view.js` | Discord settings screens: language and observation-framework select menus, no modal needed |
| `attendance.view.js` | Discord screen mapping for attendance class setup (frequency enum, class name, section, student names) |
| `exam-confirm.view.js` | Discord screen mapping for exam student confirmation using chunked multi-select menus |
| … | 1 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `attendance-marking.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:108:929851d4`
- `attendance.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:75:291a19c5`
- `exam-confirm.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:164:aedffb2f`
- `reading-assessment.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:192:8b123e56`
- … 2 more → `CLAUDE.index.md`

## Never (human)
- Never exceed 25 options in a Discord select menu; chunk any roster over 25 (bot/shared/routes/discord-views/exam-confirm.view.js:11-14)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/routes/discord-views.test.js` (registration.view.js, settings.view.js)
- `tests/attendance/marking-leave-and-staff.test.js` (attendance-marking.view.js)
- … 1 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.md`? · `bot/shared/routes/discord-views/CLAUDE.index.md`? · `bot/shared/routes/discord-views/CLAUDE.md`? · `tests/attendance/CLAUDE.index.md`? · `tests/attendance/CLAUDE.md`? (+2)
