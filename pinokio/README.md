# Rumi for Pinokio

A [Pinokio](https://pinokio.co) launcher for [Rumi](https://hellorumi.ai), an open-source AI teaching
companion that lives in WhatsApp. Teachers message it from the app already on their phone — no login, no
install — and get lesson plans, classroom coaching, reading assessments, quizzes and voice replies in 15
languages.

This folder (`pinokio/` in <https://github.com/Orenda-Project/rumi-platform>) holds the launcher: the
sidebar scripts and a **GUI setup wizard** that sits beside Rumi's terminal setup — credentials with live
connection tests, the database schema, and the WhatsApp QR as a real image in your browser. Paste the
repository's URL into Pinokio to install; Pinokio clones the whole repo, so Rumi and its launcher always
come from the same commit.

---

## What the app does

| | |
|---|---|
| **Lesson plans** | A full plan with objectives, activities and materials, in about ninety seconds |
| **Classroom coaching** | A teacher records their class; Rumi returns a framework-scored report and a reflective conversation |
| **Reading assessment** | Words per minute, accuracy and pronunciation from a child's voice recording |
| **Quizzes and video quizzes** | Curriculum-aligned questions a teacher can send to a class |
| **Voice, in 15 languages** | Including Urdu, Punjabi, Sindhi, Pashto, Hindi, Bengali, Tamil and more |
| **Class tools** | Attendance, exam-sheet OCR, and a morning programme-health brief |

## Using the launcher

1. **Install** — installs Rumi's dependencies and the wizard's, creates `.env` at the repository root
   from Rumi's template, and installs a local Redis.
2. **Set up Rumi** — opens the onboarding wizard in your browser and walks five steps:
   welcome → credentials → database → WhatsApp → done.
3. **Start** — runs the bot. Opening Rumi in Pinokio after setup starts it automatically, and shows a
   start screen rather than the bot's terminal: it says "Starting Rumi…" until the bot answers, then an
   **Open Console** button takes you to the console. The terminal is still one click away under
   **Terminal** in the sidebar.

The sidebar opens on **Set up Rumi** until `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`OPENROUTER_API_KEY` are all set in `.env`, and on **Start** after that.

`Doctor`, `Re-pair WhatsApp`, `Update` and `Reset` are there when you need them. `Terminal setup` runs
Rumi's own `rumi setup` wizard, and is the fallback if any part of the GUI is unavailable.
**Claude Code** opens a coding session at the repository root — see [Working on the launcher](#working-on-the-launcher).

### What you will need

- **A Supabase project** — <https://supabase.com>, free tier is plenty
- **An OpenRouter key** — <https://openrouter.ai/keys>
- **A second phone** — Rumi answers *as* the number you link, so it cannot reply to that same number

### Optional keys are tested too

Rumi itself only checks that most optional keys are *present*. The wizard also tests them live, with one
free, read-only request each, when you save the key and again on the last step: Soniox, ElevenLabs,
Uplift, Azure Speech (key and region), Gamma, Mistral, Kie.ai (it shows your remaining credits) and Axiom
(token and dataset). Slack, Discord and Matrix are tested by Rumi's own check. A pass means the service
accepted the key; it cannot tell whether your plan includes the feature or has credit left.

### Two steps that stay manual

Neither of these is a gap in the launcher; both are properties of the services involved.

1. **One SQL paste.** Supabase offers no API for running arbitrary SQL, so the small `exec_sql` helper that
   the schema is applied through has to be pasted into the SQL editor once. The wizard shows the exact SQL,
   copies it to your clipboard, links straight to your project's editor, and then polls until it appears.
2. **Scanning the QR.** Linking WhatsApp means scanning a code from another phone.

### Notes and limits

- **Where things live.** Your credentials are in `.env` at the repository root, and the linked WhatsApp
  session in `.channel-state/`. Both are git-ignored and never committed.
- **The bot listens on all interfaces.** Rumi calls `app.listen(PORT)` with no host and exposes no setting
  for it, and this launcher does not patch the app, so the bot's port is reachable from your network. The
  operator console on that port still refuses any non-loopback client.
- **Use the plain `http://127.0.0.1:…` links.** The console checks the `Host` header, so Pinokio's
  `https://<port>.localhost` proxy form and LAN addresses are rejected with `403 Host not allowed`.
- **Redis follows `REDIS_URL` in `.env`.** Rumi needs a Redis; the launcher can run one on this machine
  (installed through conda), or you can use a hosted one (Upstash, Railway) by pasting its URL into the
  wizard. A local Redis is only ever started when `REDIS_URL` points at this machine — the template's
  `redis://localhost:6379` does:
  - **Start** starts it before the bot, for as long as the bot runs.
  - **Set up Rumi** does *not* start one when it opens, because at that point nobody has chosen yet. It
    starts one the first time a check needs it (saving the Redis address, or the closing check), and only if
    `REDIS_URL` is still local then. So someone who pastes an Upstash URL never runs a local Redis at all.
  - **Doctor** starts one just for its check.

  With a local Redis and none of these running, nothing is listening, so a check made from anywhere else
  reports `nothing answered at redis://localhost:6379`. conda-forge has no Windows build, so on Windows
  `REDIS_URL` has to be a hosted address.
- **The bot keeps its port.** Each Start reuses the port it had last time (remembered in `.ports.json`),
  so a console tab opened earlier works again once Rumi is back up. The wizard has a port of its own.
  Pressing **Start** stops the wizard if it is running — setup is over by then.
- **Update** runs `git pull` on the repository — Rumi and this launcher together — then reinstalls
  dependencies.
- **Reset** deletes the installed dependencies (`node_modules/` at the root, in `bot/` and here) so the
  next **Install** starts clean. It keeps `.env` and the WhatsApp session; delete those by hand to set up
  from scratch.

---

## Working on the launcher

**Install** once, then press **Claude Code** in the sidebar. It opens a Claude Code session at the
repository root, installing Claude Code into Pinokio's own npm prefix first if you don't have it.

Agents should start at [CLAUDE.md](CLAUDE.md); the launcher's own guide is
[.claude/skills/pinokio-launcher](../.claude/skills/pinokio-launcher/SKILL.md), and the wizard's layout is
in [onboarding/CLAUDE.md](onboarding/CLAUDE.md). Rumi's own agent guide is [../CLAUDE.md](../CLAUDE.md).

### The shape of it

| Path | What it is |
|------|-----------|
| `pinokio.js` | The sidebar. A pure function of state: what exists, what is running |
| `install.js` `start.js` `onboard.js` | The scripts those menu items run |
| `setup.js` `pair.js` `doctor.js` `claude.js` | Terminal sessions — `rumi setup`, `rumi pair`, `rumi doctor`, Claude Code |
| `update.js` `reset.js` | `git pull` and reinstall; delete installed dependencies |
| `onboarding/` | The GUI wizard: Express server, routes, and a no-build-step client |
| `home.html` | The start screen shown while Start runs. Polls the bot's `/health`, then offers **Open Console** |
| `scripts/wait-for-console.js` | Used by `start.js` to report the console URL once the bot answers `/health` |
| `scripts/redis.js` | The Redis step `start.js` and `doctor.js` share |
| `scripts/pick-port.js` | Keeps the bot and the wizard each on their own port between runs (`.ports.json`) |
| `scripts/local-redis.js` | Starts a local Redis only when `REDIS_URL` in `.env` points at this machine |

### Running it without Pinokio

```bash
cd pinokio
node onboarding/server.js --port=4180    # the wizard on its own (after bot/ dependencies are installed)
node ../bin/rumi.js doctor               # what Rumi makes of .env
```

The client under `onboarding/public/` is plain ES modules — edit and reload. Server-side changes need a
restart (stop and start **Set up Rumi**, or re-run the command above).

### Before you commit

```bash
node --check pinokio.js install.js start.js onboard.js onboarding/server.js    # and the rest
```

`node --check` parses `.js` as CommonJS, so for `onboarding/public/**` copy to `.mjs` first or it will
reject the `import` lines.

These three should hold after any change to the routes — the first one guards a bug that once returned the
entire environment to anyone who asked:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4180/api/probe/constructor -H 'X-Rumi-Onboarding: 1'   # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4180/api/env -d '{}'                                   # 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example.com' localhost:4180/api/state                     # 403
```

---

## API

Rumi serves an HTTP API while `Start` is running. `PORT` is assigned by Pinokio — the exact URL is printed
in the terminal and is what **Open Console** points at. The examples below use `3000`.

### `GET /health`

Liveness. Returns `200` once the bot is serving.

```bash
curl http://localhost:3000/health
```

```javascript
const response = await fetch('http://localhost:3000/health');
console.log(response.ok, await response.json());
```

```python
import requests

response = requests.get("http://localhost:3000/health", timeout=10)
print(response.ok, response.json())
```

### `POST /webhook`

The inbound message endpoint, in Meta WhatsApp Cloud API shape. This is what Meta calls in production, and
what you post to directly to drive Rumi programmatically. `WHATSAPP_BOT_NUMBER` is whichever number Rumi
answers as; `from` is the teacher you are simulating.

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "field": "messages",
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "PHONE_NUMBER_ID" },
          "messages": [{
            "from": "923001234567",
            "id": "wamid.test-1",
            "type": "text",
            "text": { "body": "Hi" }
          }]
        }
      }]
    }]
  }'
```

```javascript
const message = (from, body) => ({
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
        messages: [{ from, id: `wamid.${Date.now()}`, type: 'text', text: { body } }],
      },
    }],
  }],
});

await fetch('http://localhost:3000/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(message('923001234567', 'Hi')),
});
```

```python
import os
import time
import requests

def message(sender: str, body: str) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"phone_number_id": os.environ["PHONE_NUMBER_ID"]},
                    "messages": [{
                        "from": sender,
                        "id": f"wamid.{int(time.time())}",
                        "type": "text",
                        "text": {"body": body},
                    }],
                },
            }],
        }],
    }

requests.post("http://localhost:3000/webhook", json=message("923001234567", "Hi"), timeout=30)
```

Rumi replies through the messaging channel, not in the HTTP response — the webhook answers `200` as soon as
the message is accepted. Watch the reply in WhatsApp, or in the console's Activity feed.

### `POST /console/api/env` — change a setting

The console's own API, served under `/console` on both the bot and the onboarding server. It writes `.env`
through the same validators the setup wizard uses.

Three things are required, and they are the reason this is safe to expose on loopback:

- `X-Console-Request: 1` — a header no cross-origin caller can set without a preflight that is never answered
- `X-Console-Token` — a per-process token, published as `<meta name="console-token">` in the console's HTML
- a loopback connection — any other peer is refused outright

```bash
PORT=3000
TOKEN=$(curl -s "http://127.0.0.1:$PORT/console/" \
  | grep -o 'name="console-token" content="[^"]*"' | cut -d'"' -f4)

curl -X POST "http://127.0.0.1:$PORT/console/api/env" \
  -H 'Content-Type: application/json' \
  -H 'X-Console-Request: 1' \
  -H "X-Console-Token: $TOKEN" \
  -d '{"updates": {"LOG_LEVEL": "debug"}}'
```

```javascript
const base = 'http://127.0.0.1:3000/console';

const html = await (await fetch(`${base}/`)).text();
const token = html.match(/name="console-token" content="([^"]*)"/)[1];

const response = await fetch(`${base}/api/env`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Console-Request': '1',
    'X-Console-Token': token,
  },
  body: JSON.stringify({ updates: { LOG_LEVEL: 'debug' } }),
});

console.log(await response.json()); // { saved: ['LOG_LEVEL'], pending: [...] }
```

```python
import re
import requests

base = "http://127.0.0.1:3000/console"

html = requests.get(f"{base}/", timeout=10).text
token = re.search(r'name="console-token" content="([^"]*)"', html).group(1)

response = requests.post(
    f"{base}/api/env",
    json={"updates": {"LOG_LEVEL": "debug"}},
    headers={"X-Console-Request": "1", "X-Console-Token": token},
    timeout=10,
)
print(response.json())  # {'saved': ['LOG_LEVEL'], 'pending': [...]}
```

`saved` lists what was written; `pending` lists variables whose saved value differs from the one the
running process booted with. Most settings only take effect on restart; feature toggles apply immediately.

---

## How the GUI onboarding works

Rumi's console cannot be driven from another origin: it sends no CORS headers and sets
`frame-ancestors 'none'`, both deliberately. So rather than talking to it across a port boundary, the
onboarding server mounts it — `mountConsole(app, { bind: '127.0.0.1' })`, the same call the bot makes. One
process, one port, one origin:

```
/           the five-step wizard
/api/*      its endpoints, calling the console's runtime in-process
/console/*  the real Rumi console, for everything after setup
```

Every `require` that reaches into Rumi's own modules lives in `onboarding/bridge.js`, and each one is
checked at boot. If a module moves, only the step that needed it is disabled — the wizard says so on its
first screen and points at the matching terminal script. The launcher reads Rumi's modules; it never
rewrites them.

WhatsApp pairing runs in a forked child process (`onboarding/pair-worker.js`). The module behind it
replaces global `console.*` at import time, takes a session lock, and memoises its socket so a second
attempt would ignore a new QR callback — all fine in a CLI that exits, none of it welcome in a long-lived
server. Killing the child is how "cancel" works, and why a retry behaves.
