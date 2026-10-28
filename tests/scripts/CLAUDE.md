# scripts — Tests for operator scripts: Morning Brief send/worker and Discord registration

<!-- kg:meta repo=rumi-platform dir=tests/scripts kg=9d734af19f32 gen=df8d43ddb276 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `brief-send.test.js` — brief delivery ordering and idempotency
- `brief-worker.test.js` — cron entry decisions
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `discord-register-commands.test.js` | Pins discord-register-commands: the one-time REST registration of 9 slash commands, REST client mocked |
| `CLAUDE.md` | (unmapped) |
| `brief-worker.test.js` | Pins brief.worker cron entry: daily/weekly/off-day by time zone, injected renderer and sender |
| `brief-send.test.js` | Pins send-brief: ordering, idempotency, dry-run and failure isolation of Morning Brief delivery via an injected router |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/setup/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/scripts/CLAUDE.md`?
