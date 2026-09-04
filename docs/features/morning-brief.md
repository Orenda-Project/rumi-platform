# 🌅 Morning Brief

[![Watch the film — Every morning.](../../brief/morning_brief_film_poster.png)](https://github.com/Orenda-Project/rumi-platform/releases/download/v2.2.0/Morning_Brief_Every_Morning.mp4)

*An 81-second film (click to play).*

![The sample brief — registration by school](../../brief/sample/daily/01_registration.png)

> Every morning, one thread that answers five plain questions about your programme, each with a number
> behind it — on WhatsApp, Slack or Discord, wherever your team already is.

## What it is

Most programmes are rich in data and poor in shared reality: the numbers sit in a database, behind a login,
inside a quarterly report, and by the time the report lands the quarter is gone. The Morning Brief is the
answer. Every morning your team wakes up to a fixed set of chart panels with a plain-language caption each:
who is on the platform and who actually used it · are teachers teaching with the lesson plans · is the
teaching improving · are the coaches showing up against their target · where should attention go next.

**Same charts, same cohort, same window, every morning.** The point is drift detection, not narrative — a
team scrolls back eight briefs and sees what changed. On Fridays the same thread rolls the week up.

## How it works

1. **A code-level calendar decides the day.** A morning brief covers the previous *working* day, so Monday's
   brief is about Friday; Friday's brief is the weekly, last Friday to Thursday. The guard lives in code, so a
   mis-set cron cannot produce a brief on the wrong day.
2. **The live schema decides the panels.** `python3 brief/cli.py check` reads `information_schema` once and
   switches on exactly the panels this database can draw — reading, quizzes, attendance, exam checks, and
   (in forks that record them) classroom observations. Nothing assumes a table exists.
3. **One read-only pull, then the panels.** Every metric is a definition in `brief/pull.py`, in prose in
   [`brief/README.md`](../../brief/README.md) — the cohort, the event-based "active", the timezone boundary,
   the comparison window behind every delta chip.
4. **Delivery through the bot's own channel drivers.** The sender posts the cover with the lead text, each
   panel with its caption, then a one-line closer — to every target in `BRIEF_RECIPIENTS`. It records what it
   sent, so a re-run never double-posts.
5. **A live page.** The dashboard's `/observability/brief` shows the latest daily and weekly; `/screen?p=N`
   is a single panel that refreshes itself, for an office wall.

## What the team experiences

At 09:00 a thread lands in the team channel: a navy cover naming the programme and the day, then nine
panels — registration by school with delta chips, the lesson-plan and coaching trends as smooth lines, the
score trend and its weakest area, reading by grade, everything else teachers used, every observer against the
target, and finally every school worst-first in a red-to-green ramp. The closer is one line: the day's tally
and a link to the live page.

## Enable it

```bash
pip install matplotlib numpy 'psycopg[binary]'
```

| Variable | What |
|---|---|
| `BRIEF_DATABASE_URL` | a **read-only** Postgres URL (falls back to `DATABASE_URL`) |
| `BRIEF_RECIPIENTS` | comma-separated targets: a WhatsApp number, `…@g.us` group, `slack:channel:C…`, `discord:channel:…` |
| `BRIEF_TZ` | the IANA zone the programme lives in |
| `BRIEF_PROGRAMME_NAME` · `BRIEF_GROUP_BY` · `BRIEF_REGION` · `BRIEF_ORGANIZATION` | the cover title, the organising unit, and optional cohort filters |

Then `rumi brief` (a dry run), `rumi brief --send`, and a daily cron on `node bot/workers/brief.worker.js`.
`rumi status` lists the feature as on once `BRIEF_RECIPIENTS` is set. Pilot to yourself first; a recurring
send to a team channel is a promise.

## Customize

Brand name, programme name and a landmark cover photo are environment variables; cadence and targets too.
To add a panel: a tagged query in `pull.py`, a drawing function in `render.py`, a caption in `compose.py`,
and a schema gate in `schema.py`. The full definitions, the manifest contract and the tests are in
[`brief/README.md`](../../brief/README.md); the agent skill is
[`morning-brief`](../../.claude/skills/morning-brief/SKILL.md).
