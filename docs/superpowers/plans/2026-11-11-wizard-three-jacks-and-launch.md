# Wizard: three jacks, inline abilities and a Launch that starts Rumi — Implementation Plan (Part B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five-step wizard with one "plug in three things" screen whose Launch button starts Rumi, waits for it to answer, and hands off to the console's first-run page.

**Architecture:** Server side, one new pure module (`pinokio/onboarding/launch.js`, injected `spawn`/`pickPort`, unit-tested) behind one route (`POST /api/launch`). Client side, the existing step modules (`steps/credentials.js`, `database.js`, `whatsapp.js`) are kept as the engines and re-hosted inside three jack cards and an abilities panel; `app.js` changes from a five-step rail to three screens. No Rumi module is required outside `bridge.js`.

**Tech Stack:** Node + Express (wizard server), vanilla ES modules in the browser, Pinokio launcher scripts, Jest (repo-root `tests/`).

**Spec:** `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md` (Part B)

**Depends on:** Part A Task 2 (the `?first-run=1` console page) for the hand-off target. Part B can merge first: without Part A the link simply opens Activity with no banner.

## Global Constraints

- Wizard binds `127.0.0.1` only; no CORS; `/api/*` stays behind `guards.requireOwnOrigin`.
- Only `pinokio/onboarding/bridge.js` requires Rumi modules.
- All ability/field copy comes from the catalog (`GET /api/state`), never hardcoded; screen copy is verbatim from spec Part B.
- CSP: `script-src 'self'`; the only CSP change allowed is `connect-src 'self' http://127.0.0.1:*` (for the health poll).
- `launch.js` never builds a shell string: `spawn(pterm, ['start', startScript])`, no request input reaches arguments.
- Launcher scripts follow the Pinokio launcher checklist in the repo-root `CLAUDE.md` (destination, example lock-in, `{{which('pterm')}}`, absolute `uri`).
- Tests live under `tests/pinokio/`; never require `express` there (bot-only dependency).
- Repo is public: `tests/setup/source-hygiene.test.js` stays green.

## Review Focus

1. **Launch pressed twice** (double click, or Back then Launch again): must not start Rumi twice. Test in Task 1: `createLauncher` returns `{ ok: false, reason: 'already-launching' }` on a second call.
2. **Bot port taken between pick and start** (another app grabs it): `start.js` picks a new port, the wizard polls the old one and times out. Expected: the 120 s failure screen, whose Back keeps Launch available; the sidebar's start screen still works. Covered by the manual check in Task 4; documented in the failure copy ("The terminal shows what it's stuck on").
3. **`pterm` missing** (`RUMI_PTERM` empty): Launch must still help. Test in Task 1: returns `{ ok: true, port, manual: true }` without spawning.
4. **Memory jack with Supabase whose tables are missing**: Voice stays `LOCKED` and the tables step is visible. Covered by Task 3's jack-state function test (`voiceUnlocked` false when `db.ready` false).
5. **Optional key rejected by its validator** (e.g. a malformed Slack token): the item shows the validator's message and stays `ADD KEY`; never blocks Launch. Covered by reusing `saveField` unchanged (Task 3) and the `launchReady` test, which ignores abilities.

---

### Task 1: `POST /api/launch` — pick the bot port and start Rumi through Pinokio

**Files:**
- Create: `pinokio/onboarding/launch.js`
- Modify: `pinokio/onboarding/server.js:96-101` (mount the route)
- Modify: `pinokio/onboard.js:28-37` (server step `env`: `RUMI_PTERM`, `RUMI_START_SCRIPT`)
- Modify: `pinokio/onboarding/guards.js:31` (`connect-src 'self' http://127.0.0.1:*`)
- Test: `tests/pinokio/launch.test.js`

**Interfaces:**
- Produces: `pickBotPort({ execFile, scriptsDir }) → Promise<number>` — runs `node <scriptsDir>/pick-port.js bot`, parses `port=(\d+)`, rejects if absent.
- Produces: `createLauncher({ env, spawn, pickPort }) → { launch(): Promise<{ ok: true, port: number, manual?: true } | { ok: false, reason: 'already-launching'|'no-port' }> }`.
- Produces: route `POST /api/launch` → the `launch()` result as JSON (status 200 for `ok`, 409 for `already-launching`, 500 for `no-port`).

