# /setup - Platform Setup

> **Up:** [.claude/CLAUDE.md](../../CLAUDE.md) (config & skills router) · **Architecture overview:** [digital-coach](../digital-coach/SKILL.md)

Setting up a Rumi deployment. Once the bot is running, the [digital-coach](../digital-coach/SKILL.md) skill
is the map to everything else.

## Two ways in — pick the right one before you touch anything

Setting Rumi up is one sequence with two front doors. Both are first-class; they differ only in who types.

|  | **`rumi setup`** | **"Set me up"** (this skill) |
|---|---|---|
| Who answers the questions | the user, in their own terminal | the user, in conversation with you |
| Needs a TTY | yes | no |
| Use when | they want to drive it themselves | they asked *you* to do it |

### Never run the interactive commands yourself

**`rumi setup`, `rumi pair` and `rumi graduate` are interactive TTY programs** — arrow-key menus, masked
input, a QR code to scan with a phone. Launched from a tool call they stop at the first prompt and wait
forever, because there is no keyboard attached. If the user should run one, *tell them to* and stop.

| Agent-safe (non-interactive) | Human-only (needs a keyboard) |
|---|---|
| `./install.sh` — skips its one prompt when stdin isn't a terminal | `rumi setup` |
| `rumi doctor` (same as `npm run doctor`), `rumi status` | `rumi pair` — also needs a phone to scan |
| `npm run validate:env`, `npm run bootstrap:db`, `npm test` | `rumi graduate` |

If `rumi` isn't on the PATH, `node bin/rumi.js <command>` is identical — and each has an `npm run` equivalent
in `package.json`, which is the safer form to reach for inside a tool call.

## Doing it yourself: the "set me up" flow

Use the wizard's **own modules** rather than a prose re-implementation. They are the same code `rumi setup`
runs, so the two paths cannot drift, and you inherit every shape check and live probe for free.

### A. Collect the values, in plain language

Ask for one service at a time, in the user's terms — "the project URL from Supabase", never `SUPABASE_URL`.
The order that works: database → AI → Redis → optional extras → WhatsApp.

**Check each answer with the real validator before you accept it.** These exist because the expensive
mistakes are *well-formed values for the wrong thing*, and they name the specific fix:

```js
const v = require('./bot/scripts/setup/validators');
v.supabaseServiceKey(pasted);  // → { ok:false, reason:'That is the anon (public) key…' }
v.phoneNumberId(pasted);       // → catches a phone number in Meta's id field
v.openrouterKey(pasted);       // → names which vendor's key was pasted by mistake
v.validatorFor('ANY_ENV_VAR'); // → the right one, or a presence check
```

A validator may return a cleaned `value` (trimmed URL, wrapped `host:port`) — store that, not the raw paste.

### B. Write them to `.env`

```js
const { readEnvFile, writeEnvVars } = require('./bot/scripts/setup/env-file');
writeEnvVars('.env', { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key },
  { fromTemplatePath: '.env.template' });
```

Patches in place — every comment, every unrelated var untouched. **Write after each service, not at the end**,
so an interrupted conversation costs nothing. Never regenerate `.env` from the template.

### C. Verify against the live service

"Set" is not "working". Use the same probes the doctor uses:

```js
const { defaultProbes } = require('./bot/scripts/setup/doctor');
await defaultProbes.supabase(env);    // { ok, detail }
await defaultProbes.openrouter(env);  // also reports the credit balance
await defaultProbes.redis(env);
```

A valid OpenRouter key with **no credit** is a distinct case: it answers greetings and then fails on anything
substantial. Tell the user, and let them decide whether to add credit now.

### D. Create the tables

```js
const db = require('./bot/scripts/setup/db-setup');
await db.inspectDatabase(env);   // 'ready' | 'needs-schema' | 'needs-helper' | 'unreachable'
```

- **`ready`** — nothing to do.
- **`needs-schema`** — run `db.applySchema(env)` (or `npm run bootstrap:db`). `applySchema` re-checks that
  `users` exists afterwards — do not treat a bootstrap log as success without that.
- **`needs-helper`** — **this step needs the user's hands.** Supabase exposes no API for arbitrary SQL, so the
  `exec_sql` function the schema is applied through has to be pasted in once. Give them the full
  `db.EXEC_SQL_DEFINITION` (function + ALTER OWNER + GRANT + NOTIFY — not the old two-line version; OWNER
  postgres is required for CREATE EXTENSION) and `db.sqlEditorUrl(env.SUPABASE_URL)` — a link straight to
  *their* project's SQL editor — then wait with `db.waitForExecSql(env)` (PostgREST caches the schema; a
  single `hasExecSql` right after paste often 404s), then apply. **Do not continue setup if the helper is
  still missing or `users` is still absent.** That is the PGRST205 / `Cannot read properties of null
  (reading 'id')` crash on "Hi".
- **`unreachable`** — the key was rejected or the host didn't answer; don't proceed as if there were no tables.

### E. Connect WhatsApp

Ask the plain-language question, not "which channel driver":

> **Just trying it out** — links their own WhatsApp like WhatsApp Web. Nothing to register.
> **Real deployment** — an official WhatsApp Business number through Meta.

**Trying it out:** write `CHANNEL_DRIVER=baileys`, `QUEUE_DRIVER=bullmq` (the template default is `sqs`, which
needs an AWS account they do not have) and `CHANNEL_STATE_DIR=.channel-state`. Then **hand pairing to the
user** — it needs a phone camera:

