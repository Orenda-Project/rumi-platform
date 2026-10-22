# /pinokio-launcher - Running and developing Rumi inside Pinokio

> **Up:** [pinokio/CLAUDE.md](../../../pinokio/CLAUDE.md) · **The wizard's layout:** [pinokio/onboarding/CLAUDE.md](../../../pinokio/onboarding/CLAUDE.md) · **User-facing docs:** [pinokio/README.md](../../../pinokio/README.md)

`pinokio/` is the [Pinokio](https://pinokio.co) launcher for Rumi: a sidebar that installs, configures
and starts Rumi in one click, and a browser wizard that sits beside the terminal setup. Pasting this
repository's URL into Pinokio clones the whole repo and finds `pinokio/pinokio.js`; the scripts run from
`pinokio/` and reach Rumi at `..`.

Use this skill when a task touches `pinokio/`, or how Rumi is run under Pinokio. All paths below are
relative to `pinokio/`.

## What belongs to the launcher

| Path | Purpose |
|------|---------|
| `pinokio.js` | Builds the sidebar. Pure function of state — what exists, what is running |
| `pinokio.json` | Title, description, icon |
| `install.js` | npm install (launcher, `..`, `../bot/`); `../.env` from template; local Redis via conda. No clone — Pinokio's clone of the repo is the install |
| `onboard.js` | Daemon: serves the GUI wizard on its own port and captures its URL. **No Redis step** — see below |
| `start.js` | Daemon: local Redis, then `node bin/rumi.js start` in `..`, then `scripts/wait-for-console.js` reports the console URL |
| `setup.js` `pair.js` `doctor.js` | `rumi setup`/`pair`/`doctor` in `..`. Doctor brings up Redis for its check |
| `claude.js` | Opens a Claude Code session at the repository root |
| `update.js` | `git pull` the repository (Rumi and launcher together), reinstall |
| `reset.js` | Deletes the three `node_modules/` (launcher, root, `bot/`). Keeps `.env` and `.channel-state/` |
| `package.json` | The launcher's one dependency, `qrcode`, for the wizard's QR image |
| `onboarding/` | The GUI wizard — see [its router](../../../pinokio/onboarding/CLAUDE.md) |
| `scripts/wait-for-console.js` | Polls `/health`, then prints the console URL on a line of its own |
| `scripts/redis.js` | The Redis step `start.js` and `doctor.js` `require`. Not `onboard.js`: the wizard opens before a Redis has been chosen |
| `scripts/local-redis.js` | Run by that step. Reads `REDIS_URL` from `../.env` at run time: local host → `redis-server` on its port; hosted (Upstash, Railway) → prints a line and starts nothing. Never prints the URL (hosted ones carry a password) |
| `onboarding/local-redis.js` | `ensureLocalRedis(env)`: the wizard starts a local Redis on the first Redis check (field save, Done, console probe), only if `REDIS_URL` is local by then. A child of the wizard server, so it stops with it |
| `onboarding/probes.js` | Live, free, read-only checks for the optional services Rumi only checks for presence. Run on save and at Done; reported apart from Rumi's own readiness |
| `scripts/pick-port.js` | `node scripts/pick-port.js <bot|wizard>` → `port=<n>`. Reuses the port saved in `.ports.json` while it is free, else asks the OS for one that is not the other's |
| `home.html` | The start screen: the default tab while `start.js` runs, so opening Rumi never lands on a terminal |

## The start screen

While `start.js` runs, `pinokio.js` makes `home.html?raw=true&port=<port>` the default tab instead of the
terminal. `start.js` saves the port as its **first** step for this reason: the sidebar re-renders after each
step, so the terminal is replaced almost at once. The href stays the same from boot to ready, so the tab
never reloads; the page itself polls `http://127.0.0.1:<port>/health` (a `no-cors` fetch: the bot sends no
CORS headers, but a fetch that resolves at all means it is listening) and then enables **Open Console**.
Pinokio serves launcher files raw only with `?raw=true` — that applies to the page's own assets too
(`icon.jpg?raw=true`). The console opens inside the Pinokio tab even though it sends
`frame-ancestors 'none'`, because the Pinokio desktop app strips that directive from responses.

## Layout

Pinokio's nested-launcher shape: the app at the repository root, the launcher in `pinokio/` (Pinokio
looks for `pinokio.js` first at the root, then at `pinokio/pinokio.js`). Every Rumi command runs with
`path: ".."` or `"../bot"`; every path the sidebar checks is `../...`. `onboarding/bridge.js` sets
`APP_ROOT` to the repository root.

