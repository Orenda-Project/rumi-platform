# ✅ Attendance

![Attendance](../images/features/attendance.jpg)

> A register the school can file — marked in a few taps or a voice note, kept for the whole month, with approved leave counted as leave.

## In programme terms

**Were the children actually in the room? A daily register that records exposure, so impact can be measured later.**

A programme can only change the learning of children who are there to receive it. Attendance is a precondition for learning [Evans-Mendez23], and in fidelity terms it is coverage and dose at the level of each child [Carroll07]. Without it, an evaluation cannot tell "the programme didn't work" from "the children weren't there". This feature keeps a daily register for each child. The teacher marks it in chat by tapping, by typing the numbers of absent children, or by a voice roll call. Each child is marked present, absent or on approved leave. Past days can be added or corrected. After every mark the teacher receives the whole month's register as a fileable spreadsheet, with totals and a rate for each child. For children, leave still counts as missed exposure. For staff, whom head teachers mark the same way, approved leave is excused.

**Where it sits in a structured-pedagogy programme:** teacher guide → delivery → coaching → assessment → **M&E (exposure)**. It is the dose record that impact measurement later depends on.


### Honest limits

- **What the data is.** It is teacher-reported register data. It is not checked by unannounced visits, and records can diverge from reality [Evans-Mendez23].
- **Resolution.**
  - One cell per day; double sessions are merged.
  - It does not record per-lesson attendance or minutes of instruction.
  - There is no holiday calendar.
- **Where the data lives.**
  - The register exists only as a spreadsheet in chat.
  - There is no dashboard and no export to EMIS or a data warehouse.
- **Setup.** Linking a school is an admin step.
- **Teacher nudges.** The release also includes one check-in to a teacher who has gone quiet. It is English only.

### Sources

- [Carroll07] Carroll, C., Patterson, M., Wood, S., Booth, A., Rick, J., & Balain, S., 2007, "A conceptual framework for implementation fidelity", *Implementation Science* 2:40. https://doi.org/10.1186/1748-5908-2-40
- [Evans-Mendez23] Evans, D. K., & Mendez Acosta, A., 2023, "How to measure student absenteeism in low- and middle-income countries", *Economics of Education Review* 96:102454 (CGD WP 600, 2021). https://doi.org/10.1016/j.econedurev.2023.102454

## What it is

A teacher marks their class; a head teacher marks the school's staff. After every submit Rumi sends back the
**month's register** as a spreadsheet, the shape schools already keep on paper:

- one row per person, one narrow column per day of the month, weekends greyed;
- running totals on the right: **P**resent, **A**bsent, **L**eave and the attendance rate;
- regenerated **whole** after every submit, so the newest file always holds the whole month and there is never a
  pile of partial files to reconcile.

**Leave is a status of its own.** A register that only knows present and absent files a colleague's approved
leave as absence — a misreport in the document the school keeps. The two registers rate it differently, because
they record different things:

| Register | Rate | Why |
|---|---|---|
| Staff | present ÷ (present + absent) | approved leave was agreed in advance: neither attendance nor a black mark |
| Class | present ÷ (present + absent + leave) | a class register records who was in the room; a child on leave was not |

## How it works

1. **"attendance"** (or `/attendance`, `حاضری`, `hazri`) starts it. **Who** is asking decides what it means:
   - a **teacher** marks their class (one class: straight in; several: "Which class?");
   - a **head teacher** marks the school's **staff** — the role has already answered "whose attendance?".
     A head teacher who also teaches says **"class attendance"** to reach their class.
2. **Name a day to mark or correct it:** "attendance yesterday", "attendance 30 sep", "attendance 2026-09-30".
   Future days are refused; days older than `ATTENDANCE_MAX_BACKDATE_DAYS` are refused. A number after
   "class", "grade" or "section" is a class, never a day ("attendance grade 5/6" opens today), and a bare
   `9/10` that would land outside that window is read as a class too.
3. **Choose how:** `1` voice roll call, `2` tap to mark, `3` everyone present. The menu always names the day
   being marked, today included.
4. **Mark by exception** — name who is away; everyone else is present:

   | Channel | How absent and leave are marked |
   |---|---|
   | WhatsApp (Meta Cloud API) | the native marking Flow: an *Absent* and an *On leave* checkbox group |
   | WhatsApp (Baileys), Matrix | a numbered roster; one reply: `2, 5` (absent), `2, 5 leave 3` (absent + on leave), `leave 1`, or `none` |
   | Slack / Discord | the tap-to-mark modal: an absent picker and an on-leave picker |
   | Voice note (any channel with voice) | "Eli is absent, Fay is on leave" — confirmed before saving |

5. **Rumi saves the day, then rebuilds and sends the month's register** to the chat it was marked from.
   **Marking a day again replaces it** — that is how a mistake is corrected — and the whole month is
   regenerated, so the corrected file still holds every other day. A new month starts a new register.
   The new marks are written before the old ones are removed (and taken back out if that removal fails), so a
   correction that fails to save leaves the day already on file as it was. Only the teacher whose class it is can mark or correct its days.

