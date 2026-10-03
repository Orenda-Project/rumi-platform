# 🚦 Public limits

> Rumi on a public link: one account cannot flood it, a stranger's account gets a small daily allowance until it
> finishes registration, and when the model budget runs out teachers are told "busy", not shown an error.

## What it is

Put Rumi on a link anyone can open (a public WhatsApp number, or a messenger with open sign-up) and three things
can go wrong that never happen with a closed group of teachers:

- **One account sends without limit.** Every message can start paid model calls.
- **Strangers use the expensive jobs.** A lesson plan, a coaching analysis or a quiz costs far more than a
  chat reply.
- **The budget runs out.** The model provider starts refusing, and every message after that ends in an error
  reply and an error log.

Public limits handles each one. All of them are set in `.env`, and the defaults leave an existing deployment as
it was. The one exception is the per-minute rate limit: it is on by default (30 text messages and 120 photos,
documents or voice notes a minute), far above what a teacher types or sends.

**Upgrading?** Nothing else changes unless you set it. If 30 or 120 a minute is too few for your teachers, raise
`INBOUND_RATE_LIMIT_PER_MINUTE` / `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE`, or set them to `off`.

For the full checklist of running in public, including the messenger side, see
[Running Rumi in public](../running-in-public.md).

## How it works

### 1. Per-sender rate limit

Every channel (WhatsApp, Slack, Discord, Matrix) delivers its messages to one entry point,
`handleWebhookPost` in `bot/whatsapp-bot.js`. There, after the duplicate check and **before the account lookup
and before any model call**, each message is counted against its sender:

- Up to `INBOUND_RATE_LIMIT_PER_MINUTE` messages (default 30) in any rolling minute are handled as usual.
- Media (images, documents, audio, voice notes, video, stickers) is counted in its own bucket,
  `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE` (default 120). Media is what a teacher sends in bulk: the exam checker
  asks for a class set of photos at once, and a dropped photo cannot be sent back to Rumi by the channel. A
  photo reaches a model only through a feature that the daily caps and the budget breaker already bound.
- The first message over the limit gets one reply: *"You're sending messages faster than I can answer. Please
  wait a minute, then send your message again."*
- Every message after that in the same minute is dropped silently. Rumi does not react, show typing, or call a
  model.

The sender is counted as the channel delivers it (a phone number, `mtx:…`, `slack:…`), so the limit holds
before an account even exists. Senders in `RATE_LIMIT_BYPASS_NUMBERS` are never limited.

**Redis down.** The count lives in Redis, so every replica shares it. If Redis is unreachable, each process
counts in its own memory instead. The limit does not fail open, because a cache outage must not also switch the
limit off. With N replicas a sender can get up to N times the limit until Redis is back, which is still a
bound.

### 2. Daily caps by account tier

An account is **unregistered** until it finishes registration (`users.registration_completed`). After that it is
**registered**. Caps count per account per **school day**, a day that turns over at midnight in
`SCHOOL_TIMEZONE`.

| Variable | Counts | Where it is checked |
|---|---|---|
| `DAILY_MESSAGE_CAP_UNREGISTERED` | messages from an unregistered account | the inbound entry point, after the account lookup |
| `DAILY_MESSAGE_CAP_REGISTERED` | messages from a registered account | the same |
| `DAILY_LESSON_PLAN_CAP_UNREGISTERED` | lesson plans and presentations (text, voice, a quiz follow-up, a textbook photo) | where each request starts, before the topic is read or anything is queued |
| `DAILY_COACHING_CAP_UNREGISTERED` | classroom recordings sent for coaching | `CoachingSessionService.initiateSession`, where every recording starts |
| `DAILY_QUIZ_CAP_UNREGISTERED` | quizzes | lesson quizzes: it lowers `QUIZ_DAILY_CAP` for the account (the smaller cap wins). Class quizzes (`/quiz` topic quizzes) are counted on their own |

An **empty variable means no cap**, which is the default. `0` means none at all, for example no coaching
until registration is finished. Over a message cap, the teacher is told once that day, then Rumi is quiet:
*"You've reached today's limit of 40 messages. Finish registering (send /register) to keep chatting, or come
back tomorrow."* Over a job cap, the teacher is told every time they ask, because they asked for that one
thing. `/register` and the name reply it asks for always get through, so an account can finish registering
after hitting its message cap.

Counts use one Redis `INCR` per claim (`dailycap:<kind>:<account>:<school date>`, kept 36 hours). If Redis is
down, each process counts in memory.

### 3. A model budget that runs out politely

Every model call goes through `bot/shared/services/llm-client.js`, and every completion now passes a small
breaker (`bot/shared/services/limits/model-budget.js`):

