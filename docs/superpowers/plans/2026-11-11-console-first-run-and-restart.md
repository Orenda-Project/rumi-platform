# Console: first-run, on-after-restart and Pinokio restart — Implementation Plan (Part A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The console tells the truth about keys saved but not yet live, proves on first run that Rumi answers, and under Pinokio can restart Rumi itself.

**Architecture:** Pure functions in new small modules (`bot/console/live-state.js`, `bot/console/first-run.js`, `bot/console/restart.js`) carry the logic and are unit-tested; `routes/pages.js`, `routes/api.js`, the EJS views and `assets/console.js` only wire them in. The restart itself is a Pinokio launcher script (`pinokio/restart.js`) the console triggers through `pterm`, so the process that stops the bot is never the bot.

**Tech Stack:** Node, Express, EJS, vanilla browser JS (`assets/console.js`), Jest (repo-root `tests/`), Pinokio launcher scripts.

**Spec:** `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md` (Part A)

## Global Constraints

- Console CSP stays `style-src 'self'`, `script-src 'self'`, `connect-src 'self'`: no inline style attributes (guarded by `tests/console/no-inline-styles.test.js`).
- Never send CORS headers from the console.
- Tests live under `tests/console/` and require bot code via `../../bot/...`; bot-only packages must be mocked (root CI runs before `bot/npm ci`).
- Copy is verbatim from the spec, Part A.
- Restart exists only when `RUMI_PTERM` and `RUMI_RESTART_SCRIPT` are both set **and** the console is not standalone.
- Pinokio scripts: follow `script.stop` / `script.start` exactly as Pinokio's `PINOKIO.md` documents them; absolute `uri` for `script.stop`, as `pinokio/start.js:14-16` already explains.
- Repo is public: `tests/setup/source-hygiene.test.js` must stay green.

## Review Focus

