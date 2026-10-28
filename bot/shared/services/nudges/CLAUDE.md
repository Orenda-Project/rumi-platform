# nudges — Scheduled teacher nudges: kinds, sweeper, store and the local-time rules
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/nudges kg=4fb9ba24dc62 gen=9ea9fddddd3c overflow=11 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `teacher-nudges.sweeper.js` — the tick: reclaim, claim due rows, hand to kinds
- `teacher-nudges.store.js` — only module touching teacher_nudges
- `kinds.js` — register a new kind here
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `teacher-nudges.store.js` | Sole reader and writer of teacher_nudges: idempotent booking, claiming, outcome records; used by sweeper |
| `flags.js` | One shared reading of a nudge on/off env flag, so boot arming and per-tick checks agree |
| `kinds.js` | Ordered list of nudge kinds shared by the in-process sweep and the one-shot cron worker |
| `teacher-nudges.sweeper.js` | Periodic sweep (teacher_nudges feature) reclaiming stuck rows and handing due nudges to kinds; run by workers |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| … | 3 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `kinds.js` ← imported by `bot/workers/sqs-worker.js:1182:63477196` · `bot/workers/teacher-nudges.worker.js:20:63477196`
- `teacher-nudges.store.js` ← imported by `bot/shared/services/nudges/re-engage.kind.js:40:a96e1f66` · `bot/shared/services/nudges/teacher-nudges.sweeper.js:41:a96e1f66`
- `teacher-nudges.sweeper.js` ← imported by `bot/workers/sqs-worker.js:1176:8ceabada` · `bot/workers/teacher-nudges.worker.js:19:8ceabada`
- `address.js` ← imported by `bot/shared/services/nudges/re-engage.kind.js:41:90e77a99`
- … 4 more → `CLAUDE.index.md`

## Never (human)
- Only the store reads or writes teacher_nudges; booking is idempotent and sends are claimed (bot/shared/services/nudges/teacher-nudges.store.js:5-16)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/nudges/flags.test.js` (flags.js)
- `tests/nudges/local-time.test.js` (local-time.js)
- … 4 more → `CLAUDE.index.md`

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/nudges/CLAUDE.index.md`? · `bot/shared/services/nudges/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? (+2)