- [ ] **Step 1: Pinokio pre-flight** — resolve `PINOKIO_HOME` (repo-root `CLAUDE.md` order) and record the destination `PINOKIO_HOME/api/rumi-platform/pinokio/onboard.js`; reference `pinokio/start.js:44-60` for the `env` block shape and `{{path.resolve(cwd, ...)}}`. Confirm `which('pterm')` resolves the same way as Part A Task 3 Step 1 (reuse that finding).

- [ ] **Step 2: Write the failing tests** in `tests/pinokio/launch.test.js`:
  - `pickBotPort` with a fake `execFile` that yields stdout `port=51234\n` → `51234`; stdout `pick-port: could not find a free port` → rejects.
  - `createLauncher({ env: { RUMI_PTERM: '/p/pterm', RUMI_START_SCRIPT: '/p/start.js' }, spawn, pickPort: async () => 51234 }).launch()` → `{ ok: true, port: 51234 }`; `spawn` called once with `('/p/pterm', ['start', '/p/start.js'], { detached: true, stdio: 'ignore' })` and `.unref()` called.
  - Second `launch()` on the same launcher → `{ ok: false, reason: 'already-launching' }`, spawn still once (Review Focus 1).
  - `env: {}` → `{ ok: true, port: 51234, manual: true }`, spawn not called (Review Focus 3).
  - `pickPort` rejecting → `{ ok: false, reason: 'no-port' }`.

- [ ] **Step 3: Run to verify failure** — `npx jest tests/pinokio/launch.test.js` → FAIL (module not found).

- [ ] **Step 4: Implement** `launch.js` (pure; `child_process` only injected). Port is picked **before** spawning so `start.js`'s own `pick-port.js bot` reuses it.

- [ ] **Step 5: Wire** — in `server.js`, `app.post('/api/launch', asyncRoute(...))` using `createLauncher({ env: process.env, spawn: require('child_process').spawn, pickPort: () => pickBotPort({ execFile: require('child_process').execFile, scriptsDir: path.join(__dirname, '..', 'scripts') }) })`; in `onboard.js` server step add `env: { "RUMI_PTERM": "{{which('pterm')}}", "RUMI_START_SCRIPT": "{{path.resolve(cwd, 'start.js')}}" }`; widen `connect-src` in `guards.js` with a comment naming the health poll.

- [ ] **Step 6: Run tests** — `npx jest tests/pinokio tests/setup` → PASS.

- [ ] **Step 7: Commit**
  ```bash
  git add pinokio/onboarding/launch.js pinokio/onboarding/server.js pinokio/onboard.js pinokio/onboarding/guards.js tests/pinokio/launch.test.js
  git commit -m "feat(wizard): POST /api/launch starts Rumi through Pinokio on a known port"
  ```

### Task 2: Jack state — one pure function decides ON / OFF / LOCKED and Launch, plus "already linked"

**Files:**
- Create: `pinokio/onboarding/public/jacks.js`
- Modify: `pinokio/onboarding/bridge.js` (expose `whatsappLinked(): boolean` — `creds.json` exists in `authDir()` from `bot/shared/services/messaging/baileys-connection.js:57`; export `authDir` there if it is not exported; defensive load like the other bridge modules, `false` on failure)
- Modify: `pinokio/onboarding/routes/whatsapp.js` (add `GET /state` → `{ linked: boolean }`)
- Test: `tests/pinokio/jacks.test.js` (loads the ES module with `await import()`; the file has no DOM access)