## What the teacher experiences

```
Teacher:  attendance
Rumi:     Attendance for Grade 5 - A
          1. Voice Roll Call  2. Tap to Mark  3. Everyone present
Teacher:  2
Rumi:     1. Dana Lee  2. Eli Moss  3. Fay Ng
          Who's absent in Grade 5 - A today? … add "leave" and their numbers (e.g. "2, 5 leave 3").
Teacher:  2 leave 3
Rumi:     Attendance Recorded — Present: 1, Absent: 1, On leave: 1
Rumi:     📎 Attendance_Grade_5_A_September_2026.xlsx — the whole month so far
```

## Enable it

_Always on_ — core. On a fresh install the class side needs nothing: a teacher sets up a class in chat
("add class") and marks it.

**Staff attendance** needs a school with its head teacher and staff linked. From `bot/`:

```bash
node scripts/attendance/link-school.js --school "Hillside Primary" --ext-id HP-01 \
  --head 15550100009 \
  --staff matrix:@amara:example.org --staff slack:U0123ABCD \
  --staff-name "Chen Rao"
```

- `--head` / `--staff` name a person by `users.id`, WhatsApp number, or channel identity
  (`slack:…`, `discord:…`, `matrix:…`); a channel identity is found once that person has messaged the bot.
- `--staff-name` adds a colleague who does not use the bot; they appear on the staff register like everyone else.
- `--ext-id` is an optional external school identifier (`schools.ext_id`: a census or district number) — nothing depends on it.
- The script is idempotent, and resolves everyone before writing anything.

It sets `users.school_id` for everyone and `users.role = 'head_teacher'` for the head teacher (`principal` and
`school_leader` are read as the same role, for data that already uses those words).

**WhatsApp Flows (Meta Cloud API only).** The setup and marking Flows are registered during setup
(`register-all-flows`) into `ATTENDANCE_SETUP_FLOW_ID` and `ATTENDANCE_MARKING_FLOW_ID`. To get the *On leave*
field on an existing install, re-publish `docs/flows/attendance-marking-flow.json`; until then the Flow keeps
working without it. Leave these unset on channels without Flows — every other channel uses its own form.

**Storage.** With R2 configured each register is also archived there; without it (or when it is down) the file is
still sent.

**Which file went out.** Every register is written into a private temp directory before it is sent, so two
schools' "Grade 5 A" registers marked at the same moment cannot swap. The log line `✅ Register delivered` carries
`bufferSha256` and `fileSha256` (the first 12 hex characters of the generated register and of the bytes the channel
actually uploaded, hashed where the upload reads them; they match on a healthy send, and differ if the file changed
under the upload) and no phone number. `fileSha256` is `null` when the send ran in another process (a Matrix send
relayed from the worker). A send the channel refused logs
`⚠️ Register not delivered` with `delivered: false`, and the teacher is told the attendance is saved.

### Configuration

| Variable | Default | What it does |
|---|---|---|
| `ATTENDANCE_TZ` | `UTC` | The school's timezone (IANA). Decides which day "today" is, so an early-morning mark is not filed under yesterday. |
| `ATTENDANCE_MAX_BACKDATE_DAYS` | `62` | How far back a past day can be marked or corrected. |
| `ATTENDANCE_ACADEMIC_YEAR_START_MONTH` | `4` | The month (1-12) a school year starts, used to label a new class's academic year. |

### Upgrading an existing install

Apply `infrastructure/supabase/migrations/V2.5.0__attendance_register.sql` (`node infrastructure/scripts/migrate.js`).
It is additive: `schools`, `users.school_id`, `users.role`, `teacher_attendance_records`,
`attendance_sessions.leave_count`. Two things touch existing data:

- installs that applied the legacy `bot/database/migrations/014_attendance_tables.sql` have a CHECK on
  `attendance_records.status` that rejects `leave`; the migration **widens** it (every existing row stays valid);
- records written with the legacy status `excused` are read as Leave, and their sessions' `leave_count` is
  back-filled.

## Customize

- The register's layout lives in `bot/shared/services/attendance-register.service.js` (pure: people and records
  in, a workbook out).
- The Meta Flow is [docs/flows/attendance-marking-flow.json](../flows/attendance-marking-flow.json); the text and
  modal stand-ins are in `bot/shared/services/messaging/text-flow-definitions.js` and
  `bot/shared/routes/{slack,discord}-views/attendance-marking.view.js`.
- See the [Agent Customization Guide](../agent-customization.md).

## Known limits

- A class marked twice a day (morning and afternoon) shows one cell per day.
- Weekends are Saturday and Sunday; there is no holiday calendar.
- The register is a spreadsheet sent in chat; there is no portal page for it yet.
