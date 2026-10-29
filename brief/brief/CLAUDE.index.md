# brief — full index (generated)

<!-- kg:index repo=rumi-platform dir=brief/brief -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 1 files) |
| `sample/` | → (no door; 2 files) |
| `__init__.py` | Package header for the Morning Brief; documents the calendar, schema, pull, render, compose, publish pipeline |
| `calendar.py` | Decides which working day a brief covers and whether it may fire (day guard), daily vs weekly windows |
| `compose.py` | Templates the captions and delta chips beside each panel from metrics; called by cli.py and tests |
| `config.py` | Reads every Morning Brief setting (timezone, group-by unit, region, firing days) from env into a Config |
| `publish.py` | Writes the latest/archive manifest.json that channel drivers deliver and mirrors it to Supabase Storage |
| `pull.py` | Runs the metric SQL (cohort, active teachers, lesson plans, coaching, reading) against the schema |
| `render.py` | Draws every brief panel PNG with matplotlib in one palette: cover, school-wise lists, trends |
| `schema.py` | Reads the live information_schema into Features so panels switch on only where tables/columns exist |
| `smooth.py` | Monotone cubic (PCHIP) smoothing for trend lines so curves never overshoot real points |

## Who reads this (all, generated)
- `calendar.py` ← imported by `brief/cli.py:25:c1a4bca2` · `brief/brief/pull.py:19:8f7a5bd7` · `brief/brief/sample/make_sample.py:12:4fc582ed`
- `compose.py` ← imported by `brief/cli.py:26:da53418b` · `brief/brief/render.py:22:d11a1a93`
- `config.py` ← imported by `brief/cli.py:27:44453c38` · `brief/brief/pull.py:20:d1ecf6c0` · `brief/brief/render.py:23:b7a6d8c9`
- `publish.py` ← imported by `brief/cli.py:26:da53418b`
- `pull.py` ← imported by `brief/cli.py:93:4315e004` · `brief/brief/render.py:24:a9b50ef6`
- `render.py` ← imported by `brief/cli.py:26:da53418b`
- `schema.py` ← imported by `brief/cli.py:26:da53418b` · `brief/brief/pull.py:21:49083a82`
- `smooth.py` ← imported by `brief/brief/render.py:22:d11a1a93`
- env `BRIEF_COVER_BG` read at `brief/brief/render.py:165:751ca696`
- env `BRIEF_TODAY` read at `brief/brief/calendar.py:59:72c6d595`

## Tests (all, generated)
- `__init__.py` ← `brief/tests/__init__.py`?
- `calendar.py` ← `brief/tests/test_calendar.py`?
- `compose.py` ← `brief/tests/test_compose.py`?
- `publish.py` ← `brief/tests/test_publish.py`?
- `pull.py` ← `brief/tests/test_pull.py`?
- `render.py` ← `brief/tests/test_render.py`?
- `smooth.py` ← `brief/tests/test_smooth.py`?

## Related (all, generated)
- skills: `morning-brief`?
- docs: `brief/CLAUDE.md`? · `brief/README.md`?