- **What trips it.** A refusal for money: HTTP 402 (OpenRouter: no credits), 403 "Key limit exceeded"
  (OpenRouter: the key's own credit limit), or OpenAI's `insufficient_quota`. A rate limit, a bad request or an
  outage does not trip it.
- **What happens to that message.** Its remaining replies (usually the handler's own "Sorry, something went
  wrong") are dropped, and the sender gets one *"Rumi is very busy right now. Please try again a little later."*
  The same applies to a worker job, such as a coaching report or a test paper. The job's own failure message
  is replaced by "busy".
- **Afterwards.** For `MODEL_BUDGET_COOLDOWN_SECONDS` (default 300) the breaker is tripped. New messages are
  answered "busy" before any handler runs, at most once per sender per cooldown, and then nothing. A model call
  made in that time fails at once, with no network call. Once the cooldown ends, the next message tries the
  provider again. If the budget has been topped up, everything works as before.
- **What the operator sees.** One log line per cooldown, `🚨 MODEL BUDGET EXHAUSTED …` with
  `alert: "model_budget_exhausted"`.
  Thousands of refused messages produce one alert, not thousands. The tripped state is kept in Redis, so the bot
  and the worker share it. A process that learns of the trip from Redis waits only until that shared flag
  expires, so every process recovers when the cooldown ends.

Give a public deployment **its own OpenRouter key with a credit limit**. That way the budget runs out at a
number you chose, and this breaker turns the moment it does into a polite pause.

## Configuration

```bash
# .env — recommended for a public deployment (see .env.template)
INBOUND_RATE_LIMIT_PER_MINUTE=30
INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE=120
DAILY_MESSAGE_CAP_UNREGISTERED=40
DAILY_MESSAGE_CAP_REGISTERED=300
DAILY_LESSON_PLAN_CAP_UNREGISTERED=3
DAILY_COACHING_CAP_UNREGISTERED=0
DAILY_QUIZ_CAP_UNREGISTERED=2
MODEL_BUDGET_COOLDOWN_SECONDS=300
SCHOOL_TIMEZONE=Africa/Nairobi        # whichever zone your schools are in
```

| Variable | Default | Meaning |
|---|---|---|
| `INBOUND_RATE_LIMIT_PER_MINUTE` | `30` | messages per sender per rolling minute; `off` (or `0`) = no limit |
| `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE` | `120` | media (image, document, audio, voice, video, sticker) per sender per rolling minute, counted apart from text; `off` (or `0`) = no limit |
| `RATE_LIMIT_BYPASS_NUMBERS` | empty | senders never rate limited (comma-separated, as the channel delivers them) |
| `DAILY_MESSAGE_CAP_UNREGISTERED` | empty = no cap | see above |
| `DAILY_MESSAGE_CAP_REGISTERED` | empty = no cap | see above |
| `DAILY_LESSON_PLAN_CAP_UNREGISTERED` | empty = no cap | see above |
| `DAILY_COACHING_CAP_UNREGISTERED` | empty = no cap | see above |
| `DAILY_QUIZ_CAP_UNREGISTERED` | empty = no cap | see above |
| `MODEL_BUDGET_COOLDOWN_SECONDS` | `300` | how long Rumi says "busy" before trying the provider again |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | an OpenRouter-compatible endpoint (a gateway in front of it, or a test double) |
| `SCHOOL_TIMEZONE` | `UTC` | when a school day starts and ends |

Every value is read per message, so you can change it without a restart.

## Known limits

- **"Registered" is only as strong as your registration.** The tier is `users.registration_completed`. In
  Rumi's own flow it is set once the teacher gives a name, and Rumi asks for the name right after their first
  feature. A stranger can therefore move to the registered tier just by answering that question. On a
  public link, either set `DAILY_MESSAGE_CAP_REGISTERED` as well (a generous ceiling such as 300), or have your
  sign-up service mark accounts registered only once it has verified them (for example, linked to a known
  teacher).
- **Each replica counts on its own while Redis is down.** That covers the rate limit and the daily caps.
- **A job cap counts the request, not the result.** A lesson plan that fails after it was queued still counts
  toward the day's cap.
- **Class quizzes and lesson quizzes are counted separately** for an unregistered account. On a bad day the
  account can make up to twice `DAILY_QUIZ_CAP_UNREGISTERED` quizzes.
- **Not capped by tier:** observe (classroom visits by a coach or head teacher, who are registered staff), video
  generation, reading assessments, test papers and the exam checker. The rate limit and the budget breaker still
  apply to them.
- **"Busy" stops everything while it lasts.** Features that need no model, such as attendance, also wait out the
  cooldown.
- **The breaker covers `llm-client.js`.** Speech-to-text, text-to-speech, Gamma and other providers have their
  own keys and their own failure messages.

## Code

| File | Role |
|---|---|
| `bot/shared/services/limits/inbound-rate-limit.js` | per-sender limit, Redis plus in-process fallback |
| `bot/shared/services/limits/daily-caps.js` | caps per kind, tier and school day, and their messages |
| `bot/shared/services/limits/model-budget.js` | budget breaker, request-scoped mute, the "busy" reply |
| `bot/whatsapp-bot.js` (`handleWebhookPost`) | where every message is checked |
| `bot/workers/sqs-worker.js` (`processJob`) | every job runs inside the budget guard |
| `bot/shared/services/messaging/index.js` | the mute: a tripped message's sends are dropped |
| `tests/limits/` | unit, wiring (40-message burst, caps, 402), worker and gate tests |
