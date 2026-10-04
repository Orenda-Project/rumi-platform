# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.11.1] - 2026-10-04

**Rumi Messenger, for a public link, finished off.** "Rumi is typing…" now shows in Element for the whole of a slow job,
and a deployment without a lesson-plan key says so instead of failing. New caps bound lesson-plan spending per account and
for the whole instance. Found on our hosted messenger (https://chat.hellorumi.ai).

> **Upgrade notes.** No migration. To bound lesson-plan spending on a public instance, set
> `DAILY_LESSON_PLAN_CAP_REGISTERED` and `DAILY_LESSON_PLAN_CAP_TOTAL` (see `docs/running-in-public.md`); empty means no cap.

### Fixed

- **"Rumi is typing…" now shows in Element for the whole of a worker job.** In v2.11.0 the bot held the typing on
  the server through a quiz or lesson plan, but Element showed nothing after "Making it now". Element hides a
  user's typing once that user sends a message. Synapse sends a new `m.typing` only when the state changes, so
  the bot's refresh reached no client. Now, when Rumi sends a message while a job still holds the typing, the bot
  turns typing off and then on again 1 s later. Element shows "Rumi is typing…" again under the message until the
  job delivers.
- **With no `GAMMA_API_KEY`, Rumi says lesson plans are not available, instead of queueing a plan that can only
  fail.** Before this, Gamma answered 401 and the teacher was told to "try again". Typed and spoken lesson plans
  and presentations, the next-topic plan after a quiz report, and a textbook photo on the Gamma backend now get
  "Lesson plans aren’t available on this service yet.", with no job and no model call. The lesson-plan intro
  offer is skipped. A photo lesson plan goes to Kie.ai instead when a Kie.ai key is set
  (`bot/shared/services/lesson-plan-availability.js`).

### Added

- **`DAILY_LESSON_PLAN_CAP_REGISTERED`** (lesson plans per registered account per school day) and
  **`DAILY_LESSON_PLAN_CAP_TOTAL`** (every account together, counted in Redis with the same in-process fallback
  as the other caps). Empty means no cap, so existing deployments are unchanged. Over a cap the teacher gets a
  clear message, and no job is queued and Gamma is not called. Recommended public values are in
  `docs/running-in-public.md`.
- A "See it running" section in `docs/channels/matrix.md` (the hosted Rumi Messenger at https://chat.hellorumi.ai),
  linked from the README's Rumi Messenger row.

## [2.11.0] - 2026-10-04

**Anyone can start chatting on Rumi Messenger, and is offered registration.** On Matrix, a person who is not
registered gets Rumi's answer to whatever they sent first, then one optional offer: "what should I call you? … or
just keep chatting; you can type register any time". "My name is Ayesha" completes registration at once; a bare
"Ayesha" is confirmed first ("Shall I call you Ayesha? Reply yes, or tell me your name."), so one-word chat such as
"fractions" or "Shukriya" never becomes a name. A question asked while
the offer is open is answered as usual, "no thanks" closes the offer, and `register` starts it at any time.
Before this, registration on Matrix only followed a finished lesson plan, reading assessment or video, so on a
deployment with those off it never completed. WhatsApp, Slack and Discord are unchanged.

**Commands without the slash.** Element treats `/quiz` as one of its own commands and does not send it. Every Rumi
command now also works as the bare word on every channel (`menu`, `quiz`, `register`, `language`,
`reading test`, …), and on Matrix Rumi's own messages say "type quiz", not "type /quiz".

**Public limits.** Rumi can now run on a public link, where anyone can sign up. One account cannot flood it,
a stranger's account gets a small daily allowance until it finishes registration, and when the model budget
runs out teachers hear "Rumi is very busy right now" instead of an error, while the operator gets one alert
instead of thousands.

**"Rumi is typing…" lasts as long as the work.** On Rumi Messenger a teacher now sees Rumi typing from their message until
the answer arrives, including a two-minute lesson plan made by the worker, and it stops when the reply lands.

> **Upgrade notes — read before you update.**
> - **Apply `infrastructure/supabase/migrations/V2.11.0__portal_access.sql`** (additive, safe to re-run). It creates
>   the `portal_app_user` role the admin dashboard switches to and seeds `feature_permissions`. Without it, a
>   dashboard on a database built from the released SQL signs in, then fails or answers 403 on every page. If the
>   dashboard connects as another role, also `GRANT portal_app_user TO <that role>;`.
> - **Partner roles see no teacher data yet.** The admin dashboard's database role (`portal_app_user`) returns rows
>   only while the signed-in dashboard user is active and has an unscoped role: `super_admin`, `admin` or `viewer`.
>   `partner_admin` and `partner_viewer` get no teacher data through it (teachers, conversations, coaching, lesson
>   plans, videos, reading assessments and every other row-level-security table) until policies that apply a
>   partner's access scope are added. Keep partner invitations on hold, or expect partner pages to be empty; see
>   `dashboard/docs/PARTNER_RBAC_STATUS.md`. An earlier build of this migration on the release branch let any
>   signed-in dashboard user read every row; if you applied it, run the current file once by hand with `psql`.
> - The dashboard and the portal build now install with `npm ci --omit=dev`.
> - On a deployment with no WhatsApp, set `CHANNEL_DRIVER=none` on the dashboard too (and optionally
>   `PORTAL_CHAT_URL`), so the landing page and portal stop saying "through WhatsApp".
> - Tested end to end on Rumi Messenger with `CHANNEL_DRIVER=none`: registration offered and completed 9/9,
>   register any time 9/9, bare-word commands with a real topic quiz 6/6, the message cap with registration 9/9, dashboard from a production install,
>   portal copy with and without WhatsApp.
> - **The per-minute rate limit is the one limit that is on by default:** 30 text messages and 120 media messages
>   per sender per minute. Raise `INBOUND_RATE_LIMIT_PER_MINUTE` / `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE`, or set
>   them to `off`, if your teachers need more. Everything else stays off until you set it.

### Added

- **Registration offer on Matrix** (`FeatureRegistrationService.offerRegistration`, called after a general-conversation
  reply). It is sent once (remembered in Redis, or in memory when Redis is down) and skipped for anyone registered or
  already asked. `register` / `/register` on Matrix asks directly ("Let's get you registered. What should I call
  you?"). While the offer is open on Matrix, `looksLikeNameReply` tells a name from a question or request, and
  `isDeclineReply` ("no thanks", "later", "skip", romanized and native forms) closes the offer.
- **`bot/shared/services/messaging/command-words.js`**: the one list of Rumi's text commands.
  - `normalizeCommand` maps a whole-message bare command to its slash form at the top of `handleTextMessage`.
  - `isCommandText` is used by the Matrix and Baileys adapters, so a bare command typed during an active form
    leaves it.
  - `channelCommandCopy` rewrites `/quiz` to `quiz` in every outbound Matrix text, including captions and model
    replies, and never inside a URL.
  - On Matrix, `quiz <topic>` (and `quiz me on <topic>`) starts a topic quiz.
  - `paper`, `exam` and `grade` stay slash-only, because the bare words are ordinary replies.
- **`GET /api/portal/channels`** (dashboard, public) returns `{ whatsapp, chatUrl }`, using the bot's
  `CHANNEL_DRIVER` rule. The landing page and the portal pages name WhatsApp and link to it only when the
  deployment runs it; otherwise "in your chat with Rumi" and an optional "Chat with Rumi" link (`PORTAL_CHAT_URL`).
- **Schema:**
  - Role `portal_app_user`: NOLOGIN, not BYPASSRLS, granted to the role that loads the schema.
  - Grants on tables and sequences.
  - A `portal_app_user_access` policy on each RLS table. It lets rows through only when
    `portal_user_is_unscoped()` is true: the signed-in dashboard user is active and is `super_admin`, `admin` or
    `viewer`. The function is SECURITY DEFINER with a fixed search_path, so the policy on `dashboard_users` does not
    recurse.
  - `feature_permissions` seed: 18 features × `super_admin`, `admin`, `viewer`, `partner_admin`,
    `partner_viewer`.
  - All of this is in `00/01/02` and in `V2.11.0__portal_access.sql`.
- **A per-sender inbound rate limit** on every channel (WhatsApp, Slack, Discord, Matrix). It is checked in
  `handleWebhookPost`, the one entry point every channel dispatches into, before the account lookup and before
  any model call. `INBOUND_RATE_LIMIT_PER_MINUTE` defaults to 30. Media (images, documents, audio, voice
  notes, video, stickers) counts in its own bucket, `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE`, default 120, so a
  teacher can still send a class set of exam photos at once. Over the limit the sender gets one "slow down"
  per window, then silence. With Redis down, an in-process sliding window takes over instead of failing open.
  `RATE_LIMIT_BYPASS_NUMBERS` is honoured.
- **Daily caps by account tier**, per school day (`SCHOOL_TIMEZONE`): `DAILY_MESSAGE_CAP_UNREGISTERED`,
  `DAILY_MESSAGE_CAP_REGISTERED`, `DAILY_LESSON_PLAN_CAP_UNREGISTERED`, `DAILY_COACHING_CAP_UNREGISTERED` and
  `DAILY_QUIZ_CAP_UNREGISTERED`. An empty value means no cap, which is the default. Each job cap is checked where
  the job starts: lesson plans (text, voice, quiz follow-up, textbook photo), coaching (`initiateSession`),
  lesson quizzes (where it lowers `QUIZ_DAILY_CAP`) and class quizzes. `/register` and the name reply always get
  through.
- **A model budget breaker** in `llm-client.js`. A provider refusal for money (OpenRouter 402, 403 "Key limit
  exceeded", OpenAI `insufficient_quota`) trips it for `MODEL_BUDGET_COOLDOWN_SECONDS` (default 300). That
  message's own apology is replaced by one "busy" reply. New messages get "busy" once per sender, with no model
  call. One `model_budget_exhausted` alert is logged per cooldown, shared by the bot and the worker. Worker jobs
  run inside the same guard. A process that learns of the trip from Redis waits only for the shared flag's
  remaining time, so every process recovers when the cooldown ends.
- `OPENROUTER_BASE_URL`, an OpenRouter-compatible endpoint (a gateway, or a test double).
- `docs/features/public-limits.md` and `docs/running-in-public.md`: every limit with recommended public
  values, plus the Synapse-side measures (registration behind a sign-up service, random usernames, federation
  off, a scoped user directory, rate limits, the admin API off the public address). Also a section in
  `docs/channels/matrix.md`, a `.env.template` block, README rows and a SETUP step.
- `MATRIX_TYPING_MAX_SECONDS` in `.env.template`, and a "Typing and read receipts" section in
  `docs/channels/matrix.md`.

### Fixed

- A production install of the dashboard crashed with `Cannot find module 'redis'`: `redis` and `ioredis` are now
  dependencies. The portal build (`vite`, its React plugin, PostCSS, Tailwind, autoprefixer) works from
  `npm ci --omit=dev`, and `lovable-tagger` is loaded in development only.
- The daily message cap for unregistered accounts (v2.11.0 limits) let only `/register` through. It now accepts
  `register` with or without the slash. On Matrix, an open registration offer lifts the cap only for a reply that
  reads as a name (or "no thanks"), so ignoring the offer no longer uncaps the account.
- On Matrix, a pending name question no longer turns a question into a name ("How do I teach fractions?" used to
  register a teacher called "How"), and "register" typed while a name is pending is no longer taken as the name.
- `text-message.handler.js` resolved a Matrix sender (`mtx:1555…`) by slicing off the length of `matrix:`. That
  dropped the number's first digits and created a second account when a new account's first messages raced. It
  now uses the shared resolver in `channel-registry.js`.
- **"Rumi is typing…" on Matrix now ends when Rumi replies and lasts as long as the work.** Before this, a reply
  on a path whose handler never stopped its typing controller left the typing on for about 12 s after the answer.
  A lesson plan, which the worker makes in about two minutes, showed no typing at all after the bot's "I'm
  preparing…". Typing is now one session per room, run by the bot. The inbound message, a handler's controller
  or a worker job hold it, and the bot refreshes it before Matrix's timeout runs out. Rumi's reply ends it,
  whether the bot sends it or the worker does through the relay. While a worker job is still running, other
  messages to the room (the bot's "Making your test paper…", a reminder, an answer to a mid-job "thanks") leave
  it on; the job's own delivery ends it. A safety cap ends it
  after `MATRIX_TYPING_MAX_SECONDS` (default 300). Typing failures are logged and never block a reply. Read
  receipts, and the silence for group messages Rumi ignores, are unchanged.
- **The worker shows typing while it makes what a Matrix teacher asked for**: a lesson plan, photo lesson plan,
  test paper, lesson quiz or homework bundle (`bot/shared/services/messaging/job-typing.js`, wrapped around
  every job in `sqs-worker.js`).

## [2.10.0] - 2026-10-03

**Observe gets Section B: did the lesson follow its plan?** When an observed lesson was taught from a plan Rumi made
for the teacher, the coach's observation now checks the recording against that plan, move by move, with the
lesson-plan fidelity engine from v2.3.0. The coach sees every verdict pre-filled after the ratings and can change
any of them; the coach's version is the one used. The teacher's report gets the kind version — what went as planned,
the substitutions that kept the purpose named as strengths, one thing to try — and never a score.

**Sign in to the portal from Rumi Messenger.** Teachers and coaches who use only Rumi Messenger can now sign in
to the teacher portal. The portal still signs people in with a phone number and a password. What changed is
where the setup link and the password reset code go: to the person's own chat with Rumi. That is their
WhatsApp, their Rumi Messenger DM, or their Slack or Discord account, and it works on a deployment with no
WhatsApp at all (`CHANNEL_DRIVER=none`).

> **Upgrade notes — read before you update.**
> - **Set `INTERNAL_API_KEY` to the same secret on the bot and the dashboard**, or portal reset codes stop. An unset
>   key used to let every call to the bot's internal API through; it now refuses them all.
> - Section B is on when both `OBSERVE_ENABLED=true` and `LP_FIDELITY_ENABLED=true`. No migration: results live in
>   `coaching_sessions.analysis_data` (`lp_fidelity`, `section_b`). With fidelity off, observations behave as in v2.6.0.
> - Tested end to end on Rumi Messenger with real models: Section B 5 of 5 scenarios (a coach's correction re-scores
>   83.3% → 91.7%; a swap that kept the purpose earns full credit and is named as a strength; no plan → not assessed,
>   with the cause named), portal sign-in 5 of 5.

### Added

- **Linking the plan.** Once Rumi knows whose lesson it is (the visit picker, or "who did you observe?"), the coach is
  asked which of that teacher's recent Rumi plans the lesson was taught from, or **No plan** (a list on Meta,
  numbered text elsewhere; `observe_lp_<sessionId>_<n|none>`). The pick goes through the same linker as a teacher's
  own session, owned by the teacher, so a coach can only link the observed teacher's own plan. A teacher with no
  plans is not asked about. The analysis waits for an open question at most `LP_FIDELITY_PLAN_WAIT_SECONDS`; a pick
  that lands after the analysis, while the form is still open, grades Section B then.
- **Grading.** The analysis runs `computeFidelityForSession` on the observation's transcript (the same input contract:
  no `[MM:SS]` timings → refused in code, no model call). It stores `analysis_data.lp_fidelity` and
  `analysis_data.section_b = { status: 'assessed' | 'not_assessed', reason, detail }`.
- **The coach reviews it in chat.** After the last Section A domain, Section B arrives six moves a message: the plan's
  move, the verdict, the quoted moment. `ok` keeps a page; `<move> <verdict 1-6>` changes one. Ratings and verdicts
  are saved in one write; the coach's verdicts go back through the same scorer (`observer_edited`, `coach_verdict`),
  and the AI's first pass stays in `autofill_analysis_data`. On Meta, the published form Flow has no Section B
  screen, so Section B follows in chat after the Flow is submitted.
- **Not assessed, and why.** No plan (the teacher has none, the coach said none, nobody answered, or the teacher was
  not known), no timings, an unusable recording, an unreadable plan or a grader failure: Section B is left out with
  `status: 'not_assessed'` — never a zero — and the coach gets one message naming the actual state.
- **The teacher's kind version.** One more message in the teacher's package, after the report and before the
  companion note, built from the coach's verdicts. No percentage, band or count; every line passes the observe trust
  firewall, and the coach previews it first. No note when nothing was assessed or the lesson did not match its plan.
- **The coach portal** shows a collapsible "Lesson plan (Section B)" block under each observation: the moves with a
  verdict chip each and "changed by you" marks, or "Not assessed — <reason>". No score, band or quote
  (`sectionB` in `/api/portal/coach/*`).
- Docs: a Section B chapter in `docs/features/observe.md` (with "In programme terms": fidelity of implementation inside
  the coaching visit), a cross-reference in `lesson-plan-fidelity.md`, the README row and an `.env.template` note.
- **`observe-roster.js portal-invite <coach-phone>`** sends a coach the portal setup link on the channel they
  use, so a coach who uses only the messenger can get it before ever writing to Rumi. Their invite names the
  portal's **Observations** view.
- **`docs/features/teacher-portal.md`** covers who can sign in, where the link and the code go, what a
  messenger user with no phone number sees and how an operator fixes it, the variables on each service, and the
  setup steps. Also new: a portal section in `docs/channels/matrix.md`, README and feature-index rows, SETUP
  steps, and comments on the dashboard-to-bot block in `.env.template`.

### Changed

- The hero report renderer never sees `lp_fidelity` or `section_b` (`teacherSafeAnalysis` removes them).
- The debrief guide is given the coach-reviewed moves (phase, text, verdict, quote) and never the measurement.
- Observations now run the fidelity task in the analysis (they skipped it in v2.6.0); the reflective corpus is still
  skipped for them.
- The password reset code goes to the user's channel identity (the channel they last used, from
  `user_channels`), not to the number typed on the portal. The dashboard now passes the `userId` it found; a
  dashboard that sends only the number still works.
- Off WhatsApp, the setup link says which number to sign in with. WhatsApp copy is unchanged.
- Someone with no phone number to sign in with (a Matrix username that is a name, or a Slack or Discord
  account) gets an explanation from `/portal` and no setup link. Registration ends without a portal link for
  them.
- A coach on the roster whose Matrix username is their phone number has it recorded when the invite is sent,
  under the bot's own rule: only if no other user holds it.
- The portal's reset pages say "your chat with Rumi" instead of "WhatsApp" and use a fictional example number.
  The sign-in page says which number a Rumi Messenger user signs in with.
- `observe/observe-identity.js` moved to `messaging/user-identity.js`. The old path re-exports it.
- Portal setup tokens now come from `crypto.randomUUID()` instead of the `uuid` package.

### Fixed

- On a messenger-only deployment, a teacher who used only Rumi Messenger never got a reset code.
- The bot's reset endpoint required a first name, so anyone Rumi did not know by name yet got no code.
- A code the bot could not send rate-limited the teacher for 10 minutes. It is now cleared.
- A failed invite send was reported as sent.
- `/api/internal/send-password-reset` accepted any call while `INTERNAL_API_KEY` was unset on the bot. It now
  refuses every call in that case.
- The dashboard (which serves the portal) crashed at boot without `RESEND_API_KEY`.
- The portal dashboard said "Welcome back, !" to someone without a name on file.
- A phone number already held by two users could be recorded for a third (the taken-check read an error as
  "free").

No schema change and no new environment variables. `PORTAL_URL`, `MAIN_BOT_URL` and `INTERNAL_API_KEY` already
existed. **Upgrading: set `INTERNAL_API_KEY` to the same secret on the bot and the dashboard, or reset codes
stop.** An unset key used to let every call through.

### Not in this release

- Uploading or pasting a plan in the coach's flow (only plans Rumi made for the teacher can be linked).
- A Section B screen in the Meta form Flow (Section B follows in chat).
- The teacher's "done your own way" line names the planned move it replaced, not the teacher's own activity.
- Signing in to the portal with a Matrix, Slack or Discord identity instead of a phone number: a messenger user whose
  username is a name needs an operator to record a phone number (`docs/features/teacher-portal.md`).

## [2.9.0] - 2026-10-03

**The lesson quiz.** A teacher has no time to write homework, and no time to mark forty copies of it. Rumi
now writes a quiz on the lesson just taught (from the coaching recording), on a lesson plan Rumi made, or on
any topic. It comes with a one-page PDF for the teacher that explains every question, and one message the
teacher forwards to the class. Each child answers in their own chat and gets a reason after every answer. The
next morning the teacher gets a class report saying what to reteach.


> **Upgrade notes.** Existing Supabase deployments: run `node infrastructure/scripts/migrate.js` (migration
> `V2.9.0__lesson_quiz.sql`, additive and safe to re-run). Set `SCHOOL_TIMEZONE` so the nudge and the next-morning
> report land in school time. Tested end to end on Rumi Messenger with real models: 11 of 12 scenarios pass; in
> 8 real quizzes the default model never wrote a "select all that apply" question (typed multi-select answers
> do score correctly).
### Added

- **The offer after a coaching report.** A few minutes after the report, Rumi asks once whether the teacher
  wants a quiz on that lesson. On yes, Rumi asks for the quiz language (only when the deployment offers more
  than one), then sends the teacher PDF and the forwardable class message. While the offer is on its way, the
  classic Trigger-3 quiz offer and the "what next" suggestion are held back.
- **`/quiz` is the lesson-quiz menu.** It lists recent lessons and Rumi lesson plans with their quiz state
  (*no quiz yet*, *being made*, *sent · N started*, *report sent*), *Quiz on any topic*, *Video quizzes*, and the
  classic *Quiz to parents' phones*. On channels without native lists it is a numbered list. `/quiz <topic>`
  starts a topic quiz directly.
- **Children join on every channel.** On WhatsApp the class message carries a `wa.me` link. On Matrix it
  carries a `matrix.to` link to the bot plus the join code. Elsewhere it carries the code alone. Any channel
  accepts `join <CODE>`. Children answer by typed letters (`B`, `b.`, `2`, `A C` for "select all that apply"),
  and `STOP` ends the quiz. Score cards and class cards are sent as images through `sendImage`. A report counts
  each child's first completed attempt. Class cards show other children by first name only.
- **The authoring pipeline.** A lesson digest; an author whose output is validated and repaired; a blind
  answer-key check on a second model (it fails open, and the row records the quiz as unverified); question
  pictures from a vendored diagram engine; KaTeX maths (required lazily); and the teacher PDF. A plan quiz
  says *What you planned* and a topic quiz says what it covers. Neither ever says *what you taught*.
- **The 6-hour nudge.** If fewer than five children have started after six hours, the teacher gets one nudge.
  It is never sent twice and never in quiet hours. **The class report** arrives next morning in school time,
  with a *For tomorrow* reteach box.
- **Deployment settings, not constants.**
  - `SCHOOL_TIMEZONE` and `QUIET_HOURS` (new `bot/shared/config/school-clock.js`).
  - `QUIZ_LANGUAGES`: an English catalogue plus an `ur` pack. A language without a catalogue falls back to
    English copy.
  - `QUIZ_DAILY_CAP`, counted per school day.
  - The three quiz models (`TRANSCRIPT_QUIZ_MODEL`, `TRANSCRIPT_QUIZ_VERIFY_MODEL`, `QUIZ_REPORT_MODEL`) are
    jobs in the model registry. Their defaults run on one OpenRouter key, with OpenAI ids under
    `LLM_PROVIDER=openai`.
  - `TRANSCRIPT_QUIZ_STALE_MINUTES` (default 30): a quiz stuck in *being made* can be made again.
- **Works without object storage.** Without `R2_*`, question cards and figures are kept on local disk and sent
  from there (Baileys, Slack, Discord, Matrix; the Meta driver needs R2).
- **A `lesson_quiz` feature entry** with a console switch (`RUMI_FEATURE_LESSON_QUIZ=off`), a *Lesson quiz*
  block in `.env.template`, `docs/features/lesson-quiz.md` and a README row.

### Changed

- **Video quizzes (v1.2.0)** keep their region gate, which now applies only to quizzes with a video, so a
  lesson-quiz code joins on any deployment. With video quizzes off for the region, a video quiz's code goes to
  ordinary chat as before. Typed letters are read only during a lesson quiz; a video quiz is answered as
  before, and other text during it goes to chat.
- **Share codes** are drawn from `crypto.randomInt`, and a sender who sends 5 wrong codes in 10 minutes gets
  no reply to further codes until the window passes (needs Redis). Each class report goes to the chat recorded
  on its own share code (`quiz_share_codes.teacher_to`).
- **Quiz renders** (figures, cards, the teacher PDF, the class report) run in headless Chromium with JavaScript
  off and no network apart from `data:` and `about:` (`htmlToPdf`/`htmlToImage` gain an opt-in
  `{ untrusted: true }`; other callers are unchanged).
- **Schema (additive).** `quizzes` gains `coaching_session_id`, `language` and `meta jsonb`, the statuses
  `offered | declined | skipped`, and one-quiz-per-lesson unique indexes for transcript and lesson-plan
  quizzes; `quiz_share_codes` gains `teacher_to`. The upgrade is
  `infrastructure/supabase/migrations/V2.9.0__lesson_quiz.sql`: all or nothing, safe to re-run.

### Fixed

- **The worker polls the quiz queue on `QUEUE_DRIVER=bullmq`.** Before, quiz jobs queued on BullMQ ran only
  when `SQS_QUIZ_QUEUE_URL` was also set.
- **The classic quiz resumes only its own sessions** after a Redis miss; a child in a class quiz who typed a
  word was told to "Reply Start Quiz".
- **`migrate.js` no longer reports an applied migration as failed.** V1.0.0, V2.4.0 and V2.9.0 record their own
  version; migrate.js then recorded it again, hit the key, and exited 1 on a fresh database although every
  migration had applied. It now records with an upsert that ignores a duplicate.
- **Re-running `00_complete-schema.sql`** over a database built before 2.9.0 now widens the quiz status check;
  before, it kept the old one and rejected the new quiz statuses.
- **On Slack and Discord, list rows show their description**, so a video quiz with long options shows the
  options, not just "A / B / C / D".
- **Right-to-left quiz languages.** A child's question card and figure take their direction from the language
  registry, so every right-to-left language is laid out right to left, not only Urdu.
- **`.env.template` on the quiz queue.** Without `SQS_QUIZ_QUEUE_URL`, delayed quiz jobs are not dropped: on the
  FIFO main queue they run at once. The note now says so.

### Security

- A model-chosen figure colour and a child-typed class name could inject markup into pages the server's
  browser renders. Both are now escaped, colours are limited to the engine's tokens and hex values, and quiz
  renders run with no script and no network.
- Lesson transcripts, plan text and typed topics go into prompts fenced as data, with an instruction never to
  follow what is inside.
- Logs carry the last four digits of a phone number, not the number, on the quiz join and student-video paths.

### Removed

- `molecule` as a lesson-quiz figure type (it needs an optional chemistry library that is not installed); the
  vendored diagram engine's default currency symbol and its dev-only `engine: "schemdraw"` circuit option.

## [2.8.0] - 2026-10-03

**Your programme's own app.** A school system can now publish its own Android apps under its own name, rather
than renting the channel from a commercial platform whose per-message prices keep rising. The first is **Rumi
Messenger**, a branded chat app (a fork of Element X) that signs in to the system's own server: teachers get
colleagues, groups and calls, end-to-end encrypted, with Rumi as one of their contacts. The second is optional:
the teacher **portal** (dashboard, lesson plans, coaching, reading results) wrapped as an app that updates
whenever the portal does, with no reinstall.

> **Needs the Rumi Messenger channel (v2.7.0)** for the chat app: a Matrix homeserver with Rumi on it,
> set up from [docs/channels/matrix.md](docs/channels/matrix.md). The portal app needs only your deployed
> portal. Tested on an Android emulator against a local homeserver and portal: 7 of 8 scenarios pass;
> a call ringing with the app closed is not yet proven. Android only.

### Added

- **`docs/android-app.md`** — the adopter guide for Rumi Messenger for Android (`Orenda-Project/element-x-android`,
  branch `rumi-brand`, AGPL-3.0): what it is and what it needs (a Matrix server with Rumi on it), the white-label
  checklist (every value to change, with its path in the fork), debug and signed release builds, publishing an
  APK on GitHub Releases, optional Google Play, keystore custody, the AGPL-3.0 obligations in plain words, and
  sign-in troubleshooting.
- **The portal as an Android app** — `portal/android/` (Capacitor 8) and `portal/capacitor.config.ts`, driven by
  one config, `portal/.env.app` (environment wins): package id (neutral default `org.example.rumi.portal`),
  launcher label, portal API url, and an over-the-air switch. `npm run android:debug` / `android:release`.
  Runtime: the portal decides "portal or marketing site?" and "where is the API?" through
  `src/lib/app-target.cjs` instead of hostname sniffing; tapped `/portal/dashboard` and `/portal/login` links open
  the app (Android App Links); the hardware back key closes dialogs, goes back, or leaves from a home page; the
  session survives a force-close; `/` and `/portal/login` forward a signed-in teacher to the dashboard.
- **Over-the-air updates** (`PORTAL_APP_OTA=1`): the app loads the portal from your server on launch, so a web
  deploy updates every installed app; if the portal is unreachable at launch, a bundled "Can't reach the portal"
  page offers Try again.
- **Guards that make the wrong build unbuildable** — an app-mode bundle without an absolute https API url refuses
  to build; Gradle refuses without an https App Links host, and refuses a release build with the placeholder
  package id.
- **Portal API** — with `PORTAL_APP_ENABLED=true`, the Capacitor app origins (`https://localhost`,
  `capacitor://localhost`) join the portal's CORS allow-list, and a portal login made from the app gets a
  `SameSite=None` cookie for that session only; web and admin sessions always stay `SameSite=Lax`;
  `/.well-known/assetlinks.json` is published from `ANDROID_APP_PACKAGE` + `ANDROID_APP_SHA256_FINGERPRINTS`.
- `portal/ANDROID.md`, `docs/features/android-portal-app.md`, README and SETUP sections, a portal-app block in
  `.env.template`, vitest for the portal's components, and `.github/workflows/portal-android-debug.yml`, which
  builds a debug APK on every PR that touches `portal/**`.

### Fixed

- The reading-assessment PDF link no longer hard-codes `http://localhost:4000` outside production; every portal
  request goes through one API base.
- The portal login placeholder is a fictional `1555…` number.
- Eleven compiled Python files (`.pyc`) under `curriculum/` are no longer tracked; a test keeps them out.

## [2.7.0] - 2026-10-03

**Rumi Messenger — run Rumi on your own messenger.** A school system can now run Rumi on a Matrix homeserver
it owns: teachers sign in to a Rumi-branded app with their phone number and find Rumi already there as a
contact. Every message, voice note and PDF is end-to-end encrypted, there is no per-message fee and no
third-party review, and it is the same Rumi. It runs alongside WhatsApp, or with `CHANNEL_DRIVER=none`
instead of it. This release also makes a laptop a supported place to run Rumi (no Supabase account, no
Docker).

> **Upgrade notes — read before you update.**
> - **Breaking: Node 22 is now the minimum (Node 20 is end-of-life). Upgrade Node before updating;
>   `install.sh` now refuses older versions, and on Railway the build picks the version up from `engines`.**
> - **Existing Supabase deployments: run `node infrastructure/scripts/migrate.js`** (migration
>   `V2.7.0__exec_sql_service_role_only.sql`). Earlier copies of the one-time `exec_sql` helper could be
>   called with the anon key, which runs any SQL as `postgres`. The migration revokes that and fails loudly
>   if it cannot.
> - Matrix: every process that sends to Matrix (bot, queue worker, crons) needs the same
>   `MATRIX_ACCESS_TOKEN` and `MATRIX_HOMESERVER_URL`; deploy the bot and its workers together.

### Added

- **The Matrix channel** (`MATRIX_HOMESERVER_URL` + `MATRIX_ACCESS_TOKEN`). It is built on #104 by
  @oyekamal: a persistent sync connection, the inbound adapter, the outbound driver and E2EE media both
  ways. Buttons become numbered menus, WhatsApp Flows become one question per message, and in staff group
  rooms Rumi stays quiet until it is addressed. Server and apps:
  [rumi-messenger](https://github.com/Orenda-Project/rumi-messenger). Guide, including a feature parity
  table from a scripted end-to-end run: `docs/channels/matrix.md`.
- **Encryption that fails closed.** `MATRIX_E2EE=on` is the default. If the crypto module cannot load, the
  Matrix channel refuses to start with a clear error, and `rumi doctor` says why. Only `MATRIX_E2EE=off`
  runs it without encryption. Sends fail closed too: when the bot cannot confirm whether a room is
  encrypted, it does not send, rather than risk plaintext. Encryption works on Node 22 or newer.
- **Only your homeserver reaches Rumi** (`MATRIX_ALLOWED_SERVERS`, blank = the bot's own server). Invites
  from other servers are declined and their users' messages ignored. A teacher's identity names their
  account on your server; the number in a username is admin-asserted, so run the homeserver with
  admin-created accounts and federation off (`docs/channels/matrix.md`, "Who can reach Rumi").
- **One connection, many senders.** The bot owns the Matrix connection, and every other process (the queue
  worker, the stale-session cron, the Morning Brief worker, scripts) sends through it over Redis by
  default. Each queued send is signed with a key derived from the access token and namespaced per bot
  account, and the bot never reads a file path from a queued send.
- **Staff group rooms.** Rumi answers an addressed message in the group; reports, registers, reminders and
  every later message for that teacher go to their own DM.
- **No lost messages on restart.** Messages teachers sent while the bot was down are answered when it comes
  back, exactly once.
- **`CHANNEL_DRIVER=none`** — a deployment with no WhatsApp at all. It needs no WhatsApp keys, does no
  Graph call at boot, and fails loudly on a bare phone number. `rumi doctor`, the console ("Answering on
  Rumi Messenger (Matrix) — no WhatsApp number.") and `rumi setup` all support it.
- **`rumi setup` Matrix step.** It reads rumi-messenger's `deploy/rumi-channel.env` or asks for the URL and
  token and checks the connection and whether encryption can start. The console has a Matrix card and a
  `RUMI_FEATURE_CHANNEL_MATRIX` switch.
- **Matrix in `/health`.** `channels.matrix` is `connected`, `connecting` or `down`; a Matrix-only
  deployment whose homeserver is unreachable reports `degraded` (still HTTP 200). A homeserver that is down
  when the bot starts is retried with backoff.
- **Run Rumi on a laptop** — `infrastructure/local/up.sh` / `down.sh`. They run a private Postgres,
  PostgREST, a `/rest/v1` proxy and Redis, with a minted service key. See `docs/local-stack.md`. They add
  `SUPABASE_DB_SSL=off` (dashboard and portal against a Postgres without SSL) and `R2_FORCE_PATH_STYLE`
  (MinIO and other S3-compatible stores).
- **Channel-aware Flow gates** (`channel-capabilities.js`). On a channel that cannot draw a WhatsApp Flow,
  the following take the text path even when their Flow ids are set for Meta:
  - registration, and Reading from the menu;
  - exam confirmation;
  - `/status`, homework and edit class;
  - the quiz flows.
### Fixed

- **Identities.** Two Matrix teachers whose numbers differ only in their first digits are no longer merged
  into one user. A Matrix teacher's phone number is recorded, so they can sign in to the portal.
- **Registration.** A greeting is no longer taken as a teacher's name, and a name that is also a greeting
  ("Salam") is asked about once and then accepted. "null" is never a name, and a missing name part is never
  printed as "null" (reports, filenames, reminders).
- **Matrix media and replies.**
  - Spoken replies are voice messages.
  - Captions render formatting.
  - Spreadsheets carry their real mime type.
  - An audio file reaches classroom coaching.
  - Object keys are safe for Matrix ids.
- **After a restart,** proactive Matrix sends (reminders, delivered reports) go to the DM the teacher last
  wrote from, not the room the DM first opened in. A group room is never used for them.
- **Feature switches for channels** (`RUMI_FEATURE_CHANNEL_MATRIX`, `_SLACK`, `_DISCORD` set to `off`) now
  stop the channel from the next restart; before, they changed only the console.
- **A future-stamped Matrix event** no longer makes the bot ignore messages after a restart.
- **On Meta, a Flow that fails to open** (a passing Graph error) says "try again", not "not set up".
- **WhatsApp-free copy.** The boot banner shows Meta webhook steps only for `CHANNEL_DRIVER=meta`; doctor
  and the console no longer assume a WhatsApp driver.
- **Local stack.** `up.sh` refuses to adopt a non-empty directory it did not create, and `down.sh --wipe`
  deletes only what the stack made. The anon and authenticated keys get Supabase's table grants, so Row
  Level Security behaves as it does on hosted Supabase.
- **Text channels** (Matrix, Baileys) render reply-button interactives as numbered menus. The exam checker's
  "Process now" used to have nothing to answer.
- **Versions.** `/health`, the boot banner, the console and the dashboard report the real version;
  `bot/VERSION` is gone, and `dashboard/package.json` now moves in lockstep with the root and bot versions.
- **`migrate.js` records what it applies.** It wrote `filename` and `checksum` columns that
  `schema_versions` does not have, so every migration ran but none was recorded, and each run re-applied
  them all and reported errors. It now writes the filename and checksum into `description`. The test-paper
  migration recorded itself as 2.8.0 (left over from a rename); it now records 2.4.0, and `V2.7.0` removes
  the stray 2.8.0 row.
- **`rumi doctor`** no longer probes channels whose keys are not set.
- **The console** no longer shows a quoted `.env` value as a pending change.

### Changed

- **Node 22 or newer** (`engines.node >=22` in root, bot and dashboard; `install.sh` and the local stack
  check it; CI on Node 22 and 24).
- **Matrix identities name the account.** `@+15550100001` on the bot's own server is `mtx:15550100001`; an
  older `@t15550100001` username is a separate teacher (`mtx:t15550100001`, no phone number recorded), and
  an account on any other server keeps its full id.
- **Security notes.** `SECURITY.md` records the `request` advisories that `matrix-bot-sdk` brings in and why
  they are accepted (its only peer is your own homeserver).

## [2.6.0] - 2026-10-02

**Observe — the coach's assistant.** Most school systems already employ people whose job is to coach
teachers; their visits are inconsistent and leave no record. `/observe` makes anyone who visits classrooms a
better coach: Rumi rates the lesson from a recording, scripts the feedback conversation, then listens to that
conversation and coaches the coach — while the teacher only ever receives something kind and useful, never a
score. And it keeps the coach organised: who is due, what is overdue, what is unfinished. It works the same
way on WhatsApp (Meta or sandbox), Matrix, Slack and Discord.

### Added

- **Capture.** `/observe` (behind `OBSERVE_ENABLED=true` and the coach role family `OBSERVE_LEADER_ROLES`)
  arms a recording; a voice note or an audio file becomes a `leader_observation` on the existing coaching
  pipeline, owned by the observed teacher with the coach as `observer_user_id`. One audio router holds the
  invariant that a coach's classroom-length recording never starts self-coaching — it resolves the real
  duration itself (Matrix sends none), and an unarmed recording is parked and the coach is asked whose it
  is, several in flight at once (oldest first, nothing lost). "Classroom-length" is the line the
  self-coaching path draws (`COACHING_MIN_AUDIO_SECONDS`). A bare capture asks "who did you observe?".
- **The AI's draft and the coach's edit.** The analysis is rated against an observation framework —
  `OBSERVE_FRAMEWORK=teach` (default, the public TEACH tool), `hots` or `mewaka` — and the coach reviews it
  one domain per message (`ok`, or `2 5`). The AI's first pass (v1) is frozen; the coach's version (v2) is
  what everything downstream uses, and what they changed is recorded. On Meta, an editable WhatsApp Flow
  (`OBSERVE_FORM_FLOW_ID`, generated by `bot/scripts/generate-observe-flow-json.js` and registered by
  `rumi setup`) can replace the chat form.
- **The debrief and coach-the-coach.** A six-step guide for the feedback conversation; the coach records
  the conversation and gets two things they did well (in their own words) and one thing to try — never a
  score. A **harm gate** in code: a coach who belittled the teacher gets no praise, an honest concern and
  one move instead. A retry sweep re-queues a debrief whose transcription failed.
- **The teacher's report.** Previewed by the coach, then delivered to the teacher on their own channel
  (direct off Meta; inside the 24-hour window or by `OBSERVE_REPORT_TEMPLATE` on Meta; optionally through a
  review number with `OBSERVE_REVIEW_MODE=operator`). A **trust firewall** checks the package before
  anything is sent: no score, no rating, none of the coach's private feedback. Sweeps remind a coach about
  a report never sent and nudge a teacher who never opened an invite.
- **Organised.** The `/observe` menu lists what is waiting — ratings to check, debriefs to do, reports to
  send, a stopped step to run again — oldest first, each row resuming exactly its step; a visit picker
  (school → teacher → a brief that is guidance, not a grade); "Plan a visit" and "My schedule" (overdue
  flagged, cleared automatically when the lesson is recorded); optional Google Calendar invites
  (`OBSERVE_CALENDAR_ENABLED`, off by default).
- **The coach's view in the portal** — `/portal/observe`: upcoming and overdue visits, what is waiting on
  the coach, completed observations and their teachers, with no score anywhere a teacher could see it.
- **A derived roster** — a coach holds schools; a teacher belongs to a school through `users.school_id` —
  managed with `node bot/scripts/observe-roster.js` (`grant-coach`, `add-school`, `add-teacher`, `import`,
  `list`, `set-email`).
- Schema: `coaching_sessions` + `observation_type`, `observer_user_id`, `autofill_analysis_data`,
  `debrief_status`; `users` + `role`, `school_id`; new `schools`, `leader_schools`, `observation_schedules`,
  `coach_directory`. All additive — migration `V2.6.0__observe_coach_assistant.sql` for existing databases.
- `docs/features/observe.md`, an Observe block in `.env.template`, an `observe` row in `rumi status` /
  `doctor` / the console (with its `RUMI_FEATURE_OBSERVE` switch).

### Changed

- A coach's observation of a teacher is never one of the teacher's own numbers. The teacher portal's pages
  (dashboard, sessions, analytics), the teacher's self-coaching score trend and prior-feedback context, the
  chat context, `/status` and the "is the teacher busy" checks, the unfinished-session prompt, the coaching
  spreadsheet export and the Morning Brief's coaching counts and averages all leave out observations
  (`coaching_sessions.observation_type IS NULL`). **Apply the V2.6.0 migration before deploying the
  dashboard** (even with Observe off) — its teacher pages read the new column. The bot checks for the column
  at start-up: without it, it logs an error asking for the migration and computes teachers' coaching exactly
  as before (restart the bot and worker after applying it).
- The portal's coach view honours `OBSERVE_ENABLED` too (set it on the dashboard service as well as the bot);
  off, the coach endpoints answer 404 and the nav item is hidden.
- Coaching jobs that run more than once per session (a report preview then its delivery; each debrief
  recording) are no longer dropped as duplicates: the phase / nonce is part of a job's dedup identity in both
  queue drivers.
- A teacher report's "Send now / Someone else / Cancel" buttons belong to one preview and one coach: a
  button from an older preview (after Cancel, or after the coach picked someone else) or from anyone but the
  observer sends nothing, and the worker re-checks before it sends. Each preview and each retry is its own
  queue job, so on the default SQS driver a second preview or a retry after a failed send is no longer
  dropped as a duplicate.
- `generateHeroReport` takes an opt-in `scoreless` render (used for the teacher's observation report); the
  default render is unchanged.

### Fixed

- A classroom recording is transcribed and analysed when object storage (R2) is not configured — the
  archive copy is skipped instead of failing the job (this also fixes a teacher's own coaching on such a
  deployment).

## [2.5.1] - 2026-10-02

**A fresh install works again.** 2.5.0 shipped a stray merge-conflict line (`=======`) in
`infrastructure/supabase/00_complete-schema.sql`, so creating the schema on a new database stopped with a syntax
error (and `01_rls-policies.sql` then failed on the missing `teacher_nudges` table). Deployments that upgrade through
the versioned migrations were not affected. If you installed 2.5.0 from scratch, re-run the three schema files from
2.5.1 on an empty database.

### Fixed

- `00_complete-schema.sql`: the stray conflict-marker line is removed; `00`, `01` and `02` apply cleanly to an empty
  Postgres with `ON_ERROR_STOP`.

### Added

- `tests/setup/no-conflict-markers.test.js`: CI fails if any tracked text file (SQL, JS, Markdown, YAML, the env
  template, …) contains a merge-conflict marker line.

## [2.5.0] - 2026-10-02

**A register the school can file.** After every mark, Rumi sends back the month's attendance register — one
row per person, one column per day, weekends greyed, running totals, and approved **Leave** as its own status —
regenerated whole, so the newest file always holds the whole month. A teacher's "attendance" is their class; a
head teacher's is the school's staff. A past day can be named and corrected, and the correction rebuilds the
month. Plus **teacher nudges**: one friendly check-in for a teacher who has gone quiet, never twice for the
same silence.

### Added

- **Leave on every marking surface** — the native WhatsApp Flow gains an *On leave* checkbox group
  (re-publish `docs/flows/attendance-marking-flow.json`); the text stand-in (Baileys, Matrix) takes one reply,
  `2, 5 leave 3`; the Slack and Discord tap-to-mark modals gain a leave picker; voice roll call records
  "on leave" as leave. Someone named in both lists counts once, as leave.
- **Staff attendance and the staff register** — a head teacher (`users.role = 'head_teacher'`; `principal`
  and `school_leader` are read as the same role, never written) marks the school's staff by voice, by tapping, or "everyone present", and
  gets the month's staff register back. Staff are everyone linked to the school except the person marking;
  colleagues who never use the bot can be added by name. "class attendance" still reaches a class they teach.
- **`bot/scripts/attendance/link-school.js`** — links a school (optional external id: `--ext-id`, stored as `schools.ext_id`), its head
  teacher and its staff, naming people by `users.id`, WhatsApp number or channel identity. Idempotent.
- **Two rates, one per register** — staff: present ÷ (present + absent), approved leave excused; class:
  present ÷ every marked day, because a child on leave was not in the room.
- **Name a day** — `attendance yesterday`, `attendance 30 sep`, `attendance 2026-09-30` mark or correct that
  day; future days and days older than `ATTENDANCE_MAX_BACKDATE_DAYS` (default 62) are refused in words.
- **Teacher nudges** — `bot/shared/services/nudges/`: one `teacher_nudges` table, a sweeper with a registry
  of nudge kinds, an idempotent booking and a single-flight claim (two replicas never send twice), a kill
  switch (`TEACHER_NUDGES_ENABLED`, also `RUMI_FEATURE_TEACHER_NUDGES=off`), a per-tick cap, quiet hours and
  a timezone. One kind ships: `re_engage`, a check-in for a teacher silent for `TEACHER_NUDGES_QUIET_MINUTES`,
  once per quiet spell; on the Meta WhatsApp Cloud driver only inside the 24-hour window. The SQS worker
  sweeps every `TEACHER_NUDGES_SWEEP_MINUTES`, or run `bot/workers/teacher-nudges.worker.js` from cron.
- `docs/features/attendance.md` (rewritten), `docs/features/teacher-nudges.md`, `ATTENDANCE_*` and
  `TEACHER_NUDGES_*` blocks in `.env.template`, a `teacher_nudges` entry in `FEATURES`, SETUP.md steps.

### Changed

- **Re-marking a day replaces it** instead of stopping at "Attendance Already Recorded", and the whole month's
  register is regenerated, so the corrected file still holds every other day. The new records are written
  before the old ones are removed (and taken back out if that fails), so a correction that fails leaves the
  day on file; only the teacher whose
  class it is can mark or replace its days.
- A number after "class", "grade" or "section" is never read as a day ("attendance grade 5/6"), a month must
  be a whole word, every date in the message is considered, and a bare `d/m` outside the correction window
  opens today. The method menu always names the day being marked, today included.
- `TEACHER_NUDGES_TZ` left blank uses `ATTENDANCE_TZ`. The feature list shows teacher nudges as available only
  when `TEACHER_NUDGES_ENABLED` is on (a FEATURES entry may now name `flags`, switches that must read on).
- "Everyone present" is a numbered option (`3`) and is recorded as `everyone_present`.
- The academic year's start month is `ATTENDANCE_ACADEMIC_YEAR_START_MONTH` (default 4, the previous
  behaviour). "Today" is the school's today, in `ATTENDANCE_TZ` (default UTC).
- The text handler's attendance blocks moved to `attendance-entry.service.js` (one place a result becomes
  messages).

### Fixed

- A child on approved leave was written into the register as **A**; voice roll call filed "on leave" as absent.
- The register placed a day one column early west of UTC, and the month query dropped the month's last day
  east of UTC.
- Without R2 (or with R2 down) the register was generated and never sent; a refused send was reported as
  delivered; the file was lost to `ENOENT` where the temp folder did not exist yet.
- The sixth attendance start in five minutes got no reply at all.
- Where the marking form could not be sent, the fallback offered "1" and "3", which the session then did not
  accept.
- The Meta Flow's data endpoint read `getStudentListById`'s `{ data }` as the row.

### Database

- Migration `V2.5.0__attendance_register.sql` (additive): `schools` (the shared definition: `id`, `ext_id`,
  `name`, `district`, timestamps — the same DDL as the coach-observation migration, whichever runs first), `users.school_id`, `users.role`,
  `teacher_attendance_records`, `attendance_sessions.leave_count`. **Where the legacy CHECK on
  `attendance_records.status` exists, it is widened to accept `leave`** (every existing row stays valid);
  legacy `excused` records are read as Leave and their sessions' `leave_count` is back-filled.
- Migration `V2.5.1__teacher_nudges.sql` (additive): `teacher_nudges`, `users(last_message_at)` index,
  `user_channels.reply_identifier` (the exact identifier a teacher last wrote from, so a proactive send
  delivers back to it).

## [2.4.0] - 2026-10-02

**Make a test from the book.** A teacher picks a chapter — or a whole unit — from material the deployment
already has (a textbook loaded from the curriculum pipeline, the teacher's own lesson plans, or a chapter
they upload) and gets a printable test paper with a separate answer key in the chat, in about a minute. It
works in any language the model writes, right-to-left papers included; every edit makes a new version, and
"my papers" re-sends any of them. A paper is only ever built from real material: with nothing to build it
from, the teacher is told so instead of getting an invented one.

### Added

- **`/testpaper`** (alias **`/paper`**, optionally with a subject and grade: `/testpaper science 8`) and **`/mypapers`** —
  source → chapter(s) (one, several, a range or all) → size (quick 10 / standard 20 / full 30, or a typed mix
  such as "5 MCQs, 3 true/false, 2 short") → paper language → paper + answer key PDFs → Edit / New paper / My
  papers. Every pick is an interactive list or reply buttons through the messaging facade: native on
  WhatsApp, a numbered menu on Baileys, Matrix, Slack and Discord. No WhatsApp Flow needed. Past six loaded
  books, a "Textbooks (N)" row opens a numbered list of every book.
- **`bot/shared/services/testpaper/`** — the conversation, sources, store, session, generation (one model call
  with a neutral prompt pack; marks budget, MCQ answers and image keys made true after the call), the
  question-type catalogue by subject family, the paper/answer-key renderer (right to left in Nastaliq or Naskh
  for Perso-Arabic-script languages), and delivery through the repo's html-to-pdf. Ported from a fork's
  assessment generator, generalised: no country-bound catalogue, prompts or subject packs.
- **`bot/workers/testpaper.worker.js`** — the `testpaper_generate` and `testpaper_revise` jobs.
- **`bot/scripts/testpaper/import-curriculum-corpus.js`** — loads the curriculum pipeline's page-truth output
  into `textbooks` / `textbook_toc` / `textbook_pages` (idempotent, `--dry-run`; books of different
  `--curriculum` keys are kept apart).
- **`bot/shared/config/model-registry.js`** — a slim per-job model registry (`resolveModelForJob`); test papers
  default to `google/gemini-2.5-pro` via OpenRouter, override with `TESTPAPER_MODEL`.
- **Schema:** `test_paper_requests` and `test_papers` (versions via `edited_from`), RLS, and migration
  `V2.4.0__test_papers.sql` (additive).
- `docs/features/test-papers.md`, README and feature-library rows, a SETUP section, a `.env.template` block
  (`TESTPAPER_MODEL`, `TESTPAPER_CURRICULUM`, `RUMI_FEATURE_TEST_PAPER`), and a `test_paper` entry in
  `FEATURES` (on with the LLM key; `RUMI_FEATURE_TEST_PAPER=off` switches every entry point off, including
  buttons from earlier papers and jobs already queued).
- Lesson plans made by Rumi are read through the shared `content.plan_text` reader
  (`bot/shared/services/coaching/fidelity/lesson-plan-text.js`, from the lesson-plan fidelity release).

### Changed

- **The bot's Meta webhook acknowledges a handled test-paper pick** before returning, so Meta does not
  re-send it.
- **The SQS worker loads the operator's `RUMI_FEATURE_*` switches at startup**, as the bot does, so a job for
  a feature switched off after it was queued is not run (test papers check this).

## [2.3.0] - 2026-10-02

**Did the lesson follow the plan?** A teacher sends a lesson recording and links the plan they meant to teach — one
Rumi made for them, a document, or pasted text. Rumi turns the plan into about a dozen observable moves, checks each
one against the timestamped recording, and the coaching report shows, move by move, what happened, with the moment
in the recording as proof. A different activity that serves the same purpose gets full credit; a recording Rumi
cannot judge is "not assessed", never 0%. Off by default (`LP_FIDELITY_ENABLED=true`).

### Added

- **The fidelity engine** (`bot/shared/services/coaching/fidelity/`): a plan → moves extractor, a per-move grader
  (`executed`, `substituted_equivalent`, `substituted_better`, `partial`, `not_done`, `not_adjudicable`, each asked
  to quote a `[MM:SS]` line), and a deterministic scorer (credit ÷ moves counted, band ≥80 / 50-79 / <50, configurable).
  Results are stored as `coaching_sessions.analysis_data.lp_fidelity`, framework-neutral, with an optional
  `applyLpFidelity` framework hook (FICO maps it onto indicator 1.2). Default grader `google/gemini-3.8-flash` via
  OpenRouter (`LP_FIDELITY_MODEL`, `LP_FIDELITY_EXTRACT_MODEL`, caps `LP_FIDELITY_MAX_TOKENS` / `LP_FIDELITY_EXTRACT_MAX_TOKENS`).
  A credited verdict that quotes no moment is flagged (`unquoted_credit`) and shown as such in the report.
- **The timestamp input contract:** a transcript without `[MM:SS]` timings is "not assessed" in code before any model
  call. Every outcome has its own words for the teacher — measured, a different lesson, no timings, an unclear
  recording, no plan, an unreadable plan, a failed check.
- **In the report:** a "Did the lesson follow the plan?" block in the coaching PDF with a per-move table (planned
  move · what the recording shows · verdict); one chat line after the report; the voice note speaks the band in
  words, never a percentage.
- **Plans Rumi made keep their text** (`content.plan_text` on `lesson_plans`), so a teacher can pick one from a short
  list after sending a recording (`LP_FIDELITY_LIST_LIMIT`), and its move list is extracted once and kept on the plan
  (`content.fidelity_moves`) so every lesson taught from it is graded against the same moves. Plans can also be
  uploaded or pasted as a message.
- **Diarization health:** every classroom transcription records whether it came back with speaker timings;
  `rumi doctor` shows the 7-day rate under the feature and flags it below 80%.
- `bot/scripts/fidelity-calibration.js` and a fictional fixture set (`tests/fixtures/fidelity/`) to re-check the
  calibration after any prompt or model change; `docs/features/lesson-plan-fidelity.md`; an `LP_FIDELITY_*` block in
  `.env.template`; a `Lesson-plan fidelity` row in `rumi doctor` and the console (switch: `RUMI_FEATURE_LP_FIDELITY`).
- `COACHING_MIN_AUDIO_SECONDS` (default 900): how long audio must be to start classroom coaching.

- **Operator console** (#97, on `main` since 2.2.0, recorded here) — `rumi start` opens a web page that shows what
  is connected and switched on, each pipeline layer, feature switches that pause a feature without deleting its key
  (`RUMI_FEATURE_<ID>`), and a live activity feed. `rumi console` serves it when the bot won't start. See
  `docs/console.md`.
- **Opt-in usage stats** (#95, on `main` since 2.2.0, recorded here) — `rumi setup` asks once. With
  `RUMI_TELEMETRY=on` and both keys present, a deployment shares anonymous counts; with it off or blank, nothing is sent.

### Fixed

- The classroom-photo question's buttons (Yes / No / Add another / Done) had no handler, so a recording stalled after
  transcription; "No" and "Done" now move to the lesson-plan step, which was never asked before.
- Classroom coaching on Matrix, Slack and Discord: those channels report no audio duration, so a lesson recording was
  always read as 0 seconds and never started coaching. The recording is now measured.
- Classroom coaching without object storage: the transcription job failed building an S3 client; without R2 the
  audio is no longer archived and the voice note is sent from memory.
- The lesson-plan extraction worker stored only a 500-character excerpt of an uploaded plan; it now stores the full
  text.

## [2.2.0] - 2026-09-04

**The Morning Brief.** Every morning, your team wakes up to one thread that says how the programme is
doing — who is on the platform and who actually used it, are teachers teaching with the lesson plans, is
the teaching improving, are the coaches showing up against their target, where should attention go next —
with a number behind every question and the same charts every day so drift is visible at a glance. On
Fridays the same thread rolls the week up.

### Added

- **`brief/`** — the Python package: a code-level calendar (a morning brief covers the previous working
  day; Monday's is about Friday), live-schema detection (panels switch themselves on from
  `information_schema`, so a fork that records classroom observations gets that panel for free), the
  metric definitions as tagged SQL with their prose twin in `brief/README.md`, matplotlib panels that follow
  one binding grammar (a delta chip on every headline, one organising unit breaking down every panel, every
  school listed worst-first, PCHIP-smoothed lines with the real points marked), plain-language captions, and
  a `manifest.json` contract. `python3 brief/cli.py check` says what your database can draw;
  `python3 brief/cli.py sample` renders a synthetic brief with no database at all.
- **Delivery through the bot's own channel drivers** — `bot/scripts/brief/send-brief.js` posts the cover,
  the panels and the closer to every target in `BRIEF_RECIPIENTS`, idempotently. New team targets in the
  drivers: `slack:channel:C…`, `discord:channel:…`, and `…@g.us` WhatsApp groups.
- **`rumi brief`** (`--send`, `--weekly`, `--dry-run`) and **`bot/workers/brief.worker.js`**, a one-shot
  for any daily cron that decides daily / weekly / off-day itself in `BRIEF_TZ`.
- **A live page** in the dashboard — `/observability/brief` (latest daily and weekly) and
  `/observability/brief/screen?p=N`, a self-refreshing single panel for an office wall
  (`BRIEF_SCREEN_TOKEN` lets a display in without a login).
- The `morning-brief` agent skill, `docs/features/morning-brief.md`, a `BRIEF_*` block in `.env.template`,
  a `Morning Brief` row in `rumi status`, and a CI job that runs the Python suites.

## [2.1.0] - 2026-08-30

**The curriculum builder and its knowledge graph** — `curriculum/`: textbooks in, a faithful, gate-checked
lesson-plan corpus out (page-truth → segment → enrich → slide-script → render → voicenote → deliver), with an
SLO registry so every lesson carries a validated learning-outcome code, and `curriculum/graph/`, which turns
the corpus into a knowledge graph (lessons ↔ outcomes, outcomes ordered per strand) with a self-contained
viewer. A 105-second walkthrough film is attached to the release.

## [2.0.0] - 2026-08-07

**Rumi no longer requires a Meta WhatsApp Business account to run.** The messaging
channel is now pluggable: the default links your own WhatsApp by QR the way
WhatsApp Web does, so a clone goes from `git clone` to a working conversation in
about fifteen minutes with no Business account, no app review and no waiting.
When you're ready for a real deployment, `rumi graduate` moves you to an official
number and every teacher, conversation and past assessment carries over.

Alongside it, setup stopped being an eleven-step document and became two
commands.

### BREAKING (vs v1.2.0)

- **Node 20 is now the minimum** (was 18). The Baileys sandbox driver refuses to
  install on 18 — its own preinstall check reports "This package requires
  Node.js 20+ to run reliably" — so `npm ci` in `bot/` fails outright rather
  than degrading. Node 18 has also been end-of-life since April 2025. `engines`
  is set on both packages, `install.sh` checks for 20, and the CI matrix is now
  20 and 22.
- **`npm run setup` now launches the interactive setup wizard.** It previously
  ran the preflight (`doctor.js`). If you had it in a script or a deploy step,
  switch to **`npm run doctor`** (or `rumi doctor`) — same output, unchanged.
- **`.env` is read from the repo root, not the process working directory.**
  `bot/whatsapp-bot.js`, `bin/rumi.js` and `bot/scripts/setup/doctor.js` now
  resolve it relative to the repository. If you kept a `bot/.env`, move it to the
  repo root. Railway is unaffected — its Procfile already runs from the root.
  This fixed a real failure: `cd bot && npm start` loaded **zero** variables and
  aborted with "Missing REQUIRED env var(s)" on a fully configured deployment.
- **`REQUIRED_VARS` is now core-only** (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `REDIS_URL`); the channel's
  own variables come from `CHANNEL_REQUIRED_VARS[CHANNEL_DRIVER]`. **Existing Meta
  deployments need no change** — with `CHANNEL_DRIVER` unset and the four Meta
  variables present, the driver is inferred as `meta`.
- **`CHANNEL_STATE_DIR` (default `.channel-state`) resolves against the repo**,
  not the working directory. Only affects the new sandbox driver, but it is the
  reason a bot started from `bot/` registered a *second* WhatsApp device and
  re-synced endlessly until WhatsApp invalidated the first.

### Added

- **A two-layer CLI.** `./install.sh` does the mechanical bootstrap (tool check,
  dependencies, `.env`, puts `rumi` on your PATH) and offers to run the wizard;
  `rumi` does everything else: `setup`, `start`, `status`, `doctor`, `pair`,
  `graduate`.
- **`rumi setup` — a five-step guided wizard.** Asks in plain language rather
  than by variable name ("where should Rumi keep its memory", not
  `SUPABASE_URL`), checks every value against the real service as you type it
  using the same probes `rumi doctor` runs, writes each answer to `.env`
  immediately (so Ctrl+C costs nothing), and skips anything already working on a
  re-run. Creates the full database — 76 tables, RLS policies and seed data —
  inline.
- **Pluggable messaging channels** via `CHANNEL_DRIVER`. A registry
  (`bot/shared/services/messaging/channel-registry.js`) with an explicit
  production-tier allowlist; `whatsapp.service.js` is now a one-line facade over
  it, so all ~40 existing call sites are untouched. Adding a channel later is a
  new registry key plus a service file.
- **The Baileys sandbox driver** — QR pairing, text, reactions, typing
  indicators, images, audio, documents, video and stickers, plus an inbound
  adapter that normalizes a socket event into the same shape Meta's webhook
  produces, so the existing dispatch runs unchanged.
- **WhatsApp Flows, rendered as a conversation.** A Flow is only a renderer; the
  endpoint holds the logic. The new text-flow engine drives those *same*
  endpoints over chat, so `/settings`, `/video`, reading assessment and class
  setup work on a channel that has no Flows — with the field names pinned by
  tests against their real consumers.
- **`rumi graduate`** — collects the target channel's credentials, validates them
  against the live service *before* touching `.env`, retires (never deletes) the
  outgoing session, and prints the checklist for what only you can do in Meta's
  console.
- **`rumi status`** — is Rumi running, which WhatsApp number it answers as, and
  what's switched on. Reads the connection module's own lock rather than
  inventing a second source of truth.
- **Field-shape validation with specific corrections.** Catches Supabase's
  **anon** key pasted instead of `service_role` (both are `eyJ…` JWTs on the same
  page — the anon key cannot see past RLS, so the bot runs and finds no data), a
  phone *number* in Meta's `PHONE_NUMBER_ID`, another vendor's `sk-…` in
  `OPENROUTER_API_KEY`, the Supabase dashboard URL instead of the API URL, and
  Upstash's `https://` endpoint as `REDIS_URL`.
- **An optional-abilities step** that describes each extra by what a teacher
  would notice, defaults to skipping, and only stores a multi-key feature when
  every key is given.

### Fixed

Most of these were pre-existing and affected Meta deployments too. Each failed
inside a `try/catch` that made it look transient.

- **`redisService.setNX` and `setexWithCeiling` never existed.** No quiz could
  ever be delivered and every image message failed. Added, with a conformance
  guard.
- **`quiz_class_*` replies had no handler**, despite a comment claiming one.
- **Five services bypassed `llm-client.js`** and called `OPENAI_API_KEY`
  directly.
- **`quiz_sessions` was missing six columns** on any database created before
  them — `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so they
  only ever reached fresh installs. Added to the `ALTER … ADD COLUMN IF NOT
  EXISTS` reconcile block.
- **`rumi doctor` reported a green tick for an OpenRouter key with no credit** —
  the worst kind of preflight, since it sends you hunting for a bug in the bot.
  It now reports the remaining balance.
- **Feature-intro videos and reading-passage backgrounds produced relative URLs**
  when no public asset host was configured, so the bot offered "want to see how?
  🎥", the teacher accepted, and nothing arrived. Both are presence-gated now,
  and the offer is only made when there is something to send.
- **Reading assessments leaked artifacts** — every run left an `.ogg` of a
  child's voice and a report PDF on disk forever.
- **A failure message claimed "our team has been notified"** when nobody had
  been. Replaced with an honest one.
- **A failed voice note apologised three times.**
- Baileys sessions are protected by a single-instance lock, and a QR shown when
  credentials already exist is treated as terminal rather than looping forever
  (which is how this project kept tripping WhatsApp's device-linking rate limit).
- Two tests read the repo's real channel state; one renamed a live WhatsApp
  session. Both now use throwaway directories.

### Changed

- **README and SETUP.md** lead with the two-command path; the manual walkthrough
  remains as the production reference. Both now state that **you need a second
  phone number to test from** — Rumi answers *as* your number, so messaging it
  from the same account looks exactly like a broken bot.
- **The `/setup` skill** documents both front doors: the human wizard, and the
  agent-driven "set me up" flow. The agent path calls the wizard's own modules
  (validators, `.env` patcher, doctor probes, schema bootstrap) so the two cannot
  drift, and the skill is explicit that `rumi setup`, `rumi pair` and
  `rumi graduate` are interactive TTY programs an agent must not launch.
- `rumi doctor` is channel-aware: it skips the Meta probe cleanly on a sandbox
  channel and names the address when Redis does not answer.
- `.env.template` opens by pointing at `./install.sh && rumi setup`.
- **Test suite: 170 suites / 1997 tests**, up from 155/1724.

## [1.2.0] - 2026-07-29

### Added
- **Video Quizzes + the Taleemabad Content Library** — the biggest content drop
  the platform has shipped. A teacher pulls a curriculum video with `/video`
  and is offered its quiz 3 s later: 15 questions one at a time with per-answer
  feedback, picture options served as a tappable WhatsApp Flow
  (`RadioButtonsGroup`, `media-size: large`) with a numbered-grid fallback,
  phonics questions asked by voice note (labels quoted-replied to the clip they
  name), a forwardable `wa.me` class link (each child plays 1:1, is remembered
  between quizzes, and can invite a friend), and a next-morning designed PDF
  report that names what to reteach and the wrong answer the class agreed on.
  Ships with the openly-hosted library: **890 curriculum videos, 858 with a
  quiz, 10,929 QA-certified questions, 15,557 studio voice clips, 3,217
  hand-drawn illustrations** (Pakistani national curriculum, English + Urdu),
  all served from a public CDN bucket — one import script
  (`bot/scripts/setup/import-video-quiz-library.js`) and zero media hosting.
  Region-gated via `region_features.video_quizzes_enabled` (seeded ON for
  `pakistan`). New services under `bot/shared/services/quiz/video-quiz-*.js`,
  student-videos endpoint v2 (clean titles, duplicate-hiding), two new Flows
  (`video-quiz-flow.json`, `student-join-flow.json`) in the registrar, a
  boot-time Flow-ID validator, and schema: `quiz_share_codes`,
  `video_quiz_deliveries`, `v_video_quiz_popularity`, plus media/feedback/
  render-pattern columns on `quiz_questions` and identity columns on
  `quiz_sessions`/`students`.

### Fixed
- `quiz_sessions.status` CHECK now includes `in_progress` (the value the
  session service actually writes — previously every start UPDATE failed
  silently).

## [1.1.0] - 2026-04-03

**BREAKING (vs v1.0.0):** The three-tier feature system (Minimal / Recommended /
Full) is removed. Features are now **presence-gated**: a feature is ON iff its
required env var(s) are set. There is no `RUMI_TIER` env var; `feature-availability.js`
is the single source of truth. `npm run doctor` shows a per-feature ON/OFF matrix
based on the keys you've provided.

### Added
- **Multi-framework coaching system** — OECD, HOTS, TEACH, and FICO frameworks selectable per teacher
- **HOTS framework** — aligned to PESRP/PECTAA official spec (16 indicators, 48 marks, 6 areas)
- **FICO framework** — 5 domains, 21 indicators, 84-mark scale (photo-aware indicators for 3.2 and 4.4)
- **TEACH framework** — behavior observation framework with teacher-student interaction analysis
- **Framework registry + selector** — lazy-loaded framework modules, user preference persistence
- **Classroom photo analysis** — AI-powered visual evidence for photo-aware coaching indicators
- **Coaching cards** — personalized PNG action cards generated after coaching sessions
- **Prioritized action service** — surfaces single highest-leverage action from coaching analysis
- **LP-coaching linker** — connects lesson plan feedback into the coaching session context
- **Report transformers** — per-framework PDF report generation (OECD, HOTS, TEACH, FICO)
- **Coaching flow helpers** — centralized state management for multi-step coaching flows
- **Centralized scoring constants** — `getFrameworkMaxMarks()` and `getFrameworkDisplayName()` for all frameworks
- 25 new coaching test scenarios across framework registry, HOTS, FICO, OECD, TEACH, report transformers, and coaching card generation (753 total tests, up from 728)

### Fixed
- HOTS report: empty PDF when no lesson plan linked — now uses raw analysis as fallback
- HOTS evidence: was English-only; now infers subject/topic from transcript context
- HOTS framework selector: wrong DB column used when reading user preference
- Coaching photo flow: state mismatch, missing `photo_yes` button handler, 2-minute timeout

### Infrastructure
- Added `pino` and `canvas` mocks to OSS test suite so tests run without native dependencies
- `jest.config.js`: added `moduleNameMapper` entries for `pino` and `canvas`
- `scoring.constants.js`: removed unnecessary `require('dotenv').config()` for OSS compatibility

## [1.0.0] - 2026-01-28

### Added
- Initial open-source release of Rumi AI Teaching Assistant
- WhatsApp bot with AI chat (AMA), registration, coaching, reading assessment, and lesson plans
- Three-tier feature system (Minimal, Recommended, Full)
- OpenRouter as unified AI gateway (one key for 500+ LLM models)
- BullMQ-based async job queue (coaching analysis, transcription, video generation)
- Supabase database schema with 52+ tables, RLS policies, and seed data
- Observability Dashboard for monitoring bot usage and coaching sessions
- Teacher Portal for classroom management (Phase 2)
- `/setup` Claude Code skill for automated one-hour deployment
- Railway deployment configuration (Procfile for web + worker processes)
- CLI simulator for local testing without WhatsApp
- Comprehensive documentation (architecture, setup, cost guide, customization)
- Environment validation and connection testing scripts
- CI pipeline with Node.js 18/20/22 matrix testing
- Apache 2.0 license

### Security
- All credentials parameterized via environment variables
- No hardcoded API keys, tokens, phone numbers, or personal paths in source
- Row-Level Security (RLS) enforced on all user-facing database tables
- Comprehensive .gitignore covering secrets, build artifacts, and IDE files