1. **A live key replaced with a new value**: the feature is already on, so it stays `on` (not `on after restart`); the existing "saved changes not applied yet" banner is what tells the operator to restart. Test in Task 1.
2. **Restart pressed twice** quickly: second press must not spawn a second `pterm start`. Test in Task 3: `createRestarter` refuses while a restart is in flight (returns `{ ok: false, reason: 'already-restarting' }`).
3. **Restart env present but console standalone** (the wizard's console): button hidden, endpoint 404. Test in Task 3.
4. **Reply pattern vs other "sent" lines** (`✅ Template message sent`, `✅ Video message sent successfully`): a template or video send still means Rumi replied; the pattern must match the plain reply lines and must not match error lines (`❌ Baileys: error sending message`). Test in Task 2.
5. **`?first-run=1` on a console that already has feed records** (page reopened): banner turns green only on a *new* record after page load, not on history. Covered by Task 2's client wiring (history rows are added before the banner listener attaches); manual check in Task 2 Step 6.

---

### Task 1: "On after restart" on Setup and Features

**Files:**
- Create: `bot/console/live-state.js`
- Modify: `bot/console/env-catalog.js` (`buildCatalog`, ability objects around lines 285–315)
- Modify: `bot/console/features.js` (`snapshot`)
- Modify: `bot/console/routes/pages.js:95-110` (pass `liveEnv`)
- Modify: `bot/console/views/setup.ejs` (ability pill), `bot/console/views/features.ejs` (right-hand column)
- Test: `tests/console/live-state.test.js`

**Interfaces:**
- Produces: `isLive(keys: string[], liveEnv: object|null, { anyOf?: boolean }): boolean` — `true` when `liveEnv` is `null` (standalone) or every key (any key, with `anyOf`) is set in `liveEnv`, using the same `isSet` placeholder rule as `feature-availability.js`.
- Produces: `buildCatalog(env, { liveEnv } = {})` — each ability gains `pendingRestart: boolean` (= `on && !isLive(keys, liveEnv)`).
- Produces: `snapshot(env, { liveEnv } = {})` — rows gain `state: 'pending-restart'` when the feature is configured in `env` but not live; counts gain `pendingRestart`.

- [ ] **Step 1: Write the failing tests** in `tests/console/live-state.test.js`:
  - `isLive(['SONIOX_API_KEY'], null)` → `true`.
  - `isLive(['SONIOX_API_KEY'], {})` → `false`; with `{ SONIOX_API_KEY: 'k' }` → `true`; with `{ SONIOX_API_KEY: 'CHANGEME-x' }` → `false`.
  - `isLive(['A','B'], { A: '1' }, { anyOf: true })` → `true`.
  - `buildCatalog({ ...ESSENTIALS, SONIOX_API_KEY: 'k' }, { liveEnv: ESSENTIALS })` → the ability titled `Understand voice notes` has `on: true, pendingRestart: true`.
  - Same call with `liveEnv: null` → `pendingRestart: false`.
  - `snapshot(fileEnv, { liveEnv: ESSENTIALS }).rows.find(r => r.id === 'stt_soniox').state` → `'pending-restart'`; `counts.pendingRestart` → `1`.
  - Review Focus 1: `snapshot({ ...E, SONIOX_API_KEY: 'new' }, { liveEnv: { ...E, SONIOX_API_KEY: 'old' } })` → `stt_soniox` state `'on'`.
  (`ESSENTIALS` = `{ OPENROUTER_API_KEY: 'sk-or-test' }` plus whatever the default DB driver requires — read it from `feature-availability.js` `requiredEnvFor`/`DB_DRIVERS` rather than hardcoding.)

- [ ] **Step 2: Run to verify failure**
  Run: `npx jest tests/console/live-state.test.js`
  Expected: FAIL — `Cannot find module '../../bot/console/live-state'`.

- [ ] **Step 3: Implement** `isLive` in `bot/console/live-state.js`, importing `isSet` from `bot/shared/services/db/pg-adapter/drivers` (the same one `feature-availability.js` uses). Thread `{ liveEnv }` through `buildCatalog` and `snapshot`; in `snapshot`, compute the existing state first, then downgrade `'on'` to `'pending-restart'` when `!isLive(...)`.

- [ ] **Step 4: Wire the routes** — in `routes/pages.js` `/setup`, `/features` and `/` handlers pass `{ liveEnv: runtime.standalone ? null : process.env }`.

- [ ] **Step 5: Views** — `setup.ejs`: when `ability.pendingRestart`, render `<span class="pill warn">on after restart</span>` and dot class `warn` in place of `on`. `features.ejs`: for `f.state === 'pending-restart'`, render `<span class="pill warn">on after restart</span>` instead of the switch, dot `warn`. Overview's "What's switched on" list (`overview.ejs`): same pill. No inline styles.

- [ ] **Step 6: Run tests**
  Run: `npx jest tests/console`
  Expected: PASS (all console suites, including `no-inline-styles`).

- [ ] **Step 7: Commit**
  ```bash
  git add bot/console/live-state.js bot/console/env-catalog.js bot/console/features.js bot/console/routes/pages.js bot/console/views/setup.ejs bot/console/views/features.ejs bot/console/views/overview.ejs tests/console/live-state.test.js
  git commit -m "feat(console): show 'on after restart' for keys saved but not yet live"
  ```

### Task 2: First-run banner on Activity

**Files:**
- Create: `bot/console/first-run.js`
- Modify: `bot/console/routes/pages.js:113-122` (`/activity`)
- Modify: `bot/console/views/activity.ejs` (banner markup above the privacy banner)
- Modify: `bot/console/assets/console.js` (feed block, lines ~218–262)
- Modify: `bot/console/assets/console.css` (`.banner.first`)
- Test: `tests/console/first-run.test.js`

**Interfaces:**
- Produces: `REPLY_SENT_SOURCE: string` (regex source, `'^✅ (?:WhatsApp|Baileys) message sent|^✅ (?:Template|Video) message sent'`), `isReplySent(record: { msg?: string|null }): boolean`, `NO_ARRIVAL_MS = 90000`.
- Produces: `firstRunModel(query, catalog) → null | { abilitiesOn: number }` — `null` unless `query['first-run'] === '1'`; `abilitiesOn` = number of abilities across `catalog.groups[].abilities` with `on && !pendingRestart`. (Not the Features count: exam checking and test papers are on by default with OpenRouter, so they would read as "2 optional abilities on" on a fresh install.)
- Consumes: `buildCatalog(env, { liveEnv })` from Task 1.

- [ ] **Step 1: Write the failing tests** in `tests/console/first-run.test.js`:
  - `isReplySent({ msg: '✅ Baileys message sent' })`, `({ msg: '✅ WhatsApp message sent' })`, `({ msg: '✅ Template message sent' })`, `({ msg: '✅ Video message sent successfully' })` → `true`.
  - `isReplySent({ msg: '❌ Baileys: error sending message' })`, `({ msg: null })`, `({})` → `false`.
  - `firstRunModel({}, catalog)` → `null`; `firstRunModel({ 'first-run': '1' }, buildCatalog(ESSENTIALS))` → `{ abilitiesOn: 0 }`; with `SONIOX_API_KEY` set (and live) → `{ abilitiesOn: 1 }`.
  - Render check: build the activity view with `first-run=1` via the console's `render` helper used in `tests/console/overview-probes-attribute.test.js` (copy its setup) and assert the HTML contains `Rumi is awake. Say hello.` and `data-reply-pattern="` and no `style="`.

- [ ] **Step 2: Run to verify failure**
  Run: `npx jest tests/console/first-run.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `bot/console/first-run.js`; in `pages.js` `/activity`, pass `firstRun: firstRunModel(req.query, buildCatalog(env, { liveEnv }))` and `REPLY_SENT_SOURCE`.

- [ ] **Step 4: View** — in `activity.ejs`, when `firstRun`: a `<div class="banner first" id="first-run" data-reply-pattern="<%= REPLY_SENT_SOURCE %>" data-no-arrival-ms="90000">` containing three sibling blocks with ids `fr-hello`, `fr-ok` (hidden), `fr-wait` (hidden), copy verbatim from spec A2. The Features link shows only when `firstRun.abilitiesOn > 0`, text `<n> optional abilit(y|ies) on, see Features`, href `<%= mount %>/features`. Re-pair text names the Pinokio sidebar (no link: the console cannot start pair.js).

- [ ] **Step 5: Client** — in `console.js`, after the history fetch has rendered and before subscribing to the live stream: if `#first-run` exists, build `new RegExp(dataset.replyPattern)`; in `addRow` for **live** entries only, on first match hide `fr-hello`/`fr-wait`, show `fr-ok`; start a `setTimeout(NO_ARRIVAL_MS)` that shows `fr-wait` if no live entry has arrived. Toggle with the `hidden` attribute (no inline styles).

- [ ] **Step 6: Manual check** — `npm run console` (or `node bin/rumi.js console`), open `/console/activity?first-run=1`: hello banner shows; after 90 s amber shows; reopen with an existing feed and confirm history alone does not turn it green.

- [ ] **Step 7: Run tests** — `npx jest tests/console` → PASS.

- [ ] **Step 8: Commit**
  ```bash
  git add bot/console/first-run.js bot/console/routes/pages.js bot/console/views/activity.ejs bot/console/assets/console.js bot/console/assets/console.css tests/console/first-run.test.js
  git commit -m "feat(console): first-run banner on Activity that confirms Rumi replied"
  ```

### Task 3: Restart Rumi from the console under Pinokio

**Files:**
- Create: `pinokio/restart.js`
- Modify: `pinokio/start.js:44-60` (bot `env`: add `RUMI_PTERM`, `RUMI_RESTART_SCRIPT`)
- Create: `bot/console/restart.js`
- Modify: `bot/console/routes/api.js` (new `POST /restart`, behind the same guards as `POST /env`)
- Modify: `bot/console/routes/pages.js` (`chrome()` gains `canRestart`), `bot/console/views/partials/nav.ejs` (pending banner button), `bot/console/views/system.ejs`
- Modify: `bot/console/assets/console.js` (button handler + `/health` poll + reload)
- Modify: `docs/console.md` ("What it will not do" → note the Pinokio exception)
- Test: `tests/console/restart.test.js`

**Interfaces:**
- Produces: `restartConfig(env, { standalone }) → null | { pterm: string, script: string }` — `null` unless both vars set, both absolute paths, and `!standalone`.
- Produces: `createRestarter({ config, spawn }) → { restart(): { ok: boolean, reason?: 'unavailable'|'already-restarting' } }` — calls `spawn(config.pterm, ['start', config.script], { detached: true, stdio: 'ignore' })` then `.unref()`; refuses a second call for 120 s.
- Produces: `canRestart: boolean` in every page's chrome model.

- [ ] **Step 1: Pinokio pre-flight (launcher rules)** — re-read `CLAUDE.md` launcher sections and `PINOKIO.md` `script.stop`/`script.start`; record in the PR description: destination `PINOKIO_HOME/api/rumi-platform/pinokio/restart.js`; reference `pinokio/start.js:11-18` for the absolute-uri `script.stop` pattern. Verify `which('pterm')` resolves inside a Pinokio shell: add a temporary `shell.run` `echo {{which('pterm')}}` to a scratch script, run `pterm start` on it, read `pinokio/logs/api/<script>/latest`; delete the scratch script. If it resolves empty, stop and report — the feature depends on it.

- [ ] **Step 2: Write `pinokio/restart.js`** — `run: [ { when: "{{running('start.js')}}", method: "script.stop", params: { uri: "{{path.resolve(cwd, 'start.js')}}" } }, { method: "script.start", params: { uri: "{{path.resolve(cwd, 'start.js')}}" } } ]`. Not added to `pinokio.js` menus.

- [ ] **Step 3: Pass the env** — in `start.js` bot step `env`, add `"RUMI_PTERM": "{{which('pterm')}}"` and `"RUMI_RESTART_SCRIPT": "{{path.resolve(cwd, 'restart.js')}}"` with a comment pointing at `bot/console/restart.js`.

- [ ] **Step 4: Write the failing tests** in `tests/console/restart.test.js`:
  - `restartConfig({}, { standalone: false })` → `null`.
  - `restartConfig({ RUMI_PTERM: '/x/pterm', RUMI_RESTART_SCRIPT: '/x/restart.js' }, { standalone: true })` → `null` (Review Focus 3).
  - same env, `standalone: false` → `{ pterm: '/x/pterm', script: '/x/restart.js' }`; relative paths → `null`.
  - `createRestarter` with a fake `spawn` (returns `{ unref: jest.fn() }`): first `restart()` → `{ ok: true }`, spawn called once with `('/x/pterm', ['start', '/x/restart.js'], { detached: true, stdio: 'ignore' })`; second call → `{ ok: false, reason: 'already-restarting' }` and spawn still called once (Review Focus 2).
  - `createRestarter({ config: null, spawn })` → `restart()` returns `{ ok: false, reason: 'unavailable' }`.

- [ ] **Step 5: Run to verify failure** — `npx jest tests/console/restart.test.js` → FAIL (module not found).

- [ ] **Step 6: Implement** `bot/console/restart.js`; in `api.js` add `POST /restart` → 404 when `restartConfig` is `null`, else `res.json(restarter.restart())`; build the restarter once in the router factory with `require('child_process').spawn`.

- [ ] **Step 7: UI** — `chrome()` sets `canRestart: !!restartConfig(process.env, { standalone: runtime.standalone })`. In the nav partial's pending banner and in `system.ejs` "Applying changes", when `canRestart`: `<button class="btn accent" data-restart>Restart Rumi</button>`; `system.ejs` banner heading becomes "Running under Pinokio, so Rumi can restart itself from here" with the existing terminal/Railway instructions kept below. `console.js`: on `[data-restart]` click → POST `/console/api/restart` (same request helper and headers as the env save), replace the banner with the spec A3 "Restarting Rumi…" copy (a hidden template in the partial, toggled with `hidden`), then poll `fetch('/health', { cache: 'no-store' })` every 2000 ms after a 3000 ms grace; on the first OK after at least one failure, `location.reload()`.

- [ ] **Step 8: Run tests** — `npx jest tests/console tests/setup` → PASS.

- [ ] **Step 9: Manual check under Pinokio** — Install + Start in Pinokio; in the console, save `SONIOX_API_KEY` → Setup shows `on after restart` and the pending banner shows **Restart Rumi**; press it → banner shows restarting → page reloads → row shows `on`; `pinokio/logs/api/restart.js/latest` shows stop then start. Then run the bot with `node bin/rumi.js start` in a plain terminal: no button, original System text.

- [ ] **Step 10: Commit**
  ```bash
  git add pinokio/restart.js pinokio/start.js bot/console/restart.js bot/console/routes/api.js bot/console/routes/pages.js bot/console/views/partials/nav.ejs bot/console/views/system.ejs bot/console/assets/console.js docs/console.md tests/console/restart.test.js
  git commit -m "feat(console): restart Rumi from the console when running under Pinokio"
  ```
