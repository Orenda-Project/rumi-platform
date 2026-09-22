# The operator console

A web page for running Rumi without a terminal: what is connected, what is switched on, what each
layer of the pipeline is doing, and what to paste where.

```
rumi start                       → http://localhost:3000/console  (opens in your browser)
rumi start --no-open             → same, without the browser
rumi console                     → http://127.0.0.1:4173/console  (when the bot won't start)
rumi console --set-password      → required before it will open on a public deployment
```

`rumi start` waits until the bot is actually serving, then opens the console in your default browser —
polling its health endpoint first, so the tab never lands on a connection error. It does this only where
it makes sense: not on a hosted deployment (there is no browser there, and the console is locked anyway),
not from a non-interactive shell such as CI or a supervisor, and not if you pass `--no-open` or set
`RUMI_NO_OPEN=1`. If your machine has no way to open a URL, nothing happens and the banner still prints it.

---

## Why it exists

Configuration lives in a 726-line `.env`, and turning on everything Rumi can do means signing up to
around sixteen separate providers. The `rumi setup` wizard covers the first eight keys, once, in a
terminal. After that you are on your own with a text editor, and the running bot tells you nothing
about what it is doing.

The console is the answer to five questions that were previously hard to answer:

| Question | Where |
|---|---|
| Is it working? | Overview |
| What do I paste where, and where do I get it? | Setup |
| What actually happens to a message? | Pipeline |
| Can I turn this off without losing the key? | Features |
| What just went wrong? | Activity |

---

## The pages

**Overview** — uptime, which channel and which number it answers as, a live check against every
required service, every feature as on / switched-off / needs-a-key, and how much is in the activity
buffer. A failing check says what failed and links to the setting that fixes it.

**Setup** — every credential, grouped by what it does for a teacher rather than by vendor, with the
same wording, the same validators and the same "where to get it" links the `rumi setup` wizard uses
(they are read from `bot/scripts/setup/fields.js` and `doctor.js`, not copied). Secrets are masked;
revealing one is a separate, deliberate action, and some are never revealable at all. Each row has a
**Test connection** button that authenticates against the real service.

**Pipeline** — the three layers, read from the code that runs rather than from a diagram:

- *Listening* — the real fallback chain (Soniox v3 → Soniox v2 → OpenAI `whisper-1`), plus which
  languages route to Soniox and which to the self-hosted MMS service.
- *Thinking* — the provider, and the four model settings that are genuinely configurable. About
  fifty-six other call sites name their model inline; rather than list those and let the list rot,
  the page shows models **observed running**, from the activity buffer.
- *Speaking* — the per-language voice table the router actually reads, and the OpenAI `tts-1`
  fallback that is otherwise invisible. It also flags disagreements between
  `bot/shared/utils/constants.js` and `bot/shared/config/tts-voices.js` and says which one wins.

**Features** — one switch per feature, and three facts kept apart that "off" currently conflates:
is the key present, has the operator paused it, and is it running. Each row says what a teacher
would notice if it were off.

**Activity** — a live feed over SSE, and per-request traces assembled from the correlation ID that
already threads through the bot. Click a line to see the stages of that request with timings, the
provider and model at each step, and the error if it failed.

**System** — version, uptime, queue driver, memory, which settings have been saved but not applied,
and how to apply them.

---

## What it will not do

- **No restart button.** On a laptop Rumi runs in your terminal and a button could stop it but not
  start it again. On Railway the restart policy is `ON_FAILURE`, so a clean exit *stops* the service
  rather than restarting it. The console tells you the one thing to do instead.
- **No message content, and no phone numbers.** The bot handles teachers' voice notes and children's
  names. The activity feed keeps an allowlist of operational fields — provider, model, timing,
  result — and drops everything else before it reaches the browser. There is no toggle to turn that
  off.
- **No reading back the keys that would matter most.** `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
  `FLOW_PRIVATE_KEY` and a few others can be replaced but never displayed. None of them has a
  workflow that needs read-back, and each turns one console session into lasting access.

---

## Who can open it

Decided by where the request comes from, not by a setting you can forget:

| Situation | What happens |
|---|---|
| You browse from the machine Rumi runs on | Opens. No password — you already own the machine and the `.env` file on it. |
| Someone else on the same network | Locked. A hostile laptop on a school or office wifi is the case this protects against. |
| A hosted deployment (Railway, Render, Fly) | Locked until you set a password, whatever it binds to. |
| A password is set | Asks for it, everywhere. |

Set one with `rumi console --set-password`. It stores a bcrypt hash in `ADMIN_PASSWORD_HASH` and
generates a `SESSION_SECRET` if you have none; the password itself is never written down.

There is no flag to switch this off. `CONSOLE_INSECURE` and friends are ignored on purpose — people
who need an escape hatch build worse ones, and an ignored flag is at least visible.

---

## When the bot will not start

`bot/shared/config/supabase.js` exits at require time if the database credentials are wrong, and
`bot/whatsapp-bot.js` requires it near the top — so a bad Supabase key stops the bot before it can
serve anything, including a console mounted on it.

`rumi console` runs the same console in its own process, bound to loopback, requiring none of that.
Fix the key there, then `rumi start`.

---

## Applying a change

Most settings are read once at startup: `bot/shared/utils/constants.js` copies about fifty env vars
into module constants when it loads, and `llm-client.js` caches a client built from what it saw. So
saving a key changes the file and nothing else until a restart.

The console does not pretend otherwise. A banner lists exactly which saved settings the running bot
has not picked up. Feature switches are the exception — the console runs inside the bot, so flipping
one takes effect on the next message.

Every write goes through `bot/scripts/setup/env-file.js`, which patches `.env` in place and leaves
your comments and ordering untouched. The first write of a session takes a `0600` backup alongside
it, and the file is re-read after writing to confirm the value survived the round trip.

---

## Settings

| Variable | What it does |
|---|---|
| `CONSOLE_PORT` | Port for the standalone `rumi console` (default `4173`) |
| `CONSOLE_BIND` | Address it listens on (default `127.0.0.1`) |
| `CONSOLE_PUBLIC_HOST` | The hostname, if you serve the console through a reverse proxy |
| `CONSOLE_RING` | `0` stops collecting the activity feed entirely |
| `CONSOLE_RING_SIZE` | How many events to keep in memory (200–20000, default 2000) |
| `ADMIN_PASSWORD_HASH` | bcrypt hash; set it with `rumi console --set-password` |
| `SESSION_SECRET` | Signs console sessions; generated for you |
| `RUMI_NO_OPEN` | `1` stops `rumi start` opening the console in a browser |
| `RUMI_FEATURE_<ID>=off` | Switches one feature off — see the Features page |

---

## For contributors

`bot/console/` is self-contained. Two rules keep it that way:

1. **Nothing in it may require `shared/config/supabase`, `shared/utils/constants`,
   `shared/services/llm-client` or `shared/services/messaging` at module scope.** The first exits the
   process; the rest freeze env at load. `tests/console/boot-independence.test.js` enforces this, and
   it is what keeps `rumi console` working on a broken deployment.
2. **`bot/shared/observability/event-ring.js` and `bot/shared/config/feature-overrides.js` import
   nothing at all.** The first is called from `logToFile`, which runs in 180 files and in every
   worker; the second is reached by `rumi doctor` on machines with no database.

The stylesheet is hand-written (`bot/console/assets/console.css`) and the client-side code is one
plain file with no framework, so there is no build step: a clone runs the console straight from a
`git pull`. Pages are EJS rendered explicitly rather than through `app.set('view engine')`, so the
console leaves no trace on the app it is mounted onto.
