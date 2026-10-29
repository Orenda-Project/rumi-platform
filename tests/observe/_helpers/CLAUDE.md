# _helpers — Fake Supabase client shared by the observe suites

<!-- kg:meta repo=rumi-platform dir=tests/observe/_helpers kg=b147813101c5 gen=707f2bb03308 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `fake-supabase.js` — in-memory query builder; usage notes in its header
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `fake-supabase.js` | Helper: in-memory Supabase query-builder (filters, joins, upsert, count) so observe code runs for real in tests |

## Who reads this (generated)
- (none)

## Never (human)
- Only the database may be faked; observe code must run for real against it (fake-supabase.js:3-4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/observe/CLAUDE.md`?
