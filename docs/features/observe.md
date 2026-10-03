# 🔭 Observe — the coach's assistant

> For the people who visit classrooms to coach teachers. Rumi scores the lesson, scripts the feedback
> conversation, then listens to that conversation and coaches the coach — while the teacher only ever receives
> something kind and useful. And it keeps the coach organised: who is due, what is overdue, what is unfinished.

## In programme terms

**The coach's assistant: observe, debrief, follow up, and keep support separate from scoring.**

Most school systems already employ people whose job is to coach teachers: mentors, head teachers, cluster coordinators and education officers. Their visits are often irregular and leave no record. This feature gives any of them the coaching cycle the evidence describes: observe, debrief, agree one commitment, follow up [WB-7steps; WB-1to1].
1. **Observe.** The coach records the lesson, and Rumi drafts ratings on the World Bank's public Teach framework, each tied to a moment in the lesson. The coach edits the ratings, and the coach's version is the one used.
2. **Debrief.** A six-step debrief guide covers praise with evidence, one question, one improvement and the teacher's own commitment. Rumi then listens to the recorded debrief and coaches the coach.
3. **Report.** The teacher receives a warm report with no score, so support stays separate from evaluation.
4. **Follow up.** Waiting work, planned visits and overdue follow-ups are all tracked.
5. **Did the lesson follow its plan? (Section B).** When the lesson was taught from a plan, Rumi checks the recording against it move by move, the coach confirms or corrects each verdict, and the teacher hears what went as planned. See [Section B](#section-b--did-the-lesson-follow-its-plan).

**Where it sits in a structured-pedagogy programme:** teacher guide → **delivery** (Section B) → **coaching** → assessment → **M&E** (visit records, coach-reviewed ratings, coach-reviewed plan fidelity).



### Honest limits

- **What has been checked.** Only the safety rules are tested: no score reaches the teacher, and harmful debriefs are caught. The quality of the AI's suggestions is not validated. In one run, an "area for growth" misread praise as blame.
- **Observer reliability.** Coaches still need training and reliability checks. The AI draft does not replace them.
- **Language.** English only.
- **Section B (plan fidelity).** Only plans Rumi made for the teacher can be linked to an observation (no upload or paste in the coach's flow yet). The measurement's own limits apply: see [lesson-plan fidelity, Honest limits](lesson-plan-fidelity.md#honest-limits).
- **Portal sign-in.** Coaches who use only the owned messenger cannot sign in to the portal yet.
- **Open should-fix.** A re-sent invite keeps its old reminder counters.

### Sources

- [WB-1to1] Wilichowski, T., & Popova, A., 2021, *Structuring Effective 1-1 Support: Technical Guidance Note* (Coach series), World Bank. https://openknowledge.worldbank.org/entities/publication/e8872cc5-2712-5aa9-ac2e-5f40f8984e4c/full ; blog summary: https://blogs.worldbank.org/en/education/8-tips-structure-effective-one-one-support-systems-teachers
- [WB-7steps] Wilichowski, T., & Arenge, G., 2021, "7 steps to facilitate effective one-to-one support for teachers", World Bank blog. https://blogs.worldbank.org/education/7-steps-facilitate-effective-one-one-support-teachers
- [Hawe04] Hawe, P., Shiell, A., & Riley, T., 2004, "Complex interventions: how 'out of control' can a randomised controlled trial be?", *BMJ* 328:1561–1563. https://doi.org/10.1136/bmj.328.7455.1561
- [FRAME19] Wiltsey Stirman, S., Baumann, A. A., & Miller, C. J., 2019, "The FRAME: an expanded framework for reporting adaptations and modifications to evidence-based interventions", *Implementation Science* 14:58. https://doi.org/10.1186/s13012-019-0898-y
- [Piper-Dubeck24] Piper, B., & Dubeck, M., 2024, "Responding to the learning crisis: Structured pedagogy in sub-Saharan Africa", *International Journal of Educational Development* 109:103095. https://doi.org/10.1016/j.ijedudev.2024.103095

## What it is

Most school systems already employ people whose job is to coach teachers — mentors, head teachers, cluster
coordinators, education officers. Their visits are inconsistent and leave no record. `/observe` gives each of
them an assistant that does the paperwork and makes every visit a better coaching conversation:

1. **The lesson.** The coach records the lesson on their phone and sends it. Rumi transcribes it and rates it
   against an observation framework (TEACH by default), indicator by indicator, each rating tied to a real
   moment from the lesson.
2. **The coach decides.** The ratings arrive pre-filled, one domain per message. The coach replies `ok`, or the
   indicator number and a new rating (`2 5`). The AI did the first pass; the human owns the judgement. Both
   versions are kept — the AI's first pass (v1) and the coach's (v2) — so what coaches change is on record.
3. **The conversation.** Rumi writes a six-step guide for the feedback conversation with the teacher: open with
   intent, praise with evidence, one question then silence, one thing to improve, the teacher's own if–then
   commitment, agree when to look again.
4. **The coach is coached.** The coach records that conversation and sends it. Rumi listens and replies with two
   things the coach did well — quoting their own words — and one thing to try next time. Never a score. If the
   coach belittled the teacher, there is no praise at all: a **harm gate** in code (not just in the prompt)
   names what happened honestly instead.
5. **The teacher's report.** The coach previews the teacher's report, then sends it. It is warm, names real
   moments, echoes the teacher's own commitment — and carries no number and none of the coach's private
   feedback (a **trust firewall** checked in code before anything is sent).
6. **Organised.** `/observe` lists what is waiting (ratings to check, debriefs to do, reports to send) oldest
   first, plans visits ("My schedule", overdue flagged, cleared automatically once the lesson is recorded), and
   a coach's view in the teacher portal shows the same picture.

It works the same way on every channel Rumi runs on — WhatsApp (Meta or the sandbox driver), Matrix, Slack and
Discord. Menus are native lists where the channel has them and numbered text replies elsewhere; the rating form
is a conversation everywhere, and an editable WhatsApp Flow on Meta when you publish one.

## Turn it on

| Variable | What |
|---|---|
| `LP_FIDELITY_ENABLED` | `true` (with Observe on) adds **Section B — did the lesson follow its plan?** to observations. Off, observations have no Section B and nothing asks about plans |
| `OBSERVE_ENABLED` | `true` turns `/observe` on (the console switch `RUMI_FEATURE_OBSERVE=off` pauses it). Off, everything behaves exactly as before. Set it on the **dashboard** service too: the portal's coach view reads its own environment and is off without it. |
| `OBSERVE_FRAMEWORK` | `teach` (default — the public TEACH classroom observation tool), `hots`, or `mewaka` |
| `OBSERVE_LEADER_ROLES` | who may use `/observe` (users.role, comma list). Default `head_teacher,principal,school_leader,coach,supervisor` (`principal` and `school_leader` are read as aliases of `head_teacher`, which is what the roster script writes) |
| `OBSERVE_SELF_COACH_ROLES` | which of those also teach and may send their *own* lesson for self-coaching. Default `head_teacher,principal,school_leader` |
| `OBSERVE_FORM_FLOW_ID` | Meta only, optional: the published editable-form Flow (see below). Blank = the chat form |
| `OBSERVE_REVIEW_MODE` / `OBSERVE_REVIEW_NUMBER` | `operator` sends every report to a review number first (a pilot check) |
| `OBSERVE_REPORT_TEMPLATE` / `OBSERVE_REPORT_TEMPLATE_LANG` | Meta only: the approved template that invites a teacher outside the 24-hour window |
| `OBSERVE_SCHOOL_ID_PREFIX`, `OBSERVE_ROSTER_SOURCE`, `OBSERVE_SCHOOL_DAYS` | roster namespacing and the school days offered when planning a visit |
| `OBSERVE_CALENDAR_ENABLED` + `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_SUBJECT`, `OBSERVE_CALENDAR_TIMEZONE` | optional calendar invites for planned visits (off by default; scheduling never depends on it) |
| `OBSERVE_*_SWEEP_OFF`, `OBSERVE_DEBRIEF_RETRY_OFF` and the sweep tuning variables | the background follow-ups (see `.env.template`) |

Recordings need speech-to-text (`SONIOX_API_KEY`), as for classroom coaching. Object storage (R2) is optional:
without it the audio is not archived, and the reports are kept on local disk.

**Existing deployments:** apply `infrastructure/supabase/migrations/V2.6.0__observe_coach_assistant.sql`
(additive: four columns on `coaching_sessions`, `users.role` and `users.school_id`, and the `schools`,
`leader_schools`, `observation_schedules` and `coach_directory` tables). Fresh installs get it from
`00_complete-schema.sql`. Apply it before deploying the dashboard, even with Observe off: the teacher
portal filters coaches' observations out of a teacher's own pages and reads the new column to do it. The bot
and the Morning Brief check for the column and work either way: a teacher's own coaching (score trend, prior
feedback, chat context, `/status`) leaves observations out when the column exists, and without it the bot
logs an error at start-up asking for the migration and computes teachers' coaching exactly as before.
The bot checks once, when it starts: after applying the migration, restart the bot and the worker.

### Set up your coaches

The roster is **derived**: a coach holds schools, and a teacher belongs to a school through `users.school_id`.
Nobody fills a form — run the roster script (phones may be any channel identity, e.g. `mtx:15550100001`):

```bash
node bot/scripts/observe-roster.js grant-coach +15550100001
node bot/scripts/observe-roster.js add-school  +15550100001 SCH-001 Hillside Primary School
node bot/scripts/observe-roster.js add-teacher +15550100002 SCH-001 Sam Taylor
node bot/scripts/observe-roster.js import roster.csv   # coach_phone,school_ext_id,school_name,teacher_phone,teacher_name
node bot/scripts/observe-roster.js list +15550100001
```

A coach with no schools can still use `/observe`: they record, and are asked afterwards who they observed.

## Keeping the coach organised

Everything below happens in chat. A list is a native list on Meta and a
numbered menu on Baileys, Matrix, Slack and Discord. The coach taps a row or
types its number, and the same row id comes back either way.

### The /observe menu

After the gates and the one-time onboarding, `/observe` opens **one** list:

1. **Pending work, oldest first.** Each row goes back to its own step:
   - 📝 not at the debrief yet: re-opens the ratings form, offers
     "Run it again" for an observation that stopped, or says it is still
     working;
   - 📋 debrief to do: the debrief offer;
   - 📨 report not sent: the send offer.
2. **🎙 New observation**: the visit picker.
3. **📅 My schedule**: planned visits. The row shows how many are planned and
   how many are overdue.
4. **🗓 Plan a visit.**

If there are more pending items than fit, a **More…** row shows the next page.
A coach with no pending work and no schools gets the plain capture prompt.
`/observe` also clears an old armed recording slot, so an earlier pick never
binds a new lesson. If the debrief step is not installed, or a lookup fails,
the menu opens without pending rows. If the menu itself fails, the coach gets
the capture prompt.

"Run it again" picks up from the stage that failed. With no transcript it
transcribes again; with a transcript it analyses again. It runs once per tap
(the status is compare-and-set) and at most twice per observation. After that
the coach is told plainly that it will not go through.

### Visit picker

School → teacher → **brief** → recording slot armed with the teacher bound.
The recording that follows belongs to that teacher.

- With one school, the picker goes straight to its teachers. Long lists get a
  **More…** row. **Not listed — record** records without a teacher, and Rumi
  asks who it was afterwards.
- The brief has the focus from the teacher's last observation (and what was
  working), what to look for this time, and the footer *"guidance, not a
  grade"*. It never shows a score. A first visit gets a short first-visit
  note instead.
- Row ids only point to a record. Every tap re-reads the coach's own roster,
  so an old or forged id can never bind someone else's teacher.

### Scheduling

**Plan a visit** goes school → teacher → day. The coach picks one of the next
six school days or **Type a date** (YYYY-MM-DD, today or later). A wrong date
is asked for again. A reply with no digits is treated as ordinary chat.
School days are Monday to Friday unless `OBSERVE_SCHOOL_DAYS` says otherwise
(ISO weekdays, e.g. `7,1,2,3,4` for Sunday to Thursday).

Each coach, school and teacher has at most one upcoming visit; planning again
moves it. **My schedule** lists upcoming visits by date, overdue first and
marked. Each one can be **started** (the teacher is bound, as in the
picker), **moved** or **cancelled**. When the observation's recording is
captured, the visit is marked done and leaves the schedule.

### "Whose observation is this?" (several recordings in flight)

A classroom-length recording (the line the self-coaching path draws, `COACHING_MIN_AUDIO_SECONDS`,
default 15 minutes) from a coach with nothing armed is **parked**:
the oldest is first in line, up to 5, kept for 6 hours. Rumi then asks the
coach:

- scheduled teachers first, then the rest of the roster;
- **Another teacher** (the picker);
- **This is a debrief**, only when a debrief is waiting;
- **My own lesson**, only for leaders who also teach
  (`OBSERVE_SELF_COACH_ROLES`); it goes to their own coaching;
- **Not an observation**, which drops the recording.

The oldest recording is bound first. A recording that arrives while a question
is open waits its turn, and the question comes back for the next one. Each
answer is tied to one recording, so a double tap or a retried webhook never
creates a second session and never binds the next recording by mistake. If
the coach sends the same recording again (same bytes or the same media id),
the answer is "already got this one". A bound recording becomes a normal
capture: the teacher owns the session, the visit is marked done and the coach
gets the capture ack.

### Roster management (for administrators)

```
node bot/scripts/observe-roster.js grant-coach <phone> [role]
node bot/scripts/observe-roster.js add-school  <coach-phone> <school-ext-id> <school name>
node bot/scripts/observe-roster.js add-teacher <teacher-phone> <school-ext-id> [name]
node bot/scripts/observe-roster.js import      roster.csv
node bot/scripts/observe-roster.js list        <coach-phone>
node bot/scripts/observe-roster.js set-email   <coach-phone> <email> [full name]
```

- CSV columns: `coach_phone,school_ext_id,school_name,teacher_phone,teacher_name`.
  Bad rows are reported and the rest are applied. Running an import again
  changes nothing, and it never demotes a principal to coach.
- A phone is the person's channel identity: digits for WhatsApp, or a
  prefixed identity (`mtx:…`, `slack:…`, `discord:…`).
- A teacher belongs to a school through `users.school_id`, so the roster is
  never stored twice. School ids are prefixed with `OBSERVE_SCHOOL_ID_PREFIX`.
  `leader_schools.source` comes from `OBSERVE_ROSTER_SOURCE`.

### Calendar invites (optional, off by default)

`OBSERVE_CALENDAR_ENABLED=true` turns invites on for every coach. A comma list
of `users.id` turns them on for only those coaches. Also set
`GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_CALENDAR_ID`, plus
`GOOGLE_CALENDAR_SUBJECT` if the service account needs domain-wide delegation
to invite attendees. `OBSERVE_CALENDAR_TIMEZONE` defaults to UTC.

- Only the coach is invited. The address comes from `coach_directory`
  (`set-email` above) and is never guessed from a name.
- Planning, moving and cancelling a visit creates, updates and deletes the
  event.
- A calendar outage never blocks scheduling.

## The guided debrief and coach-the-coach

Once the coach has submitted the form, they are offered **Debrief now / Later**
(button ids `observe_debrief_now_<id>` / `observe_debrief_later_<id>`).

**Later** leaves the observation pending (`debrief_status = 'pending'`). It comes
back in the `/observe` list as a `observe_debrief_<id>` row.

**Debrief now** builds a six-step conversation guide from the coach's *edited*
analysis. Scores, the performance band, edit counts and contact details are
removed before the model sees it. The six steps are:

1. open with intent
2. praise with evidence
3. one question, then silence
4. one thing to improve
5. the teacher's own if–then commitment
6. agree when to look again

The guide is checked in code before it is sent:

- exactly six steps, each with something to say
- no score, `N/M`, percentage or "N out of M"
- never "what could you have done better?"
- no longer than 2,200 characters

If the model's guide fails any check, or the call fails, the coach gets a fixed
fallback guide built from the strings pack (`guide_fb_*`), so a coach is never
left without a guide.

The guide goes out as one message. The bot then asks the coach to record the
conversation and sets the coach's state to `awaiting_debrief_audio`.

### The recording

The coach's next audio, of any length, goes through the audio router to
`startDebriefFromAudio`. That call resets the debrief artefacts in
`analysis_data.observer_debrief` and queues an `observe_debrief` job. It never
queues the lesson transcription job, which would overwrite the lesson
transcript.

The worker then:

- downloads the recording and transcribes it
- refuses a transcript under 150 characters, sets `awaiting_debrief_audio`
  again and asks for a longer recording
- refuses a recording this coach was already coached on for another
  observation (SHA-256 of the bytes)
- writes the coach-the-coach feedback and delivers it
- sets `debrief_status = 'done'`, then offers to send the teacher their report

### Coach-the-coach

The model judges eight rubric keys internally. The coach never sees them:

- `opened_with_specific_praise`
- `anchored_in_real_moment`
- `asked_and_waited`
- `one_improvement_only`
- `moves_not_teacher`
- `elicited_if_then`
- `righting_reflex_held`
- `disparaged_teacher`

The coach receives a warm praise line, **two wins** that quote the coach's own
words, one thing to try next time, an action line and one question to reflect
on.

`validateCoachFeedback` enforces these rules in code:

- **Harm gate.** If `disparaged_teacher` is true or `moves_not_teacher` is
  false, the feedback must have no wins and no praise line, and must include a
  full concern (what happened, why it matters, what to do instead).
- **No scores.** The feedback must not contain `N/M`, a percentage, "N out of
  M", or a score, rating or mark followed by a number.
- **Shape.** A respectful debrief has exactly two wins, and each win needs a
  behaviour and evidence.

If the first answer fails validation, the model gets one more try with the
validator's error. If that also fails, the coach is told the debrief couldn't be
analysed. The transcript is kept.

The feedback is sent as an image card built from the shipped brand assets
(`bot/shared/assets/rumi-mark-{navy,white}.png`, `BOT_NAME`). If the card can't be rendered or sent,
the text card is sent instead. A harmful debrief never gets a card.

### Failures and retries

If transcription fails, the failure is saved on the row and the coach is told
once.

A 400/404 from the media host (`media_gone`) means the recording has expired,
so the coach is asked to record again. Any other failure is treated as
temporary, and the coaching worker's sweep re-queues it every 15 minutes:

- at least 30 minutes apart
- at most 6 attempts
- within 28 days of the recording
- with one Redis lock per row

Set `OBSERVE_DEBRIEF_RETRY_OFF=true` to turn the sweep off.

A failed `observe_debrief` job never marks the observation as `failed`.

### Completion

An observation becomes `completed` once three things are true:

- the form was submitted
- the debrief is `done`
- the report's `teacher_delivery.status` is `sent`

Both the debrief step and the send step check this. The status change only
happens while the status is still `observer_review_complete`.

### For the `/observe` list

The `/observe` list uses these functions from `observe-debrief.service.js`:

- `listUnfinished(coachId)` returns observations that haven't reached the form
  yet. Each row has `resume` set to `form`, `retry` or `wait`.
- `listPendingDebriefs(coachId)`
- `listUnsentReports(coachId)`

## The teacher's report

After the coach has been coached on their debrief, Rumi offers **Send report / Later**. Nothing reaches the teacher before the coach has seen it.

### Who receives it

The recipient is found in this order:

1. **The teacher the observation is bound to.** Their own `users` row is used. Its `phone_number` is their channel identity, for example `15550100002` on WhatsApp or `mtx:15550100002` on Matrix.
2. **A pick from the coach's roster.** This is the list of teachers in the coach's schools who have a number on file, plus **New teacher**.
3. **Typed details.** The coach sends the name and number in one message, for example `Sam Taylor, +1 555 010 0123`. Any number of 7 to 15 digits is accepted, and there are no country-specific rules. If an existing user has that number, stored as bare digits, `+digits`, `mtx:digits` or `matrix:digits`, the report goes to that user's identity. Otherwise it goes to the bare number.

### Preview, then send

A worker job (`observe_teacher_report`, phase `preview`) prepares the report and sends it to the coach. It is exactly what the teacher would receive:

- **The hero report.** It is rendered without any score: no percentage, no marks, no scorecard and no trend line. If this host cannot render images, a short text report of the lesson's strengths is sent instead.
- **A companion note.** It says what the coach and teacher discussed, and the commitment the teacher made in their own words. If the teacher made no commitment, the note has none. The note is left out entirely when the debrief was harmful (the coach-feedback harm gate).

Below the preview are three buttons: **Send now**, **Someone else** and **Cancel**.

The buttons belong to that one preview:

- **Only the coach who made the observation** can press them. Anyone else is told the observation isn't theirs, and nothing changes.
- **Every preview has its own id**, and the buttons carry it. Choosing a recipient starts a new preview and clears the previous one's report, so a report prepared for one teacher can never be sent to another.
- **Someone else** and **Cancel** retire the preview. A **Send now** tapped on a retired or older preview sends nothing; Rumi tells the coach the preview is out of date. The worker checks the id again before it sends, so a queued job for an old preview sends nothing either.
- After a failed send, **Send now** on the same preview retries it. Tapping it twice in a row still sends once.

### Delivery

Delivery depends on the recipient's identity, not on the deployment's channel driver.

| Recipient | What happens |
|---|---|
| `mtx:…`, `matrix:…`, `slack:…` or `discord:…` (any prefixed identity) | Sent directly. There is no window and no template, even when `CHANNEL_DRIVER=meta`. |
| A bare number on Baileys | Sent directly. |
| A bare number on Meta, with its 24-hour window open | Sent directly. |
| A bare number on Meta, with its window closed | Rumi sends the approved invite template (`OBSERVE_REPORT_TEMPLATE`). The report follows when the teacher taps it, but only if the tap comes from that same number. |

The coach is told every outcome: sent, invitation sent, sent to review, or failed. If the template is not configured or is refused, Rumi tells the coach so and does not mark the report as sent.

**Review gate.** When `OBSERVE_REVIEW_MODE=operator` is set, every delivery goes to `OBSERVE_REVIEW_NUMBER` instead of the teacher. That number can be any channel identity. There is no default: if review mode is on and no number is set, the send fails and the coach is told.

Delivery state is stored in `coaching_sessions.analysis_data.teacher_delivery` with a merge-write, so no schema change is needed.

### The trust firewall

The teacher's report never contains:

- the coach's own critique (`observer_notes`, the edit summary)
- any coach-the-coach material (`observer_debrief.feedback`, the debrief guide)
- a score or anything that reads like one (`34/50`, `62%`, `3 of 5`, `score: 2`, `12 points`)
- a verdict on the teacher as a person

These rules are enforced in code by `observe-teacher-report.js`, not only requested from the model:

- **At render time.** The hero report is rendered from a copy of the analysis with every coach-only key removed. Any part of its narrative that breaks a rule is dropped before rendering.
- **At preview time.** The companion note and the caption are checked.
- **Just before delivery.** The whole package is checked again. If it fails, nothing is sent, and the coach is told.

Copying coach material is detected when the report shares a run of six or more words with it. The debrief transcript is not treated as coach material, because the teacher's commitment is quoted from it.

### Follow-up sweeps (stale-session worker)

| Sweep | What it does | Switch off |
|---|---|---|
| Untapped | A teacher who has not tapped the invite after one day gets one nudge. Two days later Rumi stops and tells the coach. | `OBSERVE_UNTAPPED_SWEEP_OFF=true` |
| Undelivered | For a finished observation whose report was never sent (preview ignored, or the send never opened), Rumi reminds the coach once after a day. Two days after that reminder, Rumi stops reminding and tells the coach so. | `OBSERVE_UNDELIVERED_SWEEP_OFF=true` |

Both sweeps share these safeguards:

- **One worker at a time.** A Redis lock means only one worker runs a sweep.
- **Capped.** Each run handles at most 25 items, oldest first.
- **Notify once.** Nobody gets the same message twice.
- **Old items closed silently.** Anything nobody ever chased that is older than the expiry age is closed without messaging anyone.

Tuning: `OBSERVE_UNTAPPED_EXPIRE_DAYS`, `OBSERVE_UNTAPPED_MAX_PER_TICK`, `OBSERVE_UNDELIVERED_REMIND_HOURS`, `OBSERVE_UNDELIVERED_GIVE_UP_HOURS`, `OBSERVE_UNDELIVERED_EXPIRE_HOURS`, `OBSERVE_UNDELIVERED_MAX_PER_TICK`.

### Ids and states

- **Buttons:** `observe_send_{start,later}_<sessionId>`; the preview's `observe_send_{confirm,other,cancel}_<sessionId>.<previewId>`
- **Delivery states** (`teacher_delivery.status`): `previewing` → `awaiting_confirm` → `sent`, `awaiting_teacher_tap`, `operator_review`, `send_failed`, `preview_failed` or `cancelled`. `teacher_delivery.preview_id` is the current preview (null once retired).
- **Pick list:** `observe_pickt_<n>`, `observe_pickt_more_<offset>`, `observe_pickt_new`
- **Template quick reply (Meta):** `observe_report_<sessionId>`
- **Observe states:** `awaiting_teacher_pick`, `awaiting_teacher_details`, `awaiting_send_confirm`

## Section B — did the lesson follow its plan?

### In programme terms

**Fidelity of implementation, inside the coaching visit.** Structured pedagogy only works if the lessons in the teacher
guide reach the classroom, and programmes have long asked their coaches to check delivery by following the guide during
the visit. Section B does that check from the coach's own recording: the lesson plan becomes its planned moves, and each
move gets a verdict with the quoted, timestamped moment as proof. A different activity that keeps the move's purpose
(same objective, the core intact, student practice kept, evidence of it) earns full credit, and the teacher is told it
was a good choice: the principle is to standardise the function of a step, not its form [Hawe04][FRAME19]. A move that
was only started earns half credit and becomes a coaching focus. A move the recording cannot show is "not assessed",
never zero. The coach was in the room, so the coach confirms or corrects every verdict, and the coach's version is the
one used. The teacher's report keeps observe's promise: it names what went as planned, the substitutions that worked,
and one thing to try, with no score. Coaches are encouraged to treat the result as mentorship, not inspection
[Piper-Dubeck24].

Section B is the [lesson-plan fidelity](lesson-plan-fidelity.md) engine (v2.3.0) run on the observation's recording; the
measurement, its calibration and its limits are documented there. It is on when both `OBSERVE_ENABLED=true` and
`LP_FIDELITY_ENABLED=true`.

### Linking the plan

Once Rumi knows whose lesson it is (the teacher picked in the visit picker, or named afterwards in "who did you
observe?"), the coach is asked **"Which lesson plan was this lesson taught from?"** with that teacher's recent plans made
with Rumi (newest first, `LP_FIDELITY_LIST_LIMIT`) and **No plan**. A list on Meta, numbered text elsewhere; row ids are
`observe_lp_<sessionId>_<n|none>`.

- The question never blocks the recording: transcription goes on, and the analysis waits for an open question at most
  `LP_FIDELITY_PLAN_WAIT_SECONDS` (default 90).
- A pick goes through the same linker as a teacher's own session, owned by the **teacher**: a coach can only link the
  observed teacher's own plan.
- A teacher with no plans is not asked about; Section B then says so.
- A pick that arrives after the analysis, while the coach's form is still open, grades Section B then and says so
  ("Section B is ready in the form"). Once the form is saved it is too late, and the coach is told.

### Grading

The analysis job runs the fidelity engine (`computeFidelityForSession`) on the observation's transcript, with the same
input contract as everywhere else: a transcript without `[MM:SS]` timings is refused in code before any model call. The
results are stored on the observation like any session's:

- `analysis_data.lp_fidelity`: the engine's blob (moves, verdicts, quotes, the measurement);
- `analysis_data.section_b`: `{ status: 'assessed' | 'not_assessed', reason, detail }`.

| `section_b.reason` | What the coach is told |
|---|---|
| `no_plan` (detail `teacher_has_no_plans`, `coach_said_no_plan`, `no_answer`, `teacher_unknown`) | the actual cause: the teacher has no plan made with Rumi yet, the coach said there was none, no plan was picked, or Rumi did not know whose lesson it was |
| `no_timings` | the plan was linked, but the transcript has no timings |
| `recording_unusable` | the plan was linked, but the recording did not show which moves happened |
| `plan_unreadable` | the plan was linked, but its text could not be read |
| `grader_failed` | the plan was linked, but the check could not run this time |

`not_assessed` is never a zero: Section B is left out of the form's review, the teacher's report and the portal's
verdicts, and the coach gets one message saying which state it is. A lesson that does not match its plan is assessed
and flagged; the coach is told, and the teacher's report leaves Section B out.

### The coach reviews it

After the last Section A domain the chat form goes on to Section B, six moves a message:

```
📋 Section B — did the lesson follow its plan? (1 of 2)
…
4. Guided practice — Pairs compare fractions with paper strips
   ⭐ Better swap
   [14:05] "Use the number line on the board…"
…
Reply ok to keep these, or a move number (1 to 11) and a verdict number — e.g. 5 1.
1 ✓ As planned · 2 ↔ Equal swap · 3 ⭐ Better swap · 4 ◐ Partly · 5 ✗ Not done · 6 – Can't tell
```

- Moves are numbered across the whole plan, so any page can change any move; changed moves show `(changed)`.
- The ratings and the verdicts are saved in **one** write when the last page is confirmed. The coach's verdicts go back
  through the same scorer (`observer_edited: true`, `coach_verdict` on each changed move). The AI's first pass stays in
  `autofill_analysis_data`. A move the plan marked as not audible stays out of the score unless the coach rules on it.
- **Meta Flow:** the published form Flow has no Section B screen, so after a Flow submission the chat walks the coach
  through Section B, then offers the debrief.
- The debrief guide sees the reviewed moves (a planned move not done is a natural "one thing to improve"), never the
  percentage or band.

### The teacher's report: the kind version

When Section B was assessed, the teacher's package gets one more message, after the report and before the companion
note, built from the **coach's** verdicts:

```
📋 Your lesson and its plan

✅ What went as planned
• Recall halves with the class
⭐ Done your own way — and it kept the purpose
• Pairs compare fractions with paper strips — a stronger way to do it
🌱 One thing to try next time
• Exit question on the board
```

No percentage, band or count. Every line goes through the trust firewall; a line that reads like a score or quotes the
coach's private material is dropped, and the whole note is checked again before it is sent. Not assessed, or a lesson
that did not match its plan: no note. The hero report itself never sees the measurement (`teacherSafeAnalysis` removes
`lp_fidelity` and `section_b`).

## The coach's view in the portal

A coach who has a portal account sees an **Observations** item in the portal's
navigation. It opens **My observations** (`/portal/observe`):

- **Upcoming visits** — the visits they scheduled with `/observe`, earliest
  first. A visit whose date has passed is marked **Overdue**.
- **Waiting on you** — observations that need the coach next:
  **Check the form** (the AI's draft ratings are ready to review),
  **Do the debrief** (the form is done, the feedback conversation is not), and
  **Send the report** (the debrief is done and no report is out: never sent,
  the send failed, or the teacher never opened the invite and Rumi stopped
  waiting).
- **On its way to the teacher** — sent, but the teacher does not have it yet:
  **Invite sent, waiting for the teacher** (the invite outside the 24-hour
  window has not been opened) or **With the review team** (review mode sent it
  to the review number first). Nothing for the coach to do here.
- **Being prepared** — recordings still being transcribed or analysed.
- **Completed** — the debrief is done and the report has reached the teacher
  (`teacher_delivery.status` is `sent`, the same rule as [Completion](#completion)).
  An unopened invite or a report with the review team is never shown as done.
- **My teachers** — the teachers in the coach's schools, with how many times
  the coach has observed each and when they last did. Opening a teacher
  (`/portal/observe/teacher/<id>`) lists the coach's past observations of them.

Under an observation that has a Section B record (did the lesson follow its
plan?), a folded **Lesson plan (Section B)** block opens to the plan's moves in
order, each with its verdict (As planned, Equal swap, Better swap, Partly, Not
done, Can't tell) and **changed by you** where the coach changed it in chat. A
recording that did not look like the plan's lesson carries a warning. When
Section B was not assessed, the block says **Not assessed** and why (no plan
linked, no timings in the transcript, and so on); it never shows a zero. The
block shows no percentage, band or count, and no quotes from the recording.

The page is read-only. Recording, checking the form, debriefing and sending the
report all happen in chat with `/observe`; the portal shows where each one stands.

### Who sees it

Only while observe is on, and only users whose `users.role` is in the coach
role family — `OBSERVE_LEADER_ROLES` (default
`head_teacher,principal,school_leader,coach,supervisor`), the same setting the
chat command uses. The portal API checks this on every request: anyone else
gets `403` from `/api/portal/coach/*`, and the navigation item is not shown to
them.

The dashboard runs as its own service and reads `OBSERVE_ENABLED` (and the
console pause `RUMI_FEATURE_OBSERVE=off`) from **its own** environment, at
request time. Unless it is `true` there, `/api/portal/coach/*` answers `404`
and no one is shown the Observations item, so set it on the dashboard as well
as the bot. A coach sees only their own visits and observations,
and only teachers in the schools assigned to them (`leader_schools`); asking for
any other teacher returns `404`.

Because the dashboard runs as its own service, it keeps a copy of the default
role list and of the on/off rule, and of Section B's verdict labels, phase names
and not-assessed reasons; a test fails if any of them ever differs from the
bot's.

If the database cannot be read (for example, the dashboard was deployed before
the migration), the coach endpoints answer `500` and the page says the
observations aren't available right now. It never shows an empty "Nothing
waiting" in place of an error.

### What it never shows

- **No scores or ratings.** None of the coach-view responses include a score,
  including Section B's percentage and band.
- **No coach-the-coach feedback.** The feedback a coach receives on their own
  debrief is never sent to the portal.
- **Teachers never see a coach's observation of them.** The teacher pages
  (dashboard, coaching sessions, a session's detail, analytics) list only the
  teacher's own recordings. A coach's observation holds the coach's ratings, so
  it never appears there, even when it is filed under the teacher.

### API

| Endpoint | Returns |
|---|---|
| `GET /api/portal/coach/observations` | `{ upcoming, waiting: { form, debrief, report }, delivering, inProgress, completed }` (`delivering`: stage `awaitingTeacher` or `withReview`) |
| `GET /api/portal/coach/teachers` | `{ teachers: [{ id, name, schoolName, observationCount, lastObservedAt }] }` |
| `GET /api/portal/coach/teacher/:id` | `{ teacher, observations }`, or `404` if the teacher is not in the coach's schools |
| `GET /api/portal/dashboard` | now also returns `user.isCoach` (observe on and in the role family), which shows or hides the nav item |

Each observation carries `id, createdAt, stage, teacherUserId, teacherName,
schoolName, reportStatus, reportSentAt, sectionB`. `sectionB` is `null` when the
observation has no Section B record; `{ status: 'assessed', mismatch,
editedByCoach, moves: [{ n, phase, phaseLabel, text, verdict, verdictLabel,
coachChanged }] }` when it was assessed; or `{ status: 'not_assessed', reason,
detail, message }`, where `message` is the sentence the coach sees. The teacher is identified from the
visit the observation was linked to, then from the teacher it was filed under,
then from the name typed when the report was sent. A recording the coach has
not yet linked to a teacher shows as "Teacher not named yet", never under the
coach's own name.

This needs migration `V2.6.0__observe_coach_assistant.sql`. The teacher pages
filter on `coaching_sessions.observation_type`, so run the migration before
deploying this version of the dashboard.

## The editable form on Meta (optional)

On every channel the coach reviews the AI's ratings in a stepwise chat form: one
domain per message, reply `ok` to keep it or `<indicator> <rating>` to change one.
A deployment on the Meta WhatsApp Cloud API can also publish the form as a
**WhatsApp Flow**. The coach then gets one tappable form, one screen per domain,
with a rating, the evidence and an improvement note for every indicator, all
pre-filled and all editable.

Nothing else changes. The Flow's endpoint saves edits through the same merge as the
chat form, and when the coach submits, the bot acknowledges in the chat and offers
the debrief, just as it does after the last chat-form step. If the Flow can't be
sent (no `OBSERVE_FORM_FLOW_ID`, a coach on another channel, or a failed send), the
coach gets the chat form.

**What ships**

| Piece | Where |
|---|---|
| Flow JSON (default TEACH pack) | `docs/flows/observe-form-flow.json` |
| Generator (builds the JSON from the framework pack) | `bot/scripts/generate-observe-flow-json.js` |
| data_exchange endpoint | `POST /api/flows/observe-form` (`bot/shared/routes/observe-form-endpoint.js`) |
| Submission handling | the `nfm_reply` branch in `bot/whatsapp-bot.js` → `observe-draft.service` `completeFromFlow` |

**Publish it**

1. Pick the framework. The shipped JSON is built for the default pack
   (`OBSERVE_FRAMEWORK=teach`). If you use `hots` or `mewaka`, regenerate it first:

   ```bash
   OBSERVE_FRAMEWORK=hots node bot/scripts/generate-observe-flow-json.js
   ```

   This rewrites `docs/flows/observe-form-flow.json`: one screen per domain
   (`DOMAIN_1` … `DOMAIN_N`) plus a closing `SUCCESS` screen. The rating options
   come from the endpoint (`${data.scale}`), so they always match the pack's scale.
   Use `--out <file>` to write it somewhere else. The JSON's static labels are
   English. A Flow is published as one document, so translate the `flow_*` keys in
   `observe-strings` before you generate if your coaches need another language.

2. Register it. Either:
   - **`rumi setup` / `run-full-setup.js`**. The registrar includes **Observe
     Form** (an endpoint Flow). Pass `--endpoint-base=https://<your-bot-host>` so
     Meta's data endpoint is set to `<base>/api/flows/observe-form`. Flow
     encryption must be configured (`FLOW_PRIVATE_KEY`), the same as for the other
     endpoint Flows. The new Flow ID is written to `OBSERVE_FORM_FLOW_ID`.
   - **By hand, in Meta's Flow builder**. Create a Flow, paste the JSON, set the
     endpoint URI to `https://<your-bot-host>/api/flows/observe-form`, then publish.

3. Set `OBSERVE_FORM_FLOW_ID=<flow id>` and restart. Leave it blank to keep the
   chat form for everyone.

**Behaviour worth knowing**

- The Flow token is `<coachUserId>:<sessionId>`. The endpoint serves and accepts
  edits only for the observation's own coach.
- Edits are buffered per screen in Redis (`observe:edits:<sessionId>`, 2 hours) and
  saved when the last screen is submitted. If Redis loses the buffer, those screens
  keep the AI's values. Nothing breaks.
- A cancelled observation's form won't submit. Meta shows only a generic error
  inside the Flow, so the bot also tells the coach in the chat, once per
  observation every five minutes.
- After you change the framework, regenerate and re-publish the Flow. A Flow built
  for one pack has the wrong screens for another.

## Not in this release

- A Meta visit-picker Flow and roster-admin Flows (the chat menu covers the same steps on every channel).
- Visit notices to the teacher by Meta template (scheduled / moved / cancelled).
- Coach-and-teacher speaker labels in the debrief transcript (the prompt is told the two voices' labels are
  arbitrary).
- Portal login for a coach who reaches Rumi only on Matrix, Slack or Discord (the portal signs in by phone
  number), and scheduling from the portal.
- Language packs other than English (`registerLanguagePack` in `observe-strings.js` adds one).
