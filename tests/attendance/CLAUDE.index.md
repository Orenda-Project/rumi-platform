# attendance — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/attendance -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `_helpers/` | → (no door; 1 files: 0 test + 1 support) |
| `attendance-dates.test.js` | Pins school-local "today" (ATTENDANCE_TZ) and month bounds on YYYY-MM-DD strings in attendance-dates |
| `attendance-entry.test.js` | Pins the chat door into attendance: dated open, future-day refusal, head-teacher staff route, text-form fallback |
| `class-register-delivery.test.js` | Pins re-marking replacing a day, Leave status, and whole-month register regeneration and delivery |
| `class-register-generator.test.js` | Pins AttendanceGeneratorService keeping Leave distinct and placing sessions on the right day in negative UTC offsets |
| `link-school-script.test.js` | Pins bot/scripts/attendance/link-school.js arg parsing and resolving people by id, number or channel identity |
| `marking-leave-and-staff.test.js` | Pins "absent plus leave" marking on text flow, Meta Flow and Slack/Discord modals, with staff marking |
| `meta-flow-marking.test.js` | Pins the Meta tap-to-mark Flow JSON leave group, completion payload and data-endpoint INIT roster |
| `monthly-register.test.js` | Pins the cumulative monthly register matrix: P/A/Leave cells, totals, weekends, class vs staff rate rules |
| `register-delivery-temp-race.test.js` | Pins that two same-named register deliveries at once each send their own school's bytes, no temp-file clash |
| `register-timezones.test.js` | Re-runs the register suites in child processes under zones either side of UTC to prove no server-TZ dependence |
| `review-hardening.test.js` | Pins review fixes: a failed correction keeps the day on file, slash class names, owner-only replace, staff guards |
| `role-routing.test.js` | Pins who "attendance" means by role: teacher to their class, head teacher to staff, dated days reopenable |
| `staff-register.test.js` | Pins staff attendance: loadStaffRoster rule, one row per person per day, overwrite on re-mark, leave excused |
| `voice-leave.test.js` | Pins voice roll call reading "on leave" as Leave, not absent, with the LLM client stubbed |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/shared/routes/discord-views/CLAUDE.md`? · `bot/shared/routes/slack-views/CLAUDE.md`? · `bot/shared/services/CLAUDE.md`? · `tests/CLAUDE.md`?
