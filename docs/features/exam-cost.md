# 💰 Exam Cost Compass

> What will the certificate *actually* cost — itemised, board by board, two years out — and when is the next registration deadline.

## What it is

A vendor-neutral exam-cost comparison and deadline tracker for parents and private candidates. Cambridge O/A-Level fees in Pakistan more than doubled in 2025–26, and there is no itemised, non-commercial Cambridge-vs-AKU-EB-vs-BISE comparison anywhere — only content marketing with a reason to steer rather than compare. Registration deadlines are worse: they live in three unrelated systems (the British Council SRS portal, AKU-EB's hard-copy forms, per-board BISE portals) with no shared calendar.

Cost Compass answers both in one WhatsApp reply. It is deliberately **not** a generative feature — there is no LLM call anywhere in it. Static, cited data plus arithmetic.

## How it works

1. **A parent messages a command** (or just asks in plain language — see below).
2. **`exam-cost-trigger.js` parses it** — level, subject count, boards, city. A pure module, the same shape as the homework and edit-class triggers.
3. **`exam-cost.service.js` costs it** from `bot/shared/data/exam-fees.json`: per-subject fee × subjects, plus each fixed fee, plus the late-entry surcharge if asked.
4. **Rumi replies** with one plain-text block per board — every line itemised, cheapest 2-year total first, `as_of` and the estimate warning always visible. A board whose fee the dataset doesn't publish is named as such, with its notes, and never priced (see the honesty rules below).
5. **Deadlines** come from `bot/shared/data/exam-deadlines.json`, sorted soonest-first, with anything inside 21 days flagged as closing soon.
6. **Opt-in reminders** land 14 days and 3 days before a deadline, weekends and evenings only.

### Commands

| Send | Get |
|---|---|
| `cost "O Level" 6 cambridge,aku-eb Karachi` | Itemised total per board + 2-year total |
| `cost o-level 6 late` | Same, with the late-entry surcharge added |
| `deadlines cambridge` | Upcoming registration dates, urgency-flagged |
| `deadlines` | The same across every board |
| `remind me cambridge` | Opt in to that board's deadline nudges |
| `stop reminders` | Opt out of every board |

A leading `/` works on all of them. The bare forms are the ones that work on **every** channel — Slack blocks text starting with `/`, the same constraint that gave `/status` its natural-language alternative.

**Natural language also works.** "cambridge fee", "how much does o level cost", "what's the deadline for aku-eb" — a fee question that can't be costed (no level or subject count) gets the usage card rather than a guess; a deadline question routes straight through.

*Why not `feature-keyword-detector.service.js`?* That service does exactly one job — offer a pre-recorded intro **video** with explicit button consent, gated on `FEATURE_VIDEO_URLS`, feature-intro state and a Redis cooldown. It routes nothing. Cost Compass has no intro video and has to answer the question directly, so it uses the established *hot-trigger* mechanism (a pure parse module consulted inline by `text-message.handler.js`) rather than bending the video-consent service into a router.

### How the money is added up

Each fee carries a `per`, and the distinction is the whole point:

| `per` | Meaning | In the 2-year total |
|---|---|---|
| `subject` | Charged per subject entered, every session | × subjects, × 2 sessions |
| `session` | Charged once per exam session | × 2 sessions |
| `candidate` | One-off registration | × 1 |

So a 2-year total is **not** `total × 2` — a naive doubling over-counts one-off registration. `SESSIONS_PER_TWO_YEARS = 2`.

A board that doesn't offer the requested level is reported as such, never priced at zero. A city with no listed centre for a board gets a warning, and does not change the arithmetic.

### Language

Replies use the 6–8 structural labels in the teacher's language setting (English and Urdu today, English fallback for anything else). Numbers, currency codes, board names, level names and city names are **never** translated — they are exactly what the parent has to type into a portal.

## Where the data lives

```
bot/shared/data/exam-fees.json       # boards, per-subject fees, fixed fees, late surcharge, cities
bot/shared/data/exam-deadlines.json  # board, session, stage, date, fee_impact, source, confidence
```

Point `EXAM_COST_DATA_DIR` at another directory (containing both files, same schema) to run a different dataset without editing the shipped ones — another country's boards, say. Precedence is `useDataDir(dir)` → `EXAM_COST_DATA_DIR` → the shipped default. The test suites use `useDataDir()` to pin the arithmetic to a frozen fixture at `tests/exam-cost/fixtures/`, so refreshing the real data can never turn the maths tests red for the wrong reason; `tests/exam-cost/exam-cost-live-data.test.js` is the one suite that deliberately reads the live files.

Both datasets carry a top-level `as_of`. The literal string `FIXTURE` means placeholder data, and every reply then says so out loud; a real `YYYY-MM-DD` turns that flagging off.

Fee schedules change every exam session and are not published cleanly enough to scrape, so this needs a real **manual update cadence**, not a one-time load. A stale cost tool loses a parent's trust faster than no tool at all.

## Honesty rules — what happens when the data has holes

The real Pakistani data is **full** of holes, and they are not going away: British Council publishes private-candidate fees only inside a login-gated portal, three BISE boards publish nothing machine-readable (one only in a non-Unicode Urdu PDF), and **AKU-EB does not charge per subject at all** — it charges one flat fee per subject *group*, so no single number can populate a per-subject schema without producing a wrong total.

So the service is built around five rules, each with tests:

1. **A `null` per-subject fee is never zero.** The board comes back `supported: false`, `reason: 'fee_not_published'`, and the reply says so — with a ~200-character excerpt of the board's own `notes`, which is exactly where AKU-EB's real group prices live. Notes are also surfaced when a board doesn't list the level at all (`reason: 'level_not_offered'`), because a parent who asked about AKU-EB still deserves to learn how AKU-EB prices.

   That excerpt is **money-first, not head-first** (`notesExcerpt()`): it finds the first real PKR amount, rewinds to the start of its clause, and takes the window from there, marking it with a leading `…`. AKU-EB forced this — its confirmed group prices sit about 1,100 characters into the note, behind a paragraph of provenance, so a head-trim would have handed the parent the sourcing story and none of the prices. With no amount anywhere in a note, it falls back to the head.
2. **Only boards with a real number are ranked or compared.** Uncostable boards keep dataset order and print no total.
3. **When no board has a number**, the reply says `no honest total to give` and points at the web calculator — <https://oyekamal.github.io/homeschooling-pakistan/cost/> — instead of implying an answer.
4. **A `null` fixed-fee or late-surcharge amount is skipped**, and an unpublished late surcharge becomes a stated caveat (`⚠️ Late-entry surcharge amount not published`) rather than a silent `+0`.
5. **A deadline with a `null` date is dropped**, never rendered as `Invalid Date`; a row whose `confidence` is `estimated` is tagged `(estimated)` on its face. `fee_impact` is a number in the fixture and a prose sentence in the real data — whichever arrived is rendered, and neither is invented.

The estimate/`as_of` footer (and the calculator link) is reserved out of the 1500-char budget, so it is never the first thing a clamp drops.

Level labels come from the dataset, not from code: the service understands `SSC-I`, `SSC-II`, `HSSC-II`, `SSC (Matric)` and `HSSC (Intermediate)` because the boards list them, plus shorthand (`o-level`, `matric`, `inter`, `ssc ii`). A data refresh that renames a level needs no code change.

## Reminders

`deadline_reminder_optins (phone, board_id, created_at)` holds the opt-in list, keyed on the raw phone identifier rather than `users.id` — the parent asking what Cambridge costs is usually not a registered teacher and may have no `users` row at all, the same reason quiz answering runs before user creation.

`bot/workers/exam-deadline-reminder.worker.js` sends them. It follows the Morning Brief's rule: **it decides what is due at run time**, recomputing every day count from the current clock, so a cron that fires late, twice, or in the wrong timezone can never send "your deadline is in 14 days" for a date that has already passed.

Delivery window: weekends any hour, weekdays 17:00–21:59 in `BRIEF_TZ` — the timing rule from the research (mid-workday nudges fail for low-resource caregivers). A skipped run drops nothing; the next run recomputes the same due deadlines.

### Running it

The worker is wired as a queue job — `case 'exam_deadline_reminder'` in `bot/workers/sqs-worker.js` — and runs standalone:

```bash
node bot/workers/exam-deadline-reminder.worker.js
```

**TODO (not done in this change):** no scheduler entry ships yet. Add a daily cron/Railway-Cron line the way `orchestrator`-style entries are added for `brief.worker.js`, or enqueue an `exam_deadline_reminder` job from an existing scheduled tick. Until then reminders only fire when the worker or the job is invoked by hand. This was left out deliberately rather than half-wired: the send logic, the opt-in table and the commands are complete and tested, and adding a scheduler is a one-line deployment change once someone decides where it should live.

**TODO (WhatsApp 24-hour window):** a reminder is free-form text, which Meta rejects (error `131047`) for a parent who has not messaged Rumi in the last 24 hours — see `pre-merge-checklist` Class G. The worker checks the boolean send result and counts a rejection as a real failure rather than reporting a phantom success, but the correct fix is a Meta-approved **UTILITY** template. On the Baileys sandbox driver the window does not apply.

## Enable it

_Always on_ — core. There is **no API key and no feature flag**: the datasets ship in the repo, so there is nothing to be present or absent. Rumi's `feature-availability.js` `FEATURES` list maps a feature to the env key that switches it on; a feature with no key does not belong in it, which is exactly how Registration and Attendance are treated. `EXAM_COST_ENABLED` was deliberately **not** added — a flag that can only ever be "on" is noise a cloner has to reason about.

The reminder table comes from the normal DB bootstrap (`npm run bootstrap:db`).

## Customize

- **New board** → one entry in `exam-fees.json` (`id`, `name`, `levels`, `per_subject_fee`, `fixed_fees`, `late_entry_surcharge`, `cities`, `source`) and, if it should be reachable by nickname, an alias in `BOARD_ALIASES` in `exam-cost.service.js`. No code change otherwise — new **levels** need no alias at all if a parent will type them exactly as the dataset spells them.
- **A whole different dataset** → `EXAM_COST_DATA_DIR`.
- **New language** → add a `LABELS` entry.
- **How much of a board's notes reaches the parent** → `NOTES_CHARS` (200).
- **Different urgency or reminder leads** → `URGENT_WINDOW_DAYS` / `REMINDER_LEAD_DAYS`.
- **Different budgeting horizon** → `SESSIONS_PER_TWO_YEARS`.

Tests live at `tests/exam-cost/`.
