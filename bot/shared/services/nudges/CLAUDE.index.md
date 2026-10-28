# nudges — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/nudges -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `address.js` | Picks which channel address a scheduled nudge goes to and when the teacher last wrote, via user_channels |
| `flags.js` | One shared reading of a nudge on/off env flag, so boot arming and per-tick checks agree |
| `kinds.js` | Ordered list of nudge kinds shared by the in-process sweep and the one-shot cron worker |
| `local-time.js` | Deployment-local clock for nudges: one per teacher per local day, with quiet hours, from an IANA zone |
| `re-engage.kind.js` | Nudge kind that checks in with a teacher who went quiet; builds the cohort from users and user_channels |
| `teacher-nudges.store.js` | Sole reader and writer of teacher_nudges: idempotent booking, claiming, outcome records; used by sweeper |
| `teacher-nudges.sweeper.js` | Periodic sweep (teacher_nudges feature) reclaiming stuck rows and handing due nudges to kinds; run by workers |

## Who reads this (all, generated)
- `address.js` ← imported by `bot/shared/services/nudges/re-engage.kind.js:41:90e77a99`
- `flags.js` ← imported by `bot/shared/services/nudges/teacher-nudges.sweeper.js:42:f40e7404`
- `kinds.js` ← imported by `bot/workers/sqs-worker.js:1182:63477196` · `bot/workers/teacher-nudges.worker.js:20:63477196`
- `local-time.js` ← imported by `bot/shared/services/nudges/re-engage.kind.js:42:b70d9014`
- `re-engage.kind.js` ← imported by `bot/shared/services/nudges/kinds.js:13:17cf28ff`
- `teacher-nudges.store.js` ← imported by `bot/shared/services/nudges/re-engage.kind.js:40:a96e1f66` · `bot/shared/services/nudges/teacher-nudges.sweeper.js:41:a96e1f66`
- `teacher-nudges.sweeper.js` ← imported by `bot/workers/sqs-worker.js:1176:8ceabada` · `bot/workers/teacher-nudges.worker.js:19:8ceabada`
- env `ATTENDANCE_TZ` read at `bot/shared/services/nudges/local-time.js:40:87de7122`
- env `TEACHER_NUDGES_LOOKBACK_DAYS` read at `bot/shared/services/nudges/re-engage.kind.js:64:993a96ca`
- env `TEACHER_NUDGES_MAX_PER_TICK` read at `bot/shared/services/nudges/teacher-nudges.sweeper.js:73:42a92770`
- env `TEACHER_NUDGES_QUIET_HOURS` read at `bot/shared/services/nudges/local-time.js:92:3e37c2d2`
- env `TEACHER_NUDGES_QUIET_MINUTES` read at `bot/shared/services/nudges/re-engage.kind.js:59:41752ae7`
- env `TEACHER_NUDGES_TZ` read at `bot/shared/services/nudges/local-time.js:40:87de7122`

## Tests (all, generated)
- `flags.js` ← `tests/nudges/flags.test.js` · `tests/nudges/teacher-nudges-worker-wiring.test.js`
- `local-time.js` ← `tests/nudges/local-time.test.js`
- `re-engage.kind.js` ← `tests/nudges/re-engage.kind.test.js`?
- `teacher-nudges.store.js` ← `tests/nudges/teacher-nudges.store.test.js`
- `teacher-nudges.sweeper.js` ← `tests/nudges/teacher-nudges.sweeper.test.js`

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/nudges/CLAUDE.index.md`? · `bot/shared/services/nudges/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/teacher-nudges.md`? · `tests/nudges/CLAUDE.md`?
