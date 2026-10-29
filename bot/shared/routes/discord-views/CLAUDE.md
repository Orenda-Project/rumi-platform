# discord-views — Discord screen mappings for Flow-equivalent forms (25-option menu cap)

<!-- kg:meta repo=rumi-platform dir=bot/shared/routes/discord-views kg=a31933438c84 gen=7ea28ad2bad8 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `registration.view.js` — the most complex mapping, with the two-step country picker
- `settings.view.js` — simplest example of screenToSteps/mergeScreenData
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `attendance-marking.view.js` | Discord screen mapping for tap-to-mark attendance: chunked multi-selects within the 25-option cap |
| `registration.view.js` | Discord registration screens incl. two-step country picker and Pakistan/India region menus |
| `settings.view.js` | Discord settings screens: language and observation-framework select menus, no modal needed |
| `attendance.view.js` | Discord screen mapping for attendance class setup (frequency enum, class name, section, student names) |
| `exam-confirm.view.js` | Discord screen mapping for exam student confirmation using chunked multi-select menus |
| `reading-assessment.view.js` | Discord screen mapping for reading assessment setup: language, mode, level, scope (Discord-only renderer) |

## Who reads this (generated)
- `attendance-marking.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:108:929851d4`
- `attendance.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:75:291a19c5`
- `exam-confirm.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:164:aedffb2f`
- `reading-assessment.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:192:8b123e56`
- `registration.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:34:61464025`
- `settings.view.js` ← imported by `bot/shared/routes/discord-flow-registry.js:51:aedd147a`

## Never (human)
- Never exceed 25 options in a Discord select menu; chunk any roster over 25 (bot/shared/routes/discord-views/exam-confirm.view.js:11-14)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/routes/discord-views.test.js` (registration.view.js, settings.view.js)
- `tests/attendance/marking-leave-and-staff.test.js` (attendance-marking.view.js)
- `tests/routes/discord-views-attendance-marking.test.js` (attendance-marking.view.js)

## Related (generated)
- docs: `bot/shared/routes/CLAUDE.md`?
