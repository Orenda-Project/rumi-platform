# Pinokio onboarding redesign — spec

Status: proposed · Owner: launcher + console · Plans: `docs/superpowers/plans/2026-11-11-console-first-run-and-restart.md` (Part A), `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md` (Part B)

## Why

Today the Pinokio wizard (`pinokio/onboarding/`) is a five-step rail (Welcome → Credentials → Database → WhatsApp → Done) that ends with "press Start in the Pinokio sidebar". Optional abilities hide in collapsed groups. After setup the operator lands on a console that says nothing about whether Rumi works, and adding a key later means editing in Setup, then finding a way to restart by hand.

This redesign makes setup one screen with three things to plug in, makes **Launch** actually start Rumi, opens the console on proof that it works, and lets an operator running under Pinokio apply a new key with one click.

The design was explored in a clickable mockup (screens 1–10). This document is the source of truth for the build; where it differs from the mockup, this document wins (deviations are listed at the end).

## Part A — console (`bot/console`, `pinokio/restart.js`)

**A1. "On after restart" state.** A key saved while the bot runs is in `.env` but not in the running process. Today the Setup page already calls that ability "on". Instead:
- Setup page ability pill: `on` (in file and in the running process) · `on after restart` (in file, not in process) · `half set up` · `off`.
- Features page: a feature whose keys are satisfied in the file but not in the process shows `on after restart` instead of a switch.
- Standalone console (the wizard's, `standalone: true`) has no running bot: there, "in file" alone means `on`, exactly as today.

**A2. First-run banner on Activity.** `/console/activity?first-run=1` shows a coral banner: "Rumi is awake. Say hello." — "Send `Hi` from your second phone to the number you linked. You won't see your words here, but you'll see Rumi receive it, think, and reply, usually within a few seconds." If any optional ability is on, it adds the link "N optional abilities on, see Features".
- When a feed record arrives whose `msg` matches the reply-sent pattern (`/^✅ (WhatsApp|Baileys) message sent/`), the banner becomes green: "✓ It works. Rumi answered your first message." with links "Go to Overview" and "Add more abilities on Setup".
- If no feed record at all arrives within 90 seconds, the banner becomes amber: "Nothing has arrived yet." — "Check you're messaging the number you linked, from a different phone. If it still doesn't show, use Re-pair WhatsApp in the Pinokio sidebar."
- The feed never shows message content; the banner promises only that you will see Rumi receive and reply.

**A3. Restart from the console, under Pinokio only.** New launcher script `pinokio/restart.js`: `script.stop` start.js, then `script.start` start.js. `start.js` passes the bot two env vars: `RUMI_PTERM` (`{{which('pterm')}}`) and `RUMI_RESTART_SCRIPT` (absolute path of restart.js). When both are set and the console is not standalone:
- `POST /console/api/restart` spawns `RUMI_PTERM start RUMI_RESTART_SCRIPT`, detached, and returns `{ ok: true }`. No request input reaches the command.
- The "saved changes not applied yet" banner and the System page show a **Restart Rumi** button. While restarting: "Restarting Rumi… Pinokio is stopping and starting it. This page comes back on its own when Rumi answers again, usually within a minute. Rumi won't answer teachers until it's back." The page polls `/health` every 2 s and reloads when it answers.
- Without those env vars (plain terminal, Railway) nothing changes: the existing "There is no restart button, on purpose" text stays.

## Part B — wizard (`pinokio/onboarding`, `pinokio/onboard.js`)

**B1. Three screens replace the five-step rail.**
1. *Asleep* — "Rumi is asleep." Lede: "An AI teaching companion that lives in WhatsApp. Plug in three things to wake it up. It takes about fifteen minutes." A plug board: the Rumi mark (two dots and a smile, navy) in a grey circle, wired by animated dashed lines along which a glowing spark runs down and splits into three, one per socket; each socket's border glows the same orange as its spark lands (all still/hidden under reduced motion) to three sockets (Memory "Where Rumi remembers its teachers, lessons and assessments. It lives on this computer, so there is nothing to sign up for.", Brain "The AI that reads each message and writes the reply. Paste an OpenRouter key here; a few dollars goes a long way." with the OpenRouter key field, folded away until the card (or its "Add your key ›" button) is clicked (same save and probe as the Brain jack; its result carries to the plug-in screen), Voice "How teachers talk to Rumi. You link a WhatsApp number, then message it from a second phone.", each with a gently animated emoji (💾 Memory, 🧠 Brain, 💬 Voice), all the same size), then a **Wake Rumi** button. On a phone the sockets stack into one chain. Keeps today's problems notice.
2. *Plug in* — heading "Plug in three things. Rumi wakes up." Three jacks, then Optional abilities, then the Launch bar.
3. *Launching* — see B3.

**B2. The three jacks.** Each card: icon tile, title, subtitle, status (`OFF` / `ON` / `LOCKED`), body.
- **Memory** (database). Default is the built-in database: nothing to type; status `ON` when `GET /api/db/state` reports `ready`, or `stopped` for the built-in database (it is created by the first Start, as `steps/database.js` already treats it). A link "Use Supabase or another Postgres instead" reveals the existing database fields. The manual-tables step ("Copy the SQL / Open Supabase editor / I pressed Run") appears only for Supabase, reusing today's database step.
- **Brain** (`OPENROUTER_API_KEY`), the existing field with its probe. `ON` when set and the probe passes.
- **Voice** (WhatsApp). `LOCKED` until Memory and Brain are both `ON`; then the existing pairing flow. `ON` when linked.
- Each jack has an (i) button beside its status that shows a short note on what that part is for and which service it uses.
- Icons (inline SVG, 24×24 viewBox, `stroke: currentColor`, stroke-width 1.7, round caps/joins). Tile gold line on navy when off, navy line on gold when on, 45% opacity when locked.
  - Memory: `<ellipse cx="12" cy="5.5" rx="7" ry="2.6"/><path d="M5 5.5v12.6c0 1.45 3.13 2.6 7 2.6s7-1.15 7-2.6V5.5"/><path d="M5 11.8c0 1.45 3.13 2.6 7 2.6s7-1.15 7-2.6"/><path d="M15.5 9.6v.01M15.5 15.9v.01" stroke-width="2.4"/>`
  - Brain: `<path d="M12 5.5a2.6 2.6 0 0 0-4.9-1A3 3 0 0 0 4.6 8.3a3.1 3.1 0 0 0 .2 5.2 3 3 0 0 0 2.4 4.6A2.7 2.7 0 0 0 12 19.2z"/><path d="M12 5.5a2.6 2.6 0 0 1 4.9-1 3 3 0 0 1 2.5 3.8 3.1 3.1 0 0 1-.2 5.2 3 3 0 0 1-2.4 4.6 2.7 2.7 0 0 1-4.8 1.1"/><path d="M8.3 9.2c1 .1 1.9.8 2.1 1.8M15.7 9.2c-1 .1-1.9.8-2.1 1.8M8.6 14.6c.9-.5 2-.4 2.7.3M15.4 14.6c-.9-.5-2-.4-2.7.3"/>`
  - Voice: `<path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v7.5a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.6v-3.6A2.5 2.5 0 0 1 4 14V6.5A2.5 2.5 0 0 1 6.5 4z"/><path d="M9 8.8v2.7M12 7.4v5.5M15 8.8v2.7"/>`

**B3. Optional abilities, inline.** Panel heading "Optional abilities", counter "N of M on", blurb: "Not needed to wake Rumi up. Each one switches on the moment its key is added. Tap one to paste its key, or add it any time later from the console's Setup page." Items come from the catalog's non-core groups (`/api/state`), grouped as the catalog groups them; each item shows title and pill (`ADD KEY` / `ON` / `NEEDS MORE`). Each item has an (i) button that shows its `why`, the service its `where` points at (e.g. `soniox.com`) and its key names. Tapping the item opens it full-width with the existing per-key fields (label + env name, "Get it at …"), and Save. Abilities the catalog marks as a channel card with a multi-step guide (Matrix) show the pill `IN CONSOLE` and a note instead of fields. Optional abilities never gate Launch.

**B4. Launch actually starts Rumi.** Launch unlocks when all three jacks are `ON`. Pressing it:
1. `POST /api/launch` → server picks the bot port (`node scripts/pick-port.js bot`, which `start.js` will reuse because it is free and remembered), then spawns `RUMI_PTERM start <abs start.js>` (env from `onboard.js`), returns `{ port }`.
2. The page shows four steps with live state — "Saving your keys", "Closing the setup wizard", "Starting Rumi", "Waiting for Rumi to answer" — and polls `http://127.0.0.1:<port>/health` (no-cors, as `home.html` does) every 2 s.
3. Answer → "Rumi is awake." with **Open the console** → `http://127.0.0.1:<port>/console/activity?first-run=1` in the same tab.
4. No answer within 120 s → "Rumi is stirring, not awake." — "Rumi started but hasn't answered in two minutes. The terminal shows what it's stuck on, and tech support can read it too." with **Back to the jacks**.
5. If `RUMI_PTERM` is missing, `/api/launch` returns `{ port, manual: true }` and the page says "Press Start in the Pinokio sidebar" and still polls.

## Global rules (both parts)

- Every user-facing title/why/where comes from `bot/scripts/setup/fields.js` and `bot/console/env-catalog.js`; no copy is duplicated in the launcher.
- Wizard: loopback only, no CORS; only `bridge.js` requires Rumi modules. Console: `style-src 'self'` (no inline style attributes), no CORS.
- Feature gating stays presence-based: there are no "on" switches, only keys present or absent (plus the existing off-switches on Features).
- Repo is public: no internal names, phone numbers or ticket ids in code or docs (CI: `tests/setup/source-hygiene.test.js`).

## Revision: Memory is no longer a jack

The built-in database needs nothing from the operator, so Memory is not something to plug in.
- Landing: two sockets, Brain and Voice ("Plug in two things"). Plug-in screen: two jacks ("Plug in two things. Rumi wakes up."), Launch unlocks when both are lit.
- "Keep the data in Supabase" and "Keep the data in your own Postgres" are ordinary optional abilities under Advanced. A chosen one keeps its card (rebuilt from `/api/state`'s `databaseCards` and the required rows its keys move into).
- When a chosen database is not ready, a "Your database" block above the optional list shows the existing database step (helper paste, tables), Voice stays locked with "Unlocks once your database is ready: finish it under Optional abilities below.", and the Launch bar says a chosen database has to be ready first. `jackStates` is unchanged: `memory` still gates Voice and Launch.

## Revision: one page

The plug-in screen is gone; setup is one page plus the launching screen.
- Hero: the plug board with Brain (OpenRouter key field behind "Add your key ›") and Voice, each with an ON / OFF / LOCKED label.
- **Wake Rumi** opens a section under the hero and scrolls to it: the Voice card (WhatsApp linking), Optional abilities (each with an emoji; a chosen database's "Your database" step above the list), the Launch bar and "Check everything". "Back to the jacks" on the launching screen returns here with that section open.

## Deviations from the mockup

- The mockup's separate "full descriptions" screen (4) is dropped: inline items already show the same `why` when opened.
- The mockup's Memory jack asked for Supabase by default. `main` now defaults to a built-in database, so Memory needs no input by default and the tables step is Supabase-only.
- The mockup said the console "opens on Overview from now on" after the first reply. Not built: the first-run banner only appears via the wizard's `?first-run=1` link, so later visits open on Overview anyway.
