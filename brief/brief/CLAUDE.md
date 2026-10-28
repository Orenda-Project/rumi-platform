# brief — Python package behind the brief: calendar, schema, pull, render, publish
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=brief/brief kg=29adf35a8c35 gen=6265af435f10 overflow=15 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `pull.py` — metric SQL (cohort, active, lesson plans, coaching)
- `render.py` — panel drawing with matplotlib
- `calendar.py` — which day a brief covers and the fire-day guard
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 1 files) |
| `sample/` | → (no door; 2 files) |
| `pull.py` | Runs the metric SQL (cohort, active teachers, lesson plans, coaching, reading) against the schema |
| `calendar.py` | Decides which working day a brief covers and whether it may fire (day guard), daily vs weekly windows |
| `compose.py` | Templates the captions and delta chips beside each panel from metrics; called by cli.py and tests |
| `config.py` | Reads every Morning Brief setting (timezone, group-by unit, region, firing days) from env into a Config |
| `schema.py` | Reads the live information_schema into Features so panels switch on only where tables/columns exist |
| `publish.py` | Writes the latest/archive manifest.json that channel drivers deliver and mirrors it to Supabase Storage |
| … | 5 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `calendar.py` ← imported by `brief/cli.py:25:c1a4bca2` · `brief/brief/pull.py:19:8f7a5bd7` (+1)
- `config.py` ← imported by `brief/cli.py:27:44453c38` · `brief/brief/pull.py:20:d1ecf6c0` (+1)
- `compose.py` ← imported by `brief/cli.py:26:da53418b` · `brief/brief/render.py:22:d11a1a93`
- `pull.py` ← imported by `brief/cli.py:93:4315e004` · `brief/brief/render.py:24:a9b50ef6`
- … 5 more → `CLAUDE.index.md`

## Never (human)
- Never move the off-day guard out of code into cron only; it lives in calendar.py (calendar.py:11)
- Never make publish.mirror raise on storage failure; it is best-effort so the brief still goes out (publish.py:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `brief/tests/__init__.py`? (__init__.py)
- `brief/tests/test_calendar.py`? (calendar.py)
- … 5 more → `CLAUDE.index.md`

## Related (generated)
- skills: `morning-brief`?
- docs: `brief/CLAUDE.md`? · `brief/README.md`? · `brief/brief/CLAUDE.index.md`? · `brief/brief/CLAUDE.md`? · `brief/tests/CLAUDE.md`?
