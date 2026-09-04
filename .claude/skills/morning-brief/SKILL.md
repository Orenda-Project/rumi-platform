---
name: morning-brief
description: Set up, run, read or extend the Morning Brief — the recurring programme-health thread (registration, lesson plans, coaching, scores, reading, observations, every school worst-first) delivered every morning on WhatsApp/Slack/Discord with a live dashboard page. Use for "send the team a daily brief", "the weekly numbers", "why does the brief say X", "add a panel", "schedule the brief". NOT for ad-hoc analysis (database-analysis).
---

# Morning Brief

> **Up:** [.claude/CLAUDE.md](../../CLAUDE.md) · runnable code in [`brief/`](../../../brief/) · feature page
> [docs/features/morning-brief.md](../../../docs/features/morning-brief.md)

**One line:** the same charts, same cohort, same window, every morning — so what changed is visible at a
glance. Drift detection, not narrative.

## The pipeline (and where each concern lives)

| Step | File | The rule it carries |
|---|---|---|
| which day | `brief/brief/calendar.py` | a morning brief covers the previous WORKING day; the guard is on the fire day, in code, never only in the cron |
| which panels | `brief/brief/schema.py` | read `information_schema` once; a panel switches on only if its table/columns exist |
| the numbers | `brief/brief/pull.py` | every metric is a tagged SQL query; the prose twin is `brief/README.md` § Definitions — change both in one pass |
| the panels | `brief/brief/render.py` | the panel grammar below; matplotlib + numpy only |
| the words | `brief/brief/compose.py` | plain language, statements not questions, honest deltas |
| the contract | `brief/brief/publish.py` | `out/latest/<kind>/manifest.json` + a storage mirror (best-effort) |
| delivery | `bot/scripts/brief/send-brief.js` | through the messaging router, per target, idempotent (`sent.json`) |
| schedule | `bot/workers/brief.worker.js` · `rumi brief` | one-shot for any cron; the human front door |
| live page | `dashboard/routes/brief.routes.js` | `/observability/brief` · `/screen?p=N` (wall display) |

## The panel grammar (binding when you add or change a panel)

1. **A delta chip on every headline**, compared over the shifted window and named (`vs yesterday`, `vs the
   7 days before`). Counts: relative above a base of 20, absolute below. Percentages: points.
2. **One organising unit breaks down every panel** (`BRIEF_GROUP_BY`). Bold line = the whole programme;
   a thin dotted line per unit only when there are few units. "No unit recorded" is shown, never dropped.
3. **Where-to-point-attention lists EVERY unit, worst first.** A top-N list is never a substitute.
4. **Observations are target-and-stars for every observer**, zeros included, grouped by unit.
5. **Honesty rails.** Calendar x-axes (not days-with-data); excluded rows stated on the panel; rates divide
   by working days and the panel states the arithmetic; the headline equals what the bars show.
6. **Daily and weekly from one code path** (`kind=`); a panel is not done on one variant.
7. **Every line is a PCHIP curve with the real points marked** (`brief/brief/smooth.py`) — never a spline,
   which overshoots and invents dips.
8. **Open the PNG.** Every layout defect that ever shipped was caught by an eye, none by a test. Run
   `python3 brief/cli.py sample` and look at `brief/sample/*/` before calling a change done — and once
   against real data, because a 237-school list breaks layouts a 42-school sample never will.

## Common asks

- **"Why does the brief say N?"** Find the tag in `pull.py` (`/* lp.window */` …), read its SQL, and
  re-run it against the database with the same `%(lo)s`/`%(hi)s`/`%(tz)s`. The definitions in
  `brief/README.md` are written to be executable prose.
- **"Send it to our channel."** Add the target to `BRIEF_RECIPIENTS` (see the README's target table),
  `rumi brief --send --dry-run` first, then `rumi brief --send`. A recurring send to a team is a promise —
  pilot to one person first.
- **"Add a panel."** Tagged query in `pull.py` (offline tests route canned rows by tag — see
  `brief/tests/fakes.py`), draw in `render.py`, caption in `compose.py`, gate in `schema.py`, add the id to
  `render_all`'s order, and render the sample.
- **"It didn't arrive."** A silent cron is the default failure mode. Check in order: did the worker fire
  (its log says daily / weekly / off-day) → did the render succeed (`out/latest/<kind>/manifest.json`
  timestamp) → `sent.json` beside it (was this target already recorded for this day?) → the driver's own
  log for that channel. Verify the whole path, not one layer.
- **"Change the cadence."** `BRIEF_DAILY_DOWS` / `BRIEF_WEEKLY_DOW` on the worker AND the cron; the code
  guard is the guarantee, the cron is the trigger.

## Tests

```bash
python3 -m unittest discover -s brief/tests -t brief -p 'test_*.py'    # offline, fakes only
npm test -- brief-send brief-worker brief-service brief-routes team-channel-targets
```

## Related skills

[database-analysis](../database-analysis/SKILL.md) (ad-hoc queries, the read-only role) ·
[coaching](../coaching/SKILL.md) (where `analysis_data` comes from) ·
[reading-assessment](../reading-assessment/SKILL.md) · [customizing](../customizing/SKILL.md)
