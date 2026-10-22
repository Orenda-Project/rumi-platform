# onboarding/ — GUI setup wizard (L1)

**Parent:** [../CLAUDE.md](../CLAUDE.md) · Deep knowledge: [.claude/skills/pinokio-launcher](../../.claude/skills/pinokio-launcher/SKILL.md)

An Express app that replaces `rumi setup` with a five-step browser flow, and mounts Rumi's own operator
console beside it. Started by `onboard.js` from the Pinokio sidebar; runnable directly with
`node onboarding/server.js --port=4180`.

## Layout

| Path | What's there |
|------|--------------|
| `server.js` | Express app, guards, `mountConsole`, listen. Prints its URL for Pinokio to capture |
| `bridge.js` | **The only file that requires Rumi's modules.** Feature-detects each at boot |
| `guards.js` | Host allowlist, CSP, and the `X-Rumi-Onboarding` header check |
| `sse.js` | Event-stream writer used by the schema and pairing steps |
| `async-route.js` | Forwards rejected promises to Express |
| `pair-worker.js` | Forked child that runs WhatsApp pairing in isolation |
| `probes.js` | Live checks for optional services Rumi only checks for presence (Soniox, ElevenLabs, Uplift, Azure, Gamma, Mistral, Kie, Axiom) |
| `local-redis.js` | Starts a local Redis on the first check that needs one, if `REDIS_URL` is local by then |
| `routes/credentials.js` | `.env` read/write via the console runtime, plus connection probes |
| `routes/database.js` | Schema inspection, the `exec_sql` helper, streaming bootstrap |
| `routes/whatsapp.js` | Spawns `pair-worker.js`, relays QR frames over SSE |
| `public/` | The wizard: plain ES modules, no framework, no build step |

## Things to know before editing

- **One origin, one port.** Rumi's console sends no CORS headers and sets `frame-ancestors 'none'`, both
  deliberately, so it cannot be driven across a port boundary or iframed. `server.js` calls
  `mountConsole(app, …)` on its own app instead — the same call `bot/whatsapp-bot.js` makes. The wizard is
  at `/`, its API at `/api/*`, the console at `/console/*`.
- **`mountConsole` gets `standalone: true`.** Without it the console compares `.env` against *this*
  process's environment and reports ~60 variables as "pending restart".
- **Reach it on plain loopback.** The console's `hostGuard` rejects any Host that isn't loopback, so
  Pinokio's `https://<port>.localhost` proxy form and LAN addresses both 403.
- **Optional-service checks are free, read-only, one request.** `probes.js` lists each endpoint and why
  it was chosen; each returns `{ok, detail}` like Rumi's doctor probes, never with a key in `detail`. They
  run when that key is saved and at the Done step, where they are reported apart from Rumi's own result —
  a rejected optional key turns one feature off, it never makes Rumi "Not yet". Kie answers HTTP 200 for a
  bad key, so its check reads the body.
- **Don't start Redis when the wizard opens.** The template's `REDIS_URL` is local, but an operator may be
  about to paste an Upstash URL. Any new route that tests Redis calls `ensureLocalRedis(env)` first.
- **Never require `link-whatsapp` into this process.** It replaces global `console.*` at import time, takes
  a session lock, and memoises its socket so a second pairing would ignore a new `onQr`. That is why
  pairing is a forked child, and why `stopChild()` sends SIGTERM rather than a bare `kill()`.
- **Never index a lookup table with a raw route param.** `routes/credentials.js` uses
  `Object.prototype.hasOwnProperty.call` before reading `defaultProbes[name]` — a plain lookup resolved
  `constructor` to the `Object` constructor and returned the whole environment.
- **The client builds nodes, never `innerHTML`.** Every value shown comes from `.env` or Rumi's catalogue.
  Use `mount()` from `public/dom.js` for conditional children: `Node.append(null)` renders the string
  `"null"`.
- **Copy comes from Rumi, not from here.** Field labels, hints and "where to get it" links are read from
  `buildCatalog()`, which reads `bot/scripts/setup/fields.js` and `doctor.js`. Don't retype them.