**Interfaces:**
- Produces: `GET /api/whatsapp/state → { linked: boolean }` — today the wizard only learns about a link from the pairing stream, so a re-opened wizard could not tell Voice was already ON.
- Produces: `jackStates({ catalog, probes, db, whatsapp }) → { memory: 'on'|'off', brain: 'on'|'off', voice: 'on'|'off'|'locked', launchReady: boolean, abilities: { on: number, total: number } }`
  - `memory`: `'on'` when `db.state === 'ready'`, or `db.state === 'stopped'` with `db.driver` the built-in driver (the built-in database is created by the first Start — same rule as `steps/database.js:50`). Anything else `'off'`.
  - `brain`: `'on'` when the catalog's core row `OPENROUTER_API_KEY` has `set: true` and `probes.openrouter !== 'fail'` (`probes` is the client's record of the last result per probe name).
  - `voice`: `'locked'` unless memory and brain are `'on'`; then `'on'` when `whatsapp.linked === true`, else `'off'`.
  - `launchReady`: all three `'on'`. Abilities never count (Review Focus 5).
  - `abilities`: over every ability in the non-core groups (guide-only channel cards such as Matrix included in `total`), `on` = number with `item.on`.

- [ ] **Step 1: Write the failing tests** — voice: memory off → `'locked'`; brain off → `'locked'`; both on, not linked → `'off'`; linked → `'on'`. Memory: `{ state: 'stopped', driver: <built-in> }` → `'on'`; `{ state: 'needs-helper', driver: 'supabase' }` → `'off'` and voice `'locked'` (Review Focus 4). Brain: set + `probes.openrouter: 'fail'` → `'off'`. `launchReady` true with zero abilities on and one ability `partial`. Read the built-in driver's name from the same place `bot/scripts/setup/db-setup.js` does rather than hardcoding it.
- [ ] **Step 2: Run to verify failure** — `npx jest tests/pinokio/jacks.test.js` → FAIL.
- [ ] **Step 3: Implement** `jackStates` (no imports, no DOM) and `GET /api/whatsapp/state`.
- [ ] **Step 4: Run tests** — `npx jest tests/pinokio` → PASS.
- [ ] **Step 5: Commit** — `git add pinokio/onboarding/public/jacks.js pinokio/onboarding/bridge.js pinokio/onboarding/routes/whatsapp.js bot/shared/services/messaging/baileys-connection.js tests/pinokio/jacks.test.js && git commit -m "feat(wizard): one function for jack and launch readiness"`

### Task 3: The "Plug in" screen — jacks and inline optional abilities

**Files:**
- Modify: `pinokio/onboarding/public/index.html` (replace the rail + five panels with three panels: `asleep`, `plug`, `launching`; jack card markup with the three SVG icons from the spec, verbatim)
- Modify: `pinokio/onboarding/public/app.js` (three screens; re-render jacks via `jackStates` after any save/probe/db/whatsapp event)
- Modify: `pinokio/onboarding/public/steps/credentials.js` (export `field` and `saveField`; add `renderBrain(host)` for the single core field and `renderAbilities(host, onChange)` for the inline list)
- Modify: `pinokio/onboarding/public/steps/database.js` (export a `renderMemory(host, onChange)` wrapper: built-in default with the "Use Supabase or another Postgres instead" disclosure; the tables step shown only for Supabase)
- Modify: `pinokio/onboarding/public/steps/whatsapp.js` (render into the Voice card; accept `locked`)
- Modify: `pinokio/onboarding/public/styles.css` (jack, icon tile on/locked, ability item open/on, pills)
- Keep: `pinokio/onboarding/public/steps/done.js` — its doctor report moves under the Launch bar behind a "Check everything" link, so today's checks stay reachable.

**Interfaces:**
- Consumes: `jackStates` (Task 2), `GET /api/state`, `GET /api/db/state`, `GET /api/whatsapp/state` (Task 2), and the pairing stream's `linked` event.
- Produces: DOM ids used by Task 4: `#launch` (button), `#panel-launching`.

