# tests — Offline unittest suite for the brief (fake DB, synthetic sample)

<!-- kg:meta repo=rumi-platform dir=brief/tests kg=d7a1ff020db6 gen=f54b29a024a4 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `fakes.py` — FakeConn routes canned rows by each query's /* tag */
- `test_pull.py` — pins the metric SQL definitions
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `test_calendar.py` | Pins calendar rules: Monday covers Friday, evening covers same day, weekly window, day guard |
| `__init__.py` | Empty package marker for brief tests |
| `test_compose.py` | Pins caption wording and honest deltas (relative above twenty, absolute below) in compose |
| `test_publish.py` | Pins the manifest contract fields and that the storage mirror is best-effort in publish |
| `test_pull.py` | Pins metric SQL definitions: cohort filter, event-based active, day boundary, delta windows, gated panels |
| `test_render.py` | Checks every panel renders from the synthetic sample for both kinds at the expected PNG size |
| `test_smooth.py` | Pins smooth.smooth_xy: passes through real points and never leaves its neighbours' range |
| `fakes.py` | Fake DB-API connection routing canned rows by the leading /* tag */ comment of each query |
| `test_schema.py` | Pins that schema.detect switches panels on from the live schema, never assumed tables |

## Who reads this (generated)
- (none)

## Never (human)
- Never rely on an untagged query in tests; unknown tags return empty rows on purpose (fakes.py:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `morning-brief`?
- docs: `brief/CLAUDE.md`? · `brief/brief/CLAUDE.md`? · `portal/src/components/ui/CLAUDE.md`?