> Run `rumi pair` in your terminal and scan the code with WhatsApp → Settings → Linked devices.

Say the caveats first: it becomes a linked device on their personal account and can see their chats; the
Meta-only surfaces (tap-through forms, approved templates, picture carousels) render as an ordinary chat
instead; and **they need a second phone number to message it from**, because Rumi *is* their number.

**Real deployment:** the four Meta values, with the on-page names and guidance already written in
[bot/scripts/setup/fields.js](../../../bot/scripts/setup/fields.js) (`META_FIELDS` — use its `label`, `hint`
and `validate`; `WEBHOOK_VERIFY_TOKEN` has a `generate()`). Then `defaultProbes.whatsapp(env)`, then
`META_REMAINING_STEPS` for what only they can do in Meta's console.

### F. Finish

Run `rumi doctor` and read it back in plain language. Then tell them: `rumi start`, message the number from
their **second** number, and try `Hi`, `/menu`, `/reading test`.

### What you add that the wizard cannot

1. **Deciding which path they're on** — trying it out vs a real deployment changes everything downstream. If
   they haven't said, ask. See
   [docs/onboarding/sandbox-production-design.md](../../../docs/onboarding/sandbox-production-design.md).
2. **Explaining *why* a step exists** when someone stalls, and interpreting a failure in their words.
3. **The production steps below** — hosting, the Meta webhook, Flow registration, the background worker.
4. **Customization afterwards** — the table at the end.

## Production steps the wizard does not do


### Deploy

Rumi runs on any Node host. **Railway** is the documented default, and what
`infrastructure/railway/` is configured for:

```bash
cd bot && npm install && cd ..
railway login
railway up
```

For Railway specifics — scaling, logs, the worker process — see
[docs/railway-operations.md](../../../docs/railway-operations.md).

### Configure the WhatsApp webhook (Meta only)

1. Meta Business Manager → WhatsApp → Configuration → Webhook
2. Callback URL: `https://your-app.up.railway.app/webhook`
3. Verify token: the same value as `WEBHOOK_VERIFY_TOKEN` in `.env` (the wizard calls this the "webhook
   password" and can generate one)
4. **Subscribe to the `messages` field** — without it Meta accepts the URL and then never sends anything,
   which looks exactly like a broken bot

### Register WhatsApp Flows & templates (Meta only)

Flows are Meta-only interactive forms. On the sandbox channel they are not used at all — the same endpoint
logic is rendered as a text conversation instead (see
[bot/shared/services/messaging/text-flow-definitions.js](../../../bot/shared/services/messaging/text-flow-definitions.js)),
so there is nothing to register.

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-app.up.railway.app
```

It generates the RSA-2048 keypair, registers the Flows, and submits the message templates. Set the values it
prints as env vars on the host: `READING_ASSESSMENT_FLOW_ID`, `ATTENDANCE_SETUP_FLOW_ID`,
`ATTENDANCE_MARKING_FLOW_ID`, `REGISTRATION_FLOW_ID`, `FLOW_PRIVATE_KEY` (base64).

### Background worker

The coaching pipeline needs the stale-session worker on a schedule (every 15 minutes):
`node bot/workers/stale-session.worker.js`. See SETUP.md Step 11.

### Test

Send "Hi" to the number. Expected: a welcome message and the registration prompt. If nothing arrives, check
the webhook is subscribed to `messages`, then the host's logs.

## Feature gating (presence-based, no tiers)

A feature is on iff the env vars it needs are present — there is no tier flag and no master switch. The
wizard's step 4 offers the common ones; anything can be added later by setting its key and restarting.
`rumi status` and `rumi doctor` both list what is currently on and which key would switch each remaining one
on.

| To run… | Set these (on top of the core) |
|---------|-------------------------------|
| **Core** (AI chat + registration) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `OPENROUTER_API_KEY`, + the channel's own vars |
| Voice notes / reading assessment | `SONIOX_API_KEY` |
| Spoken replies | `ELEVENLABS_API_KEY` (+ `UPLIFT_API_KEY` for Urdu/regional) |
| Reading pronunciation scoring | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| Lesson-plan generation | `GAMMA_API_KEY` |
| Educational video | `VIDEO_GENERATION_ENABLED=true` + `KIE_API_KEY` |
| Exam-checker OCR | `MISTRAL_API_KEY` or `CHANDRA_API_KEY` |

The single source of truth is
[bot/shared/config/feature-availability.js](../../../bot/shared/config/feature-availability.js) — read it
rather than trusting this table if they disagree.

## Resuming

Both halves resume: `rumi setup` saves each answer to `.env` as it is given and skips whatever already works,
so re-running after an interruption costs a few seconds. Flow registration keeps its own progress in
`.setup-state.json`, which `rumi doctor` reads to report which Flows are registered.

## After Setup: Customization

Once running, see these docs for customization:

| Want to... | Read |
|-----------|------|
| Swap coaching framework (OECD to Teach) | [docs/agent-customization.md](../../../docs/agent-customization.md) section 1 |
| Change reading assessment method | [docs/agent-customization.md](../../../docs/agent-customization.md) section 2 |
| Add new languages | [docs/agent-customization.md](../../../docs/agent-customization.md) section 4 |
| Set up monitoring | [docs/monitoring.md](../../../docs/monitoring.md) |
| Change branding | [docs/customization.md](../../../docs/customization.md) |
| Add new features | [docs/agent-customization.md](../../../docs/agent-customization.md) section 7 |

## Full Manual Setup

For detailed step-by-step instructions, follow [SETUP.md](../../../SETUP.md).