- [ ] **Step 1: Markup + styles** — three panels, copy verbatim from spec B1/B2/B3. Icon tile classes `jack-icon`, `jack-icon--on`, `jack-icon--locked`.
- [ ] **Step 2: Abilities list** — `renderAbilities` builds one `<details>`-free item per catalog ability (`button.ability-item` + hidden body), single-open behaviour, pill from `item.on`/`item.partial` (`ON` / `NEEDS MORE` / `ADD KEY`), body = `why` + `field(row, { hideWhere: true })` per row + `whereLink(item.where)`. Items with `item.guide` (channel cards with a multi-step guide) render pill `IN CONSOLE` and the note "Set up from the console's Setup page after launch." Counter text `N of M on`.
- [ ] **Step 3: Jacks** — Memory/Brain/Voice cards call their step's render into the card body; every `onChange` re-reads state and repaints via `jackStates`; `#launch.disabled = !launchReady`.
- [ ] **Step 4: Manual check** — `node pinokio/onboarding/server.js --port=4180`, open `http://127.0.0.1:4180`: fresh `.env` → Memory ON (built-in), Brain OFF, Voice LOCKED, Launch disabled; save an OpenRouter key → Brain ON, Voice OFF; open "Use Supabase…" → tables step appears; open an ability → fields; save a bad value → validator message inline (Review Focus 5); widths 400 px and 1280 px.
- [ ] **Step 5: Run tests** — `npx jest tests/pinokio tests/setup` → PASS.
- [ ] **Step 6: Commit** — `git add pinokio/onboarding/public && git commit -m "feat(wizard): plug-in screen with three jacks and inline optional abilities"`

### Task 4: The Launching screen and hand-off to the console

**Files:**
- Create: `pinokio/onboarding/public/steps/launching.js`
- Modify: `pinokio/onboarding/public/app.js` (wire `#launch`)
- Modify: `pinokio/README.md` (the wizard section: three jacks, Launch starts Rumi)
- Test: `tests/pinokio/launching.test.js` (the pure part only)

**Interfaces:**
- Produces: `waitForHealth({ port, fetchFn, sleep, now, timeoutMs = 120000, everyMs = 2000 }) → Promise<'up'|'timeout'>` — resolves `'up'` on the first `fetchFn('http://127.0.0.1:<port>/health', { mode: 'no-cors', cache: 'no-store' })` that resolves (no-cors gives an opaque response; resolving at all means the port answers, as `home.html` treats it).
- Produces: `consoleUrl(port) → 'http://127.0.0.1:<port>/console/activity?first-run=1'`.

- [ ] **Step 1: Write the failing tests** — `waitForHealth` with a `fetchFn` that rejects twice then resolves → `'up'` and `sleep` called twice with `2000`; always-rejecting with a fake clock past 120000 → `'timeout'`; `consoleUrl(51234)` exact string.
- [ ] **Step 2: Run to verify failure** — `npx jest tests/pinokio/launching.test.js` → FAIL.
- [ ] **Step 3: Implement** `launching.js`: export the two pure functions plus `run(host)` which POSTs `/api/launch`, marks steps 1–2 done on `ok`, step 3 done after the response, step 4 running while `waitForHealth`; on `'up'` shows "Rumi is awake." and the **Open the console** button (`location.href = consoleUrl(port)`); on `'timeout'` the failure copy with **Back to the jacks**; on `manual: true` the "Press Start in the Pinokio sidebar" line above the same steps. On `already-launching`, keep waiting on the same port. Copy verbatim from spec B4.
- [ ] **Step 4: Run tests** — `npx jest tests/pinokio tests/setup` → PASS.
- [ ] **Step 5: Manual check in Pinokio** — fresh install → Set up Rumi → plug in → Launch: sidebar switches to Start, wizard tab stays on Launching, steps tick, "Rumi is awake." appears, Open the console lands on `/console/activity?first-run=1`. Repeat with the bot's remembered port occupied by another process (`node -e "require('net').createServer().listen(<port>)"`) → failure screen after 120 s (Review Focus 2).
- [ ] **Step 6: Commit** — `git add pinokio/onboarding/public/steps/launching.js pinokio/onboarding/public/app.js pinokio/README.md tests/pinokio/launching.test.js && git commit -m "feat(wizard): Launch starts Rumi, waits for it, then opens the console"`