Because the wizard lives in the same repository as the modules it loads, a change to an export listed in
`bridge.js`'s `MODULES` should update `bridge.js` in the same PR. `bridge.js` still feature-detects each
module, so a miss disables one wizard step rather than the whole wizard.

## Rules that are easy to get wrong

1. **Capture URLs by regex, set them with `local.set`.** A daemon script watches its own output for a URL
   and stores it, which is what makes "Open Console" appear in the sidebar:
   ```js
   on: [{ event: "/(http:\\/\\/\\S+\\/console)/", done: true }]
   // then
   { method: "local.set", params: { url: "{{input.event[1]}}" } }
   ```
   **Never match Rumi's own output for this.** Pinokio matches events against only the last 300
   characters of terminal output, and Rumi writes its startup banner (and the log records after it) in
   bursts larger than that, so its console URL is gone before the match runs — `start.js` once waited
   forever. Instead the bot step moves on as soon as its command starts (`/bin\/rumi\.js start/`, the
   echoed command), and a separate shell runs `scripts/wait-for-console.js <port>`, whose single line
   is what the URL pattern captures. Never hardcode a host or port in the pattern.
2. **Never a fixed port, and not `{{port}}` for the daemons either.** `{{port}}` is the lowest free port at
   that instant, so (a) the bot moved after every restart and the console tabs Pinokio restores pointed at
   nothing, and (b) Start and a wizard tab Pinokio reopened, starting in the same second, were handed the
   *same* port and one died — leaving Pinokio listing a dead wizard whose old address became the sidebar
   default. Both daemons get their port from `scripts/pick-port.js` instead.
3. **`start.js` stops the wizard first** (`script.stop`), so the wizard can't own the Redis the bot uses.
   `script.stop` passes its `uri` on unresolved: a bare `"onboard.js"` logs "Stopped" and stops nothing,
   so it is given `{{path.resolve(cwd, 'onboard.js')}}`.
4. **The sidebar checks `start.js` before `onboard.js`.** The default item is also what Pinokio's Run mode
   opens (`default_target`), so while the bot runs it must be the start screen. The exception is the local Redis, which takes its port from
   `REDIS_URL` (the template's is 6379) — choosing one would mean patching a file the operator owns.
5. **`QUEUE_DRIVER=bullmq` is injected as a shell env var**, not written to `.env`. dotenv never overrides
   an already-set variable, so injection wins; and the template's default of `sqs` would make every queued
   job die with "SQS Queue not configured".
6. **`RUMI_NO_OPEN=1` on start**, or `rumi start` opens a system browser behind Pinokio's back.
7. **Interactive commands need `input: true`.** `rumi setup`, `rumi pair` and `claude` are TTY programs;
   without it they stop at the first prompt forever. Same warning as [setup](../setup/SKILL.md).
8. **`npm ci || npm install`, never bare `npm install`.** Rumi's lockfile carries a stale `version` field
   that `npm install` rewrites, dirtying the checkout — and making the `git pull` in `update.js` refuse
   to run.
9. **The sidebar's "configured" check mirrors what `rumi doctor` calls required:** `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` in `../.env`. Change `ESSENTIAL` in `pinokio.js`
   if that list changes.

## Two steps no launcher can automate

- **The `exec_sql` paste.** Supabase exposes no API for arbitrary SQL. The wizard shows the exact SQL,
  copies it, deep-links the operator's own editor and polls `waitForExecSql` — but a human still pastes it.
- **Scanning the QR.** Rumi answers *as* the linked number, so it cannot reply to that same number. A second
  phone is required.

## Developing the launcher

```bash
cd pinokio
node onboarding/server.js --port=4180     # the wizard, without Pinokio (needs bot/ dependencies installed)
node ../bin/rumi.js doctor                # what Rumi thinks of ../.env
```

The wizard's client is plain ES modules — edit and reload, no build step. Server-side changes need a
restart. `node --check` covers the CommonJS files; for `onboarding/public/**` copy to `.mjs` first, since
`--check` parses `.js` as CommonJS and rejects `import`.

Worth re-running after any change to the routes:

```bash
# must 404 — a plain lookup here once returned the whole environment
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4180/api/probe/constructor -H 'X-Rumi-Onboarding: 1'
# must 403 — the header check and the Host allowlist
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4180/api/env -d '{}'
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example.com' localhost:4180/api/state
```
