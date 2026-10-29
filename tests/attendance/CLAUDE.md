# attendance — Tests for class and staff attendance marking, leave and monthly registers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/attendance kg=16068a63d6e6 gen=1b2ecbb55b74 overflow=7 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `_helpers/attendance-db.js` — in-memory Supabase fake every attendance suite builds on
- `class-register-delivery.test.js` — re-mark replaces a day; whole-month register regenerated
- `role-routing.test.js` — what "attendance" means for a teacher vs a head teacher
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `_helpers/` | → (no door; 1 files: 0 test + 1 support) |
| `marking-leave-and-staff.test.js` | Pins "absent plus leave" marking on text flow, Meta Flow and Slack/Discord modals, with staff marking |
| `review-hardening.test.js` | Pins review fixes: a failed correction keeps the day on file, slash class names, owner-only replace, staff guards |
| `register-delivery-temp-race.test.js` | Pins that two same-named register deliveries at once each send their own school's bytes, no temp-file clash |
| `class-register-delivery.test.js` | Pins re-marking replacing a day, Leave status, and whole-month register regeneration and delivery |
| `role-routing.test.js` | Pins who "attendance" means by role: teacher to their class, head teacher to staff, dated days reopenable |
| `staff-register.test.js` | Pins staff attendance: loadStaffRoster rule, one row per person per day, overwrite on re-mark, leave excused |
| `attendance-dates.test.js` | Pins school-local "today" (ATTENDANCE_TZ) and month bounds on YYYY-MM-DD strings in attendance-dates |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Do not read session_date through new Date().getDate(); it shifts a register column west of UTC (tests/attendance/class-register-generator.test.js:7)
- Do not write register temp files under a shared name; same-named deliveries overwrote each other (tests/attendance/register-delivery-temp-race.test.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/routes/discord-views/CLAUDE.md`? · `bot/shared/routes/slack-views/CLAUDE.md`? · `bot/shared/services/CLAUDE.md`? · `tests/CLAUDE.md`?
