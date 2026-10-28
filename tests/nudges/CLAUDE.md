# nudges — Tests for proactive teacher nudges: store, sweeper, kinds, flags, wiring

<!-- kg:meta repo=rumi-platform dir=tests/nudges kg=63e13bcf5908 gen=98479a873c97 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `teacher-nudges.sweeper.test.js` — the periodic tick, kill switches and claim-then-send
- `teacher-nudges.store.test.js` — idempotent booking and claim on teacher_nudges
- `re-engage.kind.test.js` — end-to-end re_engage example over fake Supabase
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `teacher-nudges-worker-wiring.test.js` | Drives sqs-worker startWorker with fake timers: nudge sweep only with flag on, first at 90s, then every 5 min |
| `flags.test.js` | Pins nudges/flags.flagOn: one call-time reading of the teacher-nudge switches, shared by sweeper and worker boot |
| `teacher-nudges.store.test.js` | Pins teacher-nudges.store (sole writer of teacher_nudges): idempotent book per user-day-kind and atomic claim |
| `teacher-nudges.sweeper.test.js` | Pins teacher-nudges.sweeper tick: kill switches, kind registration, claim-then-send over a stateful fake store |
| `CLAUDE.md` | (unmapped) |
| `local-time.test.js` | Pins nudges/local-time: deployment calendar day and quiet hours from TEACHER_NUDGES_TZ via Intl, DST-safe |
| `re-engage.kind.test.js` | Drives the re_engage nudge (teacher quiet 21h) end to end through real sweeper, store and address over fake Supabase |
| `reply-identifier.test.js` | Pins bot-helpers stamping reply_identifier on user_channels so later nudges deliver back to the same address |
| `address-for-user.test.js` | Pins nudges/address.addressForUser: picks a teacher's most recent live channel with prefix, bare phone for WhatsApp |
| `teacher-nudges-migration.test.js` | Shape-checks the teacher_nudges SQL migration: UNIQUE(user,date,kind), status enum, additive and IF NOT EXISTS only |

## Who reads this (generated)
- (none)

## Never (human)
- teacher_nudges migration must stay additive and IF NOT EXISTS (teacher-nudges-migration.test.js:73)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/database/CLAUDE.index.md`? · `bot/shared/services/nudges/CLAUDE.index.md`? · `bot/shared/services/nudges/CLAUDE.md`? · `bot/workers/CLAUDE.index.md`? · `bot/workers/CLAUDE.md`? · `tests/CLAUDE.index.md`? (+2)
