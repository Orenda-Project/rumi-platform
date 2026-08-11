# Onboarding Revamp — Sandbox vs. Production Channel Design

> **Status: implemented on `feat/channel-driver-onboarding`, not yet merged; live-verified end to end.**
> Every section (§1–§6) has real code behind its core claims — see [Implementation
> status](#implementation-status) at the bottom for the exact, itemized state of each section (not every
> sub-detail each section originally sketched was built — e.g. §6's proposed Baileys-session offline probe
> in `doctor.js` was not).
>
> **Outbound — live-verified**, against a real WhatsApp account over a real network connection (not
> mocked): `npm run pair:baileys` completing a real QR pairing, plus all 11 non-stub `WhatsAppService`
> methods (`sendMessage`, `sendReaction`, typing indicators, `sendImage`, `sendDocument`, `sendAudio`,
> `sendVideo`, `sendSticker`, and the text-rendered interactive fallbacks) delivering real content through
> the full facade chain and confirmed received on the far end. `*FromUrl` variants are untested here only
> because this environment has no R2 credentials configured — a pre-existing, unrelated gap.
>
> **Inbound — live-verified on `baileys@7.0.0-rc14`**, running the real bot (`whatsapp-bot.js`,
> `CHANNEL_DRIVER=baileys`) and messaging it from a second, real WhatsApp account. All four supported
> inbound types went through `baileys-socket.adapter.js` → the unmodified webhook dispatch logic → the real
> handler:
> - **text** → `handleTextMessage` → AI response → reply delivered and confirmed readable on the far end,
>   both on a fresh pairing AND after a process restart with no re-pair (the case that failed every time
>   before the fixes in item 3 below).
> - **image** → `pic_lp` handler, classified, replied.
> - **voice note** → correctly typed `voice` from the `ptt` flag → `handleVoiceMessage` → ASR routing.
> - **document** → `handleDocumentMessage` with filename and mimetype preserved.
>
> **Features — live-verified end to end** in a later pass, once the sandbox could actually reach them (see
> §8 for the mechanism and [Implementation status](#implementation-status) for the bug list). Each of these
> was driven from a real WhatsApp client and the *reply read back from the chat*, not inferred from logs:
>
> | Feature | Verified outcome on the sandbox |
> |---|---|
> | `/menu` | text menu (Meta's carousel has no Baileys equivalent) |
> | `/language`, `/settings` | preferences written to `users.preferences` — confirmed in the DB |
> | `/video` | grade → subject → topic, then a **real curriculum video delivered** from the imported library |
> | `/reading test` | name → language → mode → level → scope, then the **passage image + instructions**; a real recording of the passage scored end to end — transcript, **WCPM and accuracy**, and the **PDF report delivered** (`status='completed'`) |
> | `set up class` / `add class` | class + roster created; `"Zara s/o Abdul"` split into student/father; optional parent phone captured |
> | `/quiz <topic>` | class picker → **10 questions generated → delivered to the parent → answered → explanation → next question**; answers persisted |
> | image (worksheet photo) | classified, then **vision feedback naming strengths and suggestions** |
> | voice note | Soniox transcription with per-token timings and auto language detection |
> | `/status`, `/portal` | accurate answers, including an honest "not configured on this deployment" |
>
> Anything still requiring a key says so plainly rather than pretending: video *generation* needs
> `KIE_API_KEY`, lesson plans need `GAMMA_API_KEY`, pronunciation scoring needs `AZURE_SPEECH_KEY`.
>
> **Real bugs this live pass found and fixed** (none of them caught by unit tests or code review — see
> each file's doc comments and `tests/messaging/` for regression coverage):
> 1. `baileys-pair.js` attached its success listener to the first socket's own `ev`, but Baileys does an
>    internal reconnect right after pairing (a brand-new socket) the stale listener never saw — fixed via
>    the persistent `connection.events` emitter in `baileys-connection.js`.
> 2. `getSocket()` resolved as soon as `makeWASocket()` returned a socket shell, not once the connection was
>    actually open — a real send hit "Connection Closed" before the transport was ready. Fixed in
>    `baileys-connection.js`.
> 3. **THE BIG ONE — replies were sent to destinations that do not exist, so the recipient's phone showed
>    "Waiting for this message. This may take a while." forever.** Baileys reports such a send as
>    successful, so the logs looked perfectly healthy throughout. Two stacked causes:
>    - **`baileys@6.7.23` predates WhatsApp's LID (phone-number-privacy) addressing.** It has no
>      `LIDMappingStore`, so an `@lid`-addressed chat could not be resolved to a real phone number.
>      Fixed by upgrading to **`baileys@7.0.0-rc14`**, which owns LID↔phone mapping natively
>      (`sock.signalRepository.lidMapping.getPNForLID()`, persisted as `lid-mapping-*.json` — a fresh
>      pairing wrote 706 of them). The adapter now consults that store first, keeping the old
>      `key.senderPn` scrape only as a fallback. **The upgrade required no other code changes** — every
>      API this driver uses survived 6→7 unchanged, which the `baileys-lib.js` wrapper + lazy loading made
>      easy to verify.
>    - **Then our own JID parsing swallowed the fix**: 7.x's `getPNForLID()` returns a *device-scoped*
>      JID (`<number>:0@s.whatsapp.net`). `jidToPhoneNumber()` stripped `@server` but not `:device`, and
>      `toJid()`'s strip-non-digits then turned `<number>:0` into `<number>0` — the real number with a
>      trailing zero, i.e. still a nonexistent destination. Both functions now drop the device suffix
>      explicitly, and both are regression-tested.
>
>    Diagnostic note worth keeping: three earlier hypotheses for this symptom (lost Signal state on an
>    unclean SIGTERM, an unanswerable retry receipt, and concurrent-send ratchet corruption) were all
>    **wrong** — each produced a real, defensible hardening fix (see 3a/3b/3c below) but none was the
>    cause. The symptom was never a crypto/ratchet problem at all; it was a bad address. The lesson: when
>    a send "succeeds" but never arrives, verify the destination before theorising about encryption.
>
> 3a. **No graceful shutdown**: `whatsapp-bot.js` had no SIGTERM/SIGINT handler and `baileys-connection.js`
>    had no `close()`, so an abrupt exit could lose Baileys' not-yet-flushed auth state. Kept because a PaaS
>    redeploy SIGTERMs the process on *every* release; `close()` ends the socket without logging out (the
>    pairing survives), suppresses the auto-reconnect `end()` would otherwise trigger, and holds a short
>    flush window.
> 3b. **Retry receipts were unanswerable**: Baileys' `getMessage` config hook defaults to
>    `async () => undefined`, and its own source carries a TODO that the consumer must supply the store.
>    Without it `sendMessagesAgain()` can never recover the original content, so a recipient that fails to
>    decrypt is never sent a resend. Now backed by a bounded (256-entry, in-memory only — it holds
>    decrypted outgoing content) store of recently sent messages.
> 3c. **Concurrent sends on one socket**: this bot emits several sends per inbound message (reaction,
>    typing presence, reply) with the continuous typing indicator firing on a timer *during* the reply, so
>    overlap is the normal case. All `sock.sendMessage()` calls are now serialised through one queue.
>    NousResearch's hermes-agent bridge independently hit and documented this: "overlapping sends are the
>    root cause of cross-chat contamination — the WhatsApp protocol-level routing can misdeliver when two
>    sendMessage() Promises race on the same socket."
> 4. **Baileys occasionally redelivers the identical message** (same `key.id`) via `messages.upsert` within
>    under a second — observed live for both an image and a document, each fully processed and replied to
>    twice. The pre-existing Redis-backed dedup in `session.service.js` has an inherent network round-trip
>    race window and didn't reliably catch it. Fixed with an in-memory `isDuplicateDelivery()` guard in
>    `baileys-socket.adapter.js` — synchronous, zero network dependency, catches the redelivery before either
>    delivery ever reaches that race.
> 5. **A logged-out session could become an infinite restart loop against WhatsApp's pairing endpoint.**
>    `baileys-connection.js` correctly refuses to auto-reconnect on `DisconnectReason.loggedOut` (401) — but
>    that only protects the *current* process. Every real supervisor (systemd, PM2, Docker
>    `restart: always`, Railway) restarts on exit, and each restart re-attempts pairing against dead
>    credentials. This is how live testing repeatedly tripped WhatsApp's "can't link new devices right now"
>    limit. A logout is now TERMINAL: `whatsapp-bot.js#exitOnChannelLogout()` logs the remedy (delete the
>    auth dir, run `npm run pair:baileys`) and exits **78** (sysexits' `EX_CONFIG` — "don't just restart me,
>    fix the config"), so a supervisor's backoff surfaces it to a human instead of spinning silently.
>    Covered by `tests/messaging/channel-lifecycle.test.js`.
> 6. **Interactive menus rendered but were unanswerable — the bot's whole interaction model was a dead end
>    on this driver.** The driver renders Meta's buttons/lists as numbered plain text, which was only half a
>    feature: the user's "1" arrived as an ordinary text message, never matched
>    `messageType === 'interactive'`, and fell through to general AI chat. An audit found the scale — **37
>    call sites across 5 methods, feeding 33 distinct button/list ID families** (`coaching_confirm_*`,
>    `lang_*`, `style_*`, `menu_*`, `quiz_*`, `pic_lp_start_*`, `reading_grade_*`, …). Compounding it, the
>    Baileys option constants had been reimplemented **without the `id` fields**, so there was nothing to
>    route back to even in principle.
>    Fixed with one bridge rather than 37 changes: ids restored to match `meta-channel.service.js` exactly;
>    `pending-options.js` records the offered `{number -> id}` map per user (Redis-backed with in-memory
>    fallback + TTL, same pattern as `session.service.js`); and the inbound adapter synthesises the exact
>    `interactive.button_reply` / `list_reply` payload Meta would have sent. **Dispatch logic is untouched.**
>    Live-verified end to end: `/language` → numbered menu → typed `2` → `🔢 numeric reply resolved` →
>    `📋 Interactive list item selected` (the original Meta branch) → `✅ User language updated` in the DB.
>    Deliberately strict: only a bare in-range number counts, so ordinary prose while a menu is open still
>    reaches normal text handling.
>
>    **Native tappable buttons were investigated and are NOT achievable on this channel — established
>    empirically, so nobody needs to retry it.** Prompted by `ourin-baileys`, a Baileys fork advertising
>    native interactive support, we ran a live spike on plain upstream `baileys@7.0.0-rc14`:
>    - rc14 already has every protobuf needed (`IInteractiveMessage`, `INativeFlowMessage`,
>      `INativeFlowButton{name,buttonParamsJson}`, and `interactiveResponseMessage` +
>      `nativeFlowResponseMessage{name,paramsJson}` for decoding a tap). It only lacks a builder helper, so
>      the message was constructed by hand and sent with `relayMessage()`.
>    - Attempt 1 (protobuf only): accepted by the socket, returned a message id, **never delivered**.
>    - Attempt 2 added the `<biz>` stanza node — `{tag:'biz', content:[{tag:'interactive',
>      attrs:{type:'native_flow', v:'1'}, content:[{tag:'native_flow', attrs:{v:'9', name:'mixed'}}]}]}`
>      passed via `additionalNodes`, which rc14 supports (`Socket/messages-send.js` destructures it at
>      `relayMessage` and pushes it into the stanza). This node is *precisely* `ourin-baileys`' entire
>      value-add, copied from its `Modded/message_builder.js`. Also **never delivered**.
>    - Control: a plain text message over the *same* connection arrived immediately — so the session was
>      healthy and the failure is specific to interactive content.
>
>    Conclusion: WhatsApp drops nativeFlow/interactive messages from a non-Business sender server-side. No
>    client library can change that, and `ourin-baileys` would fail identically. The numbered-text menu plus
>    the numeric-reply bridge above is therefore not a stopgap — it is the correct design for this channel.
>    (Independent reasons to avoid that fork anyway: it ships compiled-only with no repository, its
>    `Signal/libsignal.js` is an OLDER 7.x snapshot missing rc14's `hasSenderKey`/`getSessionInfo`/`close()`,
>    and its protobufs contain **zero** `interactiveResponseMessage` definitions — it could send taps it
>    could not decode.)
> 7. **`rumi doctor` silently loaded no environment variables at all**: `bin/rumi.js` lives at the repo root,
>    but `dotenv` is only a dependency of `bot/package.json` — a bare `require('dotenv')` there throws
>    `MODULE_NOT_FOUND`, silently swallowed by a `try/catch`, so `.env` never loaded and every required var
>    reported "missing" even on a fully-configured deployment. Fixed by resolving `dotenv` via
>    `bot/node_modules` explicitly, the same place every `bot/scripts/setup/*.js` file already loads it from.
>
> **CLI — live-verified end to end**: `install.sh` (dependency check, root + `bot/` `npm install`, idempotent
> `.env` creation — confirmed it leaves an existing `.env` untouched, declined the `npm link` prompt and got
> the correct fallback instructions), `rumi doctor` (after the dotenv fix above, correctly reports live
> Supabase/OpenRouter/Redis checks), `rumi setup` (the full interactive wizard — Supabase → Redis → AI keys →
> channel choice — end to end; confirmed it patches `.env` surgically, appending only the one new value
> `CHANNEL_DRIVER=baileys` and touching nothing else), and `rumi graduate` (confirmed the safety path: given
> placeholder Meta credentials, it live-validates, fails loud, and leaves both `.env` and the active
> `.channel-state/baileys` session completely untouched). Not verified: `rumi graduate`'s success path
> (flipping to a real, working Meta target) — this environment has no real Meta Business App/WABA to test
> against.
>
> **Known, out-of-scope limitations surfaced by live testing** (environment/infra, not this branch): the
> `@lid` cache is session-scoped and empty on every restart, so the very first message from a contact after
> a restart can still briefly mis-resolve if it arrives via the offline-catchup path; a public/proxied Redis
> connection (needed only because this sandbox can't reach Railway's private `redis.railway.internal`) was
> visibly flaky; repeated forced restarts of the bot process (an artifact of this specific sandbox, not
> normal usage) caused visible WhatsApp session desync ("waiting for this message" on the recipient's end),
> resolved by a fresh re-pair — a real WhatsApp/Baileys characteristic under rapid reconnects, unlikely to
> affect a normally-run, continuously-up deployment.

## Context

Rumi's onboarding today ([`SETUP.md`](../../SETUP.md), [`.claude/skills/setup/SKILL.md`](../../.claude/skills/setup/SKILL.md))
is an 11-step, mostly-manual flow that assumes two things that no longer hold for every user: (1) that
everyone can and will set up a real Meta WhatsApp Business App before they can try the bot at all, and (2)
that a native coding agent (Claude Code) is present to drive the process conversationally. Neither is true
for a developer who just wants to try Rumi in five minutes, or for an organization evaluating it before
committing to Meta's app-review process.

Inspired by NousResearch's `hermes-agent` — a **two-layer CLI** (`install.sh` for mechanical bootstrap, then
the `hermes` command itself for `setup`/`doctor`/`status`/gateway config) plus a graduated "start
lightweight, scale to real infra" backend switch — this design splits onboarding into two umbrellas:

- **Sandbox** (default): the general case — zero formal business registration needed. Baileys (WhatsApp Web
  protocol) is the only sandbox driver in v1, but sandbox is not "Baileys specifically" — it's *every*
  driver that isn't Meta. Slack, Telegram, Signal, etc. are all sandbox-tier the moment they're added, with
  no re-classification needed.
- **Production**: **Meta only**, for v1 and structurally going forward — Meta's WhatsApp Cloud API is the
  one channel that requires a formal Business App + app-review process, which is what actually makes
  something "production-grade" here. Nothing else currently in scope has that requirement.
- **Graduation**: an explicit, scripted path from sandbox to production once an org is ready — command
  name: `rumi graduate`.

And it replaces the "you need Claude Code to onboard well" gap with a two-layer CLI (`install.sh` +
`rumi <command>`) that any user can run standalone, no native coding agent required.

**Design principles this revision locks in:**
1. The driver abstraction is a **registry with an explicit production allowlist**
   (`PRODUCTION_TIER_DRIVERS = ['meta']`), not a per-driver tag that has to be set correctly by hand.
   Default assumption for any driver, present or future, is sandbox — meta is the one opt-out.
2. Local per-driver session/auth state lives under **one generic root env var**
   (`CHANNEL_STATE_DIR`, namespaced by driver subfolder), not a new one-off env var + folder per driver.
3. Commands are named and shaped like Hermes's: `./install.sh` (one-time mechanical bootstrap) → `rumi
   setup` (interactive wizard), `rumi graduate`, `rumi doctor`.
4. The wizard's channel question uses plain language, not jargon: **"Just testing things out"** (default)
   vs. **"Real deployment — I have everything I need"** — the technical `CHANNEL_DRIVER` value is set behind
   that choice, never shown as the question itself.

v1 scope: only **Baileys ships as a driver so far** (sandbox itself is open-ended by design — the registry
is N-channel-shaped from day one, Slack/Telegram are future registry entries, not a future rearchitecture);
the setup wizard is **fully interactive** for every required var, not just channel choice; graduation is a
**real `rumi graduate` command**, not docs-only.

## Flow at a glance

```
                        ┌─────────────────────┐
                        │    ./install.sh      │   one-time mechanical bootstrap:
                        │  (mechanical layer)  │   deps, npm install, .env copy,
                        └──────────┬───────────┘   wires up the `rumi` command
                                    │
                                    ▼
                        ┌─────────────────────┐
                        │     rumi setup       │
                        │  (fully interactive) │
                        └──────────┬───────────┘
                 ┌──────────────────────────────────┐
                 │ Supabase → Redis → AI keys        │  (channel-independent,
                 │ (bootstrap:db, validate:env)      │   same for every driver)
                 └──────────────────┬─────────────────┘
                                    │
                 "How are you using Rumi right now?" (plain-language, not jargon)
              [Just testing things out] (default)   [Real deployment — I have everything I need]
                     → any sandbox-tier driver               → meta (the sole production-tier driver)
                     (baileys today; slack/telegram later,
                      picked from the registry, same prompt)
                                    │                  │
                    ┌───────────────┘                  └───────────────┐
                    ▼                                                  ▼
          Baileys QR pairing                            Meta 4-value credential
          CHANNEL_DRIVER=baileys                        collection (existing docs)
          (no Meta account needed)                       CHANNEL_DRIVER=meta
                    │                                                  │
                    ▼                                                  ▼
          doctor (baileys-scoped)                        doctor (meta-scoped) +
          → next-steps banner                             run-full-setup.js (Flows)
          → "message your own number"                     → next-steps banner
                    │
                    │  (org decides to go live)
                    ▼
              rumi graduate --to=meta
          → validates target creds live
          → flips CHANNEL_DRIVER=meta
          → re-registers Flows
          → retires CHANNEL_STATE_DIR/baileys
          → prints Meta-console manual steps
                    │
                    ▼
              Production flow
```

## 1. Channel driver abstraction — an N-channel registry, not a meta/sandbox binary

Meta and Baileys are just the first two of many drivers to come — Slack, Telegram, Signal, and others, the
same way Hermes bridges 20+ platforms behind one gateway. So this is a **registry of named drivers**. Tier
("sandbox" vs "production") is not a per-driver tag someone has to remember to set correctly — it's a
**default-sandbox rule with an explicit production allowlist**: every driver is sandbox-tier unless it's on
that allowlist, and for v1 the allowlist has exactly one entry (`meta`), because Meta's WhatsApp Cloud API
is the one channel that requires a formal Business App + app-review process — the actual thing that makes a
channel "production-grade" here. Adding Slack/Telegram later needs zero tier bookkeeping; they're sandbox by
just not being on the list.

Modeled on the existing, proven pattern in `bot/shared/services/queue/index.js` (`QUEUE_DRIVER` selecting
`sqs` vs `bullmq`, identical method surface, unknown-value warn-and-fallback) — that file's *shape* (one
selector, identical surface per implementation) is exactly right; its *content* (a hardcoded two-way
if/else) is what needs generalizing into a registry so a third, fourth, fifth driver is a pure addition,
never a rewrite.

- **New module `bot/shared/services/messaging/`**:
  - `channel-registry.js` — a plain map, `DRIVERS = { meta: './meta-channel.service', baileys:
    './baileys-channel.service' }` for v1, with future entries (`slack`, `telegram`, ...) added as new keys
    only; plus the one-line allowlist, `PRODUCTION_TIER_DRIVERS = ['meta']`, that the setup wizard/docs read
    to decide what counts as "real deployment" — never consulted by runtime message-handling code, which
    only ever cares about the driver name, not its tier.
  - `index.js` — reads `CHANNEL_DRIVER` (default `baileys`), looks it up in `channel-registry.js`, requires
    that module; unknown value warns and falls back to `baileys` (same warn-and-fallback UX as
    `QUEUE_DRIVER`, just registry-driven instead of if/else-driven).
  - `meta-channel.service.js` — the current Graph-API code, lifted mechanically out of
    `bot/shared/services/whatsapp.service.js` (same ~40 static methods, same `GRAPH_API_BASE`/
    `WHATSAPP_TOKEN`/`PHONE_NUMBER_ID` env reads).
  - `baileys-channel.service.js` — new Baileys-backed implementation of the same method names. Named for
    the actual driver, not "sandbox" — a future Telegram driver is just as much a sandbox-tier option and
    shouldn't have to share a name that implies it's the only one.
  - `channel-capabilities.js` — per-driver flags (`supportsFlows`, `supportsTemplates`,
    `supportsInteractiveButtons`, `supportsInteractiveList`, `supportsCarousel`, `templateRenderMode` — see
    Templates below) — the seam every future driver plugs into without touching a single call site or the
    registry's dispatch logic.
- `bot/shared/services/whatsapp.service.js` becomes a **thin compatibility facade**
  (`module.exports = require('./messaging')`), so the existing ~40+ call sites across handlers/routes/
  workers need **zero changes**. Blast radius is contained entirely to the new `messaging/` directory —
  run the `cross-agent-safety` checklist against it regardless, since it's still a shared-service change.

**Local per-driver state — one root env var, not one-off vars per driver.** Baileys needs to persist auth
state locally (its QR-pairing session), and any future driver may need its own local state too (a Telegram
bot-token file, a Slack app-token cache, etc.). Rather than a differently-named env var + top-level folder
per driver — that scales badly, cluttering `.env` and the repo root with one folder per driver added — v1
introduces a **single generic root**:
```
CHANNEL_STATE_DIR=.channel-state   # local session/auth state root — one var, ever
```
Each driver keeps its state in its own subfolder, namespaced automatically by driver name:
`.channel-state/baileys/`, and later `.channel-state/telegram/`, etc. — the driver never needs its own env
var, it just reads `path.join(CHANNEL_STATE_DIR, <its own registry key>)`. One `.gitignore` entry
(`.channel-state/`) covers every driver forever, current and future.

### Templates: a channel-agnostic content registry, not a Meta-only feature

Porting `sendTemplate` to Baileys isn't really porting Meta's template *system*, because that system's
approval workflow and 24-hour-window rule are artifacts of Meta's Business Platform policy layer, which
Baileys is never subject to at all (Baileys automates an ordinary chat session with no such restriction).
What's genuinely portable is the *content* — header/body/footer/buttons and their variables — which today
only exists as Meta template registrations (`bot/scripts/templates/create-menu-carousel.js`,
`upload-menu-videos-v3.js`, etc.), with no channel-independent representation.

v1 design: extract template content into a new `bot/shared/services/messaging/templates/` registry (one
definition per template — id, header/body/footer text with `{{variables}}`, optional buttons/list items),
fully channel-independent. Each driver renders it its own way, selected by `channel-capabilities.js`'s new
`templateRenderMode` flag:
- **`meta`** → `templateRenderMode: 'native-template'`: maps the registry id to the Meta-approved template
  name and sends via the existing Graph template payload (approval/registration stays an external,
  operational step — unchanged from today).
- **`baileys`** → `templateRenderMode: 'native-template'` too, since Baileys is still the WhatsApp wire
  protocol: interpolate the variables directly into a normal formatted WhatsApp message (text + native
  buttons/list where supported) and send immediately — no approval step, no window restriction, because
  neither applies outside Meta's Business Platform.
- **Future non-WhatsApp drivers** (Slack, Telegram, ...) → `templateRenderMode: 'slash-command'`: the same
  registry entry is exposed as that platform's native command primitive (a Slack `/command`, a Telegram bot
  command) instead of being forced into a "template message" shape that doesn't fit those platforms.
  WhatsApp-family channels keep the template format; other platforms project the same content through their
  own native command UX.

Net effect: `sendTemplate(templateId, params, to)` is one call in `messaging/index.js` regardless of driver,
and adding a new channel later means writing one renderer function against the same registry — no changes
to the registry itself or to any call site.

**Method-by-method fit for the rest (confirmed against the actual file, not assumed):**
- Trivially portable 1:1 across every channel: `sendMessage`, `sendReaction`, presence/typing, media
  send/download, document/audio/image/video/sticker sends.
- Flow-dependent (`sendFlow`): **the codebase already has the exact fallback convention needed** — verified
  live: `text-message.handler.js:1212` (`if (!SETTINGS_FLOW_ID) { ...text fallback... }`),
  `homework-trigger.js:14` ("the flow is offered iff HOMEWORK_FLOW_ID..."), and similar guards for
  `STATUS_FLOW_ID`, `STUDENT_VIDEOS_FLOW_ID`. **v1 strategy: never set any `*_FLOW_ID` when
  `CHANNEL_DRIVER=baileys`, and the existing unset-ID fallback paths take over automatically** — no new
  fallback logic needs to be built; `baileys-channel.service.js`'s `sendFlow` only needs a defensive
  log-and-no-op for anything that slips through. A future non-WhatsApp driver would instead route Flow
  content through the same `slash-command`/native-form mechanism as templates. (Note: the
  `sendStyleListFallback`/`sendFeatureMenuListFallback` methods found in `whatsapp.service.js:1419/1681` are
  a *different*, adjacent mechanism — runtime failure fallback for the carousel template, not a
  config-presence fallback — good to know but not the mechanism `baileys` relies on.)

**Inbound side is the hidden half of this abstraction** — `WhatsAppService` only covers *outbound* sends.
Inbound parsing (`bot/whatsapp-bot.js`'s ~1700-line `app.post('/webhook')`) is baked around Meta's wire
format (`entry[0].changes[0].value.messages`, `hub.mode` verification, `nfm_reply`). Baileys has no HTTP
webhook — it's a persistent socket (`makeWASocket`) emitting `messages.upsert`; a future Slack/Telegram
driver would have yet another shape (Events API, long-polling). v1 needs:
- `messaging/inbound/meta-webhook.adapter.js` — the extracted Express parsing (moved, not rewritten).
- `messaging/inbound/baileys-socket.adapter.js` — new Baileys `messages.upsert` listener.
- Both normalize into one internal shape (`{ from, type, text, mediaId, buttonReplyId }`) before handing off
  to the existing dispatch logic — the same normalized shape any future driver's adapter must produce,
  which is what keeps the registry genuinely N-channel-shaped instead of assuming everything looks like a
  webhook. **This is a bounded extraction**, not a rewrite of the 1700-line handler — just enough surgery to
  give both drivers a parallel entry path into the same dispatch code.

## 2. Sandbox flow (Baileys is v1's only sandbox driver; sandbox itself isn't Baileys-specific)

New script `bot/scripts/setup/baileys-pair.js`: starts a minimal `makeWASocket()` client, prints a terminal
QR (via `qrcode-terminal`, a Baileys peer dependency — no system package needed), waits for the user to
scan it from their own WhatsApp app (Linked Devices), persists auth state to
`CHANNEL_STATE_DIR/baileys/` (see §1), exits 0 on success.

Proposed env vars, matching `.env.template`'s existing comment conventions:
```
CHANNEL_DRIVER=baileys        # meta | baileys | (future: slack, telegram, ...) — default baileys
CHANNEL_STATE_DIR=.channel-state  # shared root for every driver's local state — see §1
```
No `WHATSAPP_TOKEN`/`PHONE_NUMBER_ID`/`WABA_ID`/`WEBHOOK_VERIFY_TOKEN` required for `baileys` — §6 makes
these conditional on `CHANNEL_DRIVER=meta`. The whole `CHANNEL_STATE_DIR` tree must be gitignored; it grants
live account access, same sensitivity class as a token.

## 3. Production flow (Meta)

Reuses the existing Meta setup steps in [`SETUP.md`](../../SETUP.md) / [`whatsapp.md`](whatsapp.md) as-is —
no reinvention. What's genuinely new: an explicit `CHANNEL_DRIVER=meta` line (today Meta is implicit/only
option) and `doctor` gating its live Graph-API probe on that value. The wizard's production branch collects
the same 4 values SETUP.md already documents, then hands off unchanged to `run-full-setup.js` for
Flow/template registration and the existing Railway deploy docs.

## 4. Graduation path — `rumi graduate`

Because users are keyed by `phone_number`, not WABA/channel, conversation history, registration, and
coaching sessions already carry over — no data migration needed by design. The one real caveat to surface
in the tool's output: the sandbox number is the operator's own personal WhatsApp number, while the
production Meta number is normally *different* — existing sandbox testers must be told to message the new
number; there's no server-side redirect possible.

`rumi graduate [--to=meta]` (a subcommand of the `rumi` CLI, see §5 — implemented in
`bot/scripts/setup/graduate.js`) — the target is a `--to=<driver>` argument, looked up in the same
`channel-registry.js` from §1, not hardcoded to Meta, defaulting to `meta` since it's the only
`PRODUCTION_TIER_DRIVERS` entry that exists in v1 (so plain `rumi graduate` with no flag is the common
case). A future `--to=slack` follows the identical shape once a Slack driver is ever promoted to that
allowlist. Steps, doing what's actually automatable and clearly flagging what isn't:
1. Refuse to run if `CHANNEL_DRIVER` already equals the target (idempotency guard).
2. Prompt for / confirm the target driver's required vars (reusing the same collection code path as the
   wizard's per-driver branch from §5 — no duplicate prompt logic).
3. **Live-validate** them with the target driver's own probe (for `meta`, the real Graph API call
   `doctor.js` already does) before touching any config — fail loud, change nothing, if the credentials
   don't work.
4. Flip `CHANNEL_DRIVER=<target>` in `.env` (in place, preserving every other line — treat `.env` as
   append/patch, never regenerate).
5. Invoke the existing `run-full-setup.js` to register Flows/templates now that the target channel supports
   them (Meta-specific step today; a future driver would define its own equivalent).
6. Rename `CHANNEL_STATE_DIR/<outgoing-driver>/` → `CHANNEL_STATE_DIR/<outgoing-driver>.retired/` (don't
   delete outright — recoverable if something's wrong) and log that it's no longer read. Because every
   driver's state lives under the one shared root (§1), this step is the same one line of code regardless
   of which driver is being retired.
7. Print a **manual checklist** for what genuinely cannot be automated from inside the repo: for a `meta`
   target, creating/verifying the Meta Business App, Meta's app-review process, and pointing the Meta
   webhook at the deployed URL in the Meta developer console.

## 5. Two-layer CLI: `install.sh` + `rumi <command>`

The same two-layer split Hermes uses (`setup-hermes.sh` → `hermes <cmd>`), adapted for a cloned/forked repo
rather than a globally-curl-installed package. Layer 1 is mechanical and asks nothing about your accounts;
layer 2 asks everything and touches no dependencies. Keeping them apart is what makes each independently
re-runnable.

**Layer 1 — `install.sh`** (`./install.sh`, once): Node ≥20 / npm / git check, `npm install` at the root and
in `bot/`, `.env` created from the template only if absent, `npm link` so a bare `rumi` works (falling back
to a printed `node bin/rumi.js` when npm lacks permission), then it offers to run `rumi setup` immediately —
which is the whole point of the split being invisible to a first-time user.

**Layer 2 — `rumi <command>`** (`bin/rumi.js` → `bot/scripts/setup/`): `setup`, `status`, `doctor`, `pair`,
`graduate`.

### What the wizard is actually optimising for

The audience is someone at a school or an NGO who was told "you can run this yourself" — not a contributor
to this repo. Four principles follow, and between them they account for most of the code:

1. **Nothing is asked by its variable name.** The question is "where does Rumi keep its memory", not
   `SUPABASE_URL`. Env keys are how `.env` stores an answer, not vocabulary a user should have to learn.
   Enforced by a test that asserts the channel question and the Meta prompts never mention their env vars.
2. **Every value is checked while the person who typed it is still there.** Each step runs the *same*
   `doctor.js` probe the diagnostic uses, so "configured" and "working" cannot drift apart. A key that is
   merely present tells you nothing; its failure surfaces hours later inside a feature with no indication
   which of eight values was wrong.
3. **Progress is saved per step, not at the end.** Ctrl+C is a legitimate way to leave — the browser tab for
   the next credential is usually the reason. Quitting must never cost work already done.
4. **Anything already working is not asked about again.** Re-running on a configured deployment takes
   seconds, changes nothing, and leaves `.env` byte-identical. `--reconfigure` opts back into being asked.

### Field-shape validation: the real cost centre

`validators.js` exists because the expensive setup failures are not typos, they are *pasting the wrong
thing* — a value that is perfectly well-formed for what it actually is, so no presence check objects and the
error arrives far from its cause. The ones caught, each with the specific correction rather than "invalid":

| Mistake | Why nothing else catches it |
|---|---|
| Supabase **anon** key instead of **service_role** | Both are JWTs starting `eyJ`, on the same page, indistinguishable by eye. The anon key cannot see past RLS, so the bot starts cleanly and behaves as if the database were empty. Decoding the token's `role` claim settles it. |
| A phone **number** in `PHONE_NUMBER_ID` | Meta wants their internal 15–17 digit id; Graph answers "Object with ID does not exist", naming neither the field nor the mistake. |
| Another vendor's `sk-…` in `OPENROUTER_API_KEY` | Every AI provider issues one and they look alike in a terminal. The validator names which vendor's key it recognised. |
| The Supabase dashboard URL instead of the API URL | Both are URLs containing "supabase". |
| Upstash's `https://` endpoint as `REDIS_URL` | Their console shows both; only one is the TCP address. |

Validators may also *clean* input (strip a trailing slash, wrap a bare `host:port`) rather than asking
someone to paste tidily.

### The five steps

1. **Database.** URL + service key (masked), live probe, then the schema. Rumi's tables are created inline
   via the existing `bootstrap-db.js`. The unavoidable manual detour is named rather than glossed over:
   Supabase exposes no API for arbitrary SQL, so the `exec_sql` helper the schema is applied through has to
   be pasted in once. `db-setup.js` distinguishes the three states a project can be in — already set up /
   helper missing / ready for the schema — because "no tables yet" and "no way to create them" look
   identical from outside and need opposite instructions. When the helper is missing the wizard prints the
   helper SQL (function + GRANT + NOTIFY) and links straight to *that project's* SQL editor, derived from
   the API URL. It polls until PostgREST can see the helper, applies the schema statement-by-statement, and
   refuses to continue if `users` is still missing.
2. **AI.** OpenRouter key (masked), then the probe that checks the balance as well as the key. A valid key
   with no credit is treated as a question ("carry on and add credit later?"), not a rejection — re-asking
   for a key that is perfectly fine would be nonsense.
3. **Redis.** Offers to start a container locally when a Docker daemon is reachable (reusing the container
   from a previous run rather than dying on "name already in use"), otherwise takes any address — managed,
   self-hosted, or local. Live `PING` either way.
4. **Optional abilities.** Described by what a teacher would notice, not by vendor product name, and
   defaulting to *skip*: Rumi works without all of them, and the fastest route to a working bot is not
   collecting five more keys. A multi-key extra (Azure needs a key and a region) is only stored when every
   key is given — half of it configured is a feature that reports itself available and then fails.
5. **WhatsApp.** The plain-language channel question, then either QR pairing inline (with the caveats stated
   *before* the code appears: it is a linked device on a personal account, it can read your chats, use a
   spare number if that matters) or Meta's four values with their on-page names and a live Graph check.

Closing screen: a readiness table naming services by what they do, which optional abilities are on, which key
would switch each remaining one on, the one command that starts Rumi, and what to send it first.

### `rumi status` versus `rumi doctor`

Doctor answers *is each service reachable* — a checklist for when something is broken. Status answers the two
questions someone actually has after setup and that no credentials checklist contains: **is Rumi running**
(read from the connection module's own instance lock, rather than a second pid file that could disagree with
it) and **which WhatsApp account is it answering as** (read from the stored session, so it answers even when
Rumi is down). Both render from the same `runDoctor()` result, so they cannot disagree about facts.

### Terminal presentation

`ui.js` and `prompt.js` hold everything visual and everything input, so all five commands look like one
product. Two rules there are load-bearing rather than cosmetic: colour switches itself off when stdout is not
a TTY (so piped logs and Jest's captured console stay plain), and widths are computed from *printed* width —
escape codes free, emoji two cells — because a box sized by string length goes ragged the moment a line
contains either. Secrets are read in raw mode and echoed as dots: a terminal history full of service-role
keys is a real leak, and the person setting Rumi up for the first time is the least likely to notice it
happened. Ctrl+C restores the terminal (raw mode off, cursor back) before every command's own goodbye.

**Relationship to `.claude/skills/setup/SKILL.md`**: the skill now points at these commands for every
mechanical step and keeps only the agent-specific value — deciding which path the user is on, explaining
*why* when someone stalls, and the production steps the wizard deliberately does not cover (hosting, the Meta
webhook, Flow registration, the background worker). This closes the gap that motivated the work — a
non-agent user previously got a strictly worse, manual-only experience — without maintaining two step
sequences that drift apart.

## 6. Feature-gating changes (must preserve the presence-based, no-tier-system philosophy)

`bot/shared/config/feature-availability.js`'s `REQUIRED_VARS` is currently a flat array of 8, 4 of which are
the WhatsApp/Meta vars, with no channel concept at all. Change, preserving the file's own stated philosophy
("no tier system and no master enable flag"):

- Split `REQUIRED_VARS` into an always-required core (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OPENROUTER_API_KEY`, `REDIS_URL`) plus a `CHANNEL_REQUIRED_VARS` map, keyed by driver name from the same
  `channel-registry.js` in §1:
  `{ meta: [WHATSAPP_TOKEN, PHONE_NUMBER_ID, WEBHOOK_VERIFY_TOKEN, WABA_ID], baileys: [] }` — selected by
  `CHANNEL_DRIVER`, structurally identical to how `QUEUE_DRIVER` is already sanctioned in `bot/CLAUDE.md`,
  just a second selector, not a new gating mechanism. **This map is the extensibility point**: adding Slack
  later is `slack: [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET]` — one line, no restructuring of this file or of
  `doctor.js`'s logic.
- **Backward-compat inference is required, not optional**: existing deployments never set
  `CHANNEL_DRIVER`. If unset and the 4 Meta vars are already present → infer `meta`; if unset and absent →
  default `baileys`. Without this, upgrading the platform would silently reclassify live Meta deployments
  as sandbox-tier and break them.
- `doctor.js`: skip the Meta Graph probe cleanly (`status: 'skip'`, not a failure) when
  `CHANNEL_DRIVER` is any non-`meta` driver; add a `baileys`-specific offline probe (does
  `CHANNEL_STATE_DIR/baileys/` contain a valid session?) — driver-specific probes are looked up the same
  way `CHANNEL_REQUIRED_VARS` is, so a future driver adds its own probe function rather than an `if/else`
  branch in `doctor.js` itself.
- `.env.template`: add a "Channel selection" block near the top (`CHANNEL_DRIVER`, `CHANNEL_STATE_DIR`), and
  annotate the existing WhatsApp block "Required only if `CHANNEL_DRIVER=meta`."

## 8. WhatsApp Flows, degraded to a conversation

The original plan (§1) said Flow-dependent features would simply be *unavailable* on sandbox: never set a
`*_FLOW_ID`, let the existing unset-ID guards take over, and have `sendFlow()` log a no-op. Running the
sandbox proved that wrong in the most basic way — **a feature that is unavailable but pretends otherwise
looks broken, not unconfigured**:

- `/reading test` did `if (flowSent) {...} else { throw new Error('Failed to send WhatsApp Flow') }`, and
  the catch answered *"Sorry, something went wrong starting the reading test."*
- `/settings` answered *"Settings are not available yet."*
- `/video`'s picker was gated behind `STUDENT_VIDEOS_FLOW_ID`, so the entire imported content library was
  unreachable — the ID can only exist once a Meta Flow has been published.
- Class setup answered *"class setup is not available right now"*, which in turn made `/quiz` impossible,
  because a quiz needs a class to send to.

That is most of the product, on the tier whose whole purpose is *"check the thing works before committing
to Meta's app review"*.

### The seam: an endpoint is not a Flow

The key observation is that a Meta Flow is only a **renderer**. Every data-exchange Flow in
`bot/shared/routes/*-endpoint.js` already holds all of the behaviour behind one uniform shape:

```
INIT                        -> { screen, data: { <rows>, ...values } }
data_exchange(screen, data) -> { screen, data: { <rows>, ... } } | { data: { error: { message } } }
```

The DB queries, the validation, the actual video send, the preference write — all of it lives in those
functions. So the sandbox does not need a second implementation of each feature; it needs a **second
renderer**. That is `messaging/endpoint-text-flow.js`: it asks one question per screen field, resolves the
reply by number *or* name, accumulates `screenData` exactly as a Flow client would, and calls the very same
endpoint functions. A bug fixed in an endpoint is fixed for both channels, and a new Flow degrades to text
by declaring a config rather than by writing code.

Mapping a Flow definition to a config:

| Flow concept | Config field |
|---|---|
| screen | `stage.screen` (the value passed to `data_exchange`) |
| a form field | one entry in `stage.fields[]` — one chat question each |
| dropdown data-source key | `field.optionsKey` (e.g. `grades`, `languages`) |
| field name in `screenData` | `field.id` (e.g. `grade`, `language`) |

### Navigate-style Flows: synthesise the webhook instead

Two Flows have no endpoint — their submission arrives as a single `nfm_reply` webhook. For those
(`reading-assessment`, `class-setup`) the text flow collects the same fields and then **synthesises that
exact webhook shape**, so `whatsapp-bot.js`'s `nfm_reply` dispatch and `flow-response.handler.js` run
completely unmodified. The field *names* are therefore a contract with `flow-response.handler.js` and
`utils/flow-type-detector.js`, and `tests/messaging/text-flow-definitions.test.js` pins them against those
real consumers so a rename fails in CI rather than on a live deployment.

Class setup is worth a note: its Meta Flow is an endpoint-driven **loop** (one screen per student, "Add &
Continue" repeatedly), which suits a form but not a conversation. Attendance also accepts a navigate-format
submission (`class_name` + `student_list`, parsed one-student-per-line), and in chat that is strictly
better — the teacher pastes the whole roster once. So the text flow targets that shape instead of
replicating the loop.

### Rules the engine follows, each learned from a live failure

- **Answer by number OR name.** Demanding a number is unrealistic; people type "Urdu", or the half of a
  `"Chapter · Title"` label that actually names the video. Ambiguity resolves to *nothing* rather than a
  guess (`pending-options.js#resolveSelection`).
- **A digits-only reply that is out of range falls back to an exact name match** — a teacher's classes are
  literally named `4 - B` and `5`, so replying `5` to a two-item list means the class, not item five.
- **A command always wins over a pending question.** Not every command starts with `/` — `add class`,
  `attendance` and `register` are plain phrases, and a free-text step accepts *any* text. Without this,
  typing "add class" while a roster question was open created a class whose only student was named
  "add class".
- **Two strikes and the flow lets go.** One unmatched reply re-asks; a second abandons the flow so the
  message reaches normal handling. This self-heals without the adapter needing to know every command.
- **A flow never dead-ends.** A step with no options (an endpoint error, an empty library) ends the flow
  and shows the endpoint's own explanation, instead of parking the user on an unanswerable question.
- **The endpoint response is carried in flow state, not recomputed.** Replaying earlier `data_exchange`
  calls to render a later step would re-fire real side effects — student-videos' final screen *sends a
  video*.

On Meta none of this is reached: the native Flow is better UX and is what production users get.
`sendFlow()` prefers the real Flow whenever a `*_FLOW_ID` exists, and callers now branch on its return
value rather than on the presence of an env var.

## 7. Out of scope for v1

- Actually shipping any driver beyond `meta` and `baileys` — Slack/Telegram/etc. get a registry entry, a
  `channel-capabilities.js` entry, and a `templateRenderMode: 'slash-command'` path documented and ready to
  implement against, but no working driver code in v1. The point of §1's design is that adding one later is
  a pure addition (new registry key + new service file + new capability entry), never a restructuring of
  `messaging/index.js`, `channel-registry.js`, `feature-availability.js`, or any call site.
- The `'slash-command'` template-render mode itself isn't implemented (there's no Slack/Telegram driver to
  render into) — only the `'native-template'` mode (meta + baileys) ships in v1.
- Meta-template-specific methods with no Baileys equivalent (`sendTemplate`, `sendFlow`, both carousel
  methods and their payload builders) — these need the channel-agnostic template registry from §1, still not
  built, and log "not supported on this channel" rather than being implemented. Everything else (sends,
  reactions, typing indicators, stickers, interactive buttons/lists as numbered text) is implemented.
- Headless/hosted sandbox with reconnect-storm handling — v1 sandbox targets local/dev quick-start, not
  production-hosting Baileys at scale.
- Full rewrite of the 1700-line webhook handler — only the bounded inbound-adapter extraction from §1.
- Pairing-code / deny-by-default first-contact security model (a genuinely good Hermes-inspired idea, but a
  separate feature from channel onboarding).
- Multi-tenant / multi-org-per-deployment channel routing — this design is single-channel-per-deployment,
  same as today.
- `rumi status` as a distinct command — v1 gives `rumi doctor` the CLI-under-one-name treatment; a separate
  lighter-weight `status` view is a nice-to-have if the two ever need to diverge, not built now.
- Global/system-wide `rumi` installation (a curl one-liner like Hermes's) — v1's `rumi` is repo-local
  (`bin/rumi.js`, optionally `npm link`ed); a project is cloned/forked per deployment, not installed once
  globally, so there's no cross-repo CLI to distribute yet.

## Implementation status

Build order, and what's actually landed against it (branch `feat/channel-driver-onboarding`, uncommitted):

1. **✅ Done** — §1's `messaging/` module: `channel-registry.js` (the driver map + production-tier
   allowlist), `meta-channel.service.js` (the mechanical lift of the old `whatsapp.service.js`, byte-for-byte
   except the relative-path adjustments the new directory depth requires), `index.js` (the selector), and
   `whatsapp.service.js` reduced to a one-line facade over it. Went through the `cross-agent-safety` checklist
   given it's the highest-blast-radius file this design touches.
2. **✅ Done** — §6's `feature-availability.js` / `doctor.js` changes: `REQUIRED_VARS` is now core-only (4
   vars), `CHANNEL_REQUIRED_VARS` + `resolveChannelDriver` + `requiredVarsFor` added, `doctor.js` reports the
   resolved channel and warns on both an unrecognized `CHANNEL_DRIVER` value and the Baileys caveat below.
3. **✅ Done, live-verified** — §2's real Baileys driver:
   - `baileys-connection.js` — the persistent-socket manager (`makeWASocket`/`useMultiFileAuthState`/
     `fetchLatestBaileysVersion`, all lazily required so nothing touches the real `baileys` package until a
     connection is actually opened), with a minimal (non-storm-hardened, by design — see §7) auto-reconnect.
   - `baileys-channel.service.js` — real sends for text, reactions, typing indicators (presence updates),
     images/documents/audio/video/stickers, and the URL-based senders (download from R2 first). An inbound
     media bridge (`_cacheIncomingMedia`) works around Baileys having no "fetch media by id later" API the
     way Meta does. Interactive buttons/lists/language-selection/style-menus render as numbered plain text
     (Baileys' native button/list messages are unreliable across current WhatsApp clients). `sendTemplate`,
     `sendFlow`, and the carousel methods stay honest stubs — no Baileys equivalent exists without the
     channel-agnostic template registry mentioned in §1, which is still not built (see §7).
   - `bot/scripts/setup/baileys-pair.js` — the QR pairing script.
   - `messaging/inbound/baileys-socket.adapter.js` — translates a Baileys `messages.upsert` event into the
     same shape `validators.js#validateWebhookMessage` produces from a real Meta webhook, then calls
     `whatsapp-bot.js`'s `handleWebhookPost` directly with a synthetic `{req, res}` pair. Covers text, image,
     audio/voice, and document messages — Meta-only interaction types (Flow submissions, interactive
     buttons/lists) have no Baileys equivalent and simply never trigger under this driver.
   - `whatsapp-bot.js` itself only changed by a verified-zero-diff mechanical extraction (the inline
     `app.post('/webhook', ...)` handler became the named `handleWebhookPost` function so the adapter above
     could call it) plus a new `wireBaileysInboundIfSelected()` — the ~1000 lines of existing Meta dispatch
     logic were never touched.
   - **Live-verified**: real QR pairing, all 11 non-stub outbound methods, and a full inbound round trip
     (text in → dispatch → AI reply → delivered) against two real WhatsApp accounts. Inbound image receipt
     verified structurally (download → cache → dispatch into the real handler); voice/document dispatch is
     unit-verified and code-reviewed but a *complete* reply for them needs `SONIOX_API_KEY` (voice
     transcription) or R2 credentials, neither configured in this environment.
4. **✅ Done, live-verified** — §5's CLI: `install.sh` (tool check, dependency install, idempotent `.env`,
   `npm link`, then offers to run the wizard), `bin/rumi.js` (`setup` / `status` / `doctor` / `pair` /
   `graduate`, with a help screen built from the command table), and in `bot/scripts/setup/`: `ui.js` (the
   presentation layer), `prompt.js` (masked secrets, arrow-key menus, validated re-asking),
   `validators.js` (the field-shape checks above), `db-setup.js` (the three database states + the SQL-editor
   link), `fields.js` (the human copy for Meta's credentials and the optional abilities, shared with
   `graduate`), `link-whatsapp.js` (pairing, shared between `rumi setup` and `rumi pair`), `summary.js` (the
   readiness view, shared with `rumi status`), `status.js`, and `interactive-setup.js` (the five steps).
   **Live-verified** in a real terminal: arrow-key selection and masked entry through a pty; a fresh-`.env`
   run showing the anon-key and dashboard-URL rejections with their corrections, a failed live probe
   re-asking with the previous value offered back, and Ctrl+C leaving a saved partial `.env`; and a re-run on
   a fully configured deployment finishing in two keypresses with `.env` byte-identical (verified by
   checksum).
5. **✅ Done** — §4's `rumi graduate --to=meta`: collects the target driver's vars (prefilling from any
   existing non-placeholder `.env` value), live-validates them via `doctor.js`'s own probe *before* touching
   `.env`, patches `CHANNEL_DRIVER` in place, retires the outgoing driver's local session
   (`CHANNEL_STATE_DIR/<driver>` → `<driver>.retired`), and prints the manual checklist for what can't be
   automated (Meta Business App creation/review, webhook config, Flow/template registration).

6. **✅ Done** — §8's text-flow degradation: `messaging/text-flow.js` (the engine),
   `endpoint-text-flow.js` (the builder that drives a real Flow endpoint over chat) and
   `text-flow-definitions.js` (`student-videos`, `settings`, `reading-assessment`, `class-setup`). Callers
   in `text-message.handler.js` and `quiz-intent-router.service.js` now branch on `sendFlow()`'s return
   value instead of on the presence of a `*_FLOW_ID`.

### What a watched fresh-clone run found

One person, one fresh clone (`.env` deleted, WhatsApp session retired, bot stopped), `./install.sh` →
`rumi setup`, recorded end to end. **6 minutes 13 seconds**, including dependency install and a real QR
pairing — against a 30-minute target. Seven problems, all fixed and pinned by tests:

| What the user saw | Cause | Fix |
|---|---|---|
| `✔ Linked`, then three lines later `WhatsApp — not linked yet, run rumi pair` | Pairing succeeded but the *number* was unknown, and the readiness line keyed off the number rather than the link. The number was unreadable because `events.emit('open')` fires synchronously just before `getSocket()` resolves, so the `.then()` capturing the socket had not run — and Baileys then replaces that socket anyway during its post-pairing "restart required". | Read the number from the stored session (`creds.json`), falling back from the socket. Render from the *link* state, never from the presence of a number. |
| ~15 lines of raw Baileys JSON immediately above and below the QR code, including the pairing handshake | `makeWASocket` was given no `logger`, so Baileys used its own at info level | Pass a silent logger when `RUMI_CLI=1`; the server keeps its diagnostics |
| `⚠️ Logging DISABLED - dataset=MISSING` on a screen where nobody asked about observability | Axiom's startup notice, unconditional | Suppressed under `RUMI_CLI` |
| "Picking up from last time — 2 of 3 core services are already configured" **on a clone that had configured nothing** | `.env` is copied from `.env.template`, which ships working-looking values (`redis://localhost:6379`, `https://your-project.supabase.co`). Anything non-`CHANGEME` counted as an answer. | `isProvided()` — a value equal to the template's own is a suggestion, not configuration |
| `› Project URL [https://your-project.supabase.co]:` — pressing Enter would have accepted a placeholder | same | Prefills come from `isProvided()` |
| `Checking the Redis you already have… ✘ Connection is closed.` about a Redis the user had never mentioned | same, plus ioredis's error naming neither the address nor the reason | A template suggestion is probed *silently* and falls through to the prompt; the probe now reports `nothing answered at redis://…` |
| The Redis step asked for an address and explained the format, but never said how someone with **no** Redis and **no** Docker was supposed to get one — and Redis is required, so that is a blocked setup | The where-to-get-one guidance only existed as the Docker menu option | When Docker is absent, print the Upstash / Docker / existing-server routes |

Two things the run confirmed rather than contradicted: the masked secret entry and arrow-key menus behave
correctly under a real TTY, and the closing screen's "message +<number> and try /menu" is the right shape —
it just needed the number to actually be there.

Still not asked about by the wizard: `DEFAULT_REGION`. A fresh `.env` takes the template's `default`, which is
fail-open and works, but a deployment that had set a region silently loses it on a from-scratch re-setup.
Flagged rather than fixed — adding a sixth question for a value most deployments never change is the wrong
trade, but it belongs in the manual checklist.

### The launch-directory bug class, found by using it

The watched run ended with the user doing the obvious next thing — `cd bot && npm start`, exactly as the
closing screen told them to. That one instruction exposed a family of bugs that had been latent since before
this work: **paths resolved against `process.cwd()` rather than against the repo.**

| Resolved against cwd | What it did from `bot/` |
|---|---|
| `require('dotenv').config()` in `whatsapp-bot.js` | looked for `bot/.env`, loaded nothing, and the bot aborted with "Missing REQUIRED env var(s): SUPABASE_URL, …" on a fully configured deployment |
| the same in `bin/rumi.js` and `doctor.js` | `rumi doctor` reported **every** service as "not configured", with the missing-key hints for all of them |
| `authDir()` in `baileys-connection.js` | used `bot/.channel-state` — an *empty* folder — so Baileys registered a **second WhatsApp device** and re-synced from scratch, endlessly. Both devices were live on one account (`:13` at the repo root, `:14` under `bot/`), and WhatsApp then invalidated the first with a 401. |
| `statePath` in `doctor.js`, `retireOutgoingDriverState` in `graduate.js` | reported "no Flows registered" for a deployment that had them; would have retired the wrong folder and left the live session in place |

All four are now repo-anchored, with tests that pin the anchoring rather than the string. The last one is the
serious one: it is a data-loss bug in the only piece of state Rumi cannot regenerate, and it fires on the most
natural command a person could type.

`rumi start` was added in the same pass — partly because the user asked for it, and partly because it makes
the launch directory structurally irrelevant instead of merely documented. It also forwards SIGINT/SIGTERM to
the bot: without that, killing the launcher orphaned a bot still holding the session lock, and the next start
refused to attach while blaming a pid with no visible owner.

**Two bugs this pass introduced and caught by running the thing:**

- `logger: isCli ? quiet : undefined` on `makeWASocket`. Reads as a no-op for the server; is not. Baileys
  merges config over its defaults, so an explicit `undefined` *replaced* their default logger and the next
  `logger.child()` threw. The bot booted, reported every service healthy, and had no WhatsApp connection at
  all. Now set as a separate key, and asserted on the config actually passed rather than on the source text.
- A test that exercised `retireOutgoingDriverState` with the real `.channel-state`, and by working exactly as
  designed renamed the developer's live WhatsApp session. Now uses a test-only directory name: a test must not
  be able to do that even when it passes.

### Three UX changes from watching, not from reasoning

- **Each step clears the screen** and reprints a tick per completed step. Without it every prompt landed on
  the terminal's bottom line with its explanation scrolled above — the thing to read and the thing to type at
  opposite ends of the window.
- **The sandbox caveats now name what is Meta-only** (tap-through forms, approved templates, picture-menu
  carousels) and say to graduate for the full experience, rather than only warning about the account risk.
- **`cd bot && npm start` is gone from every screen and doc**, replaced by `rumi start`.

### Bugs the feature pass found — all pre-existing, most affecting Meta too

Running the sandbox as a user surfaced a set of failures that no unit test caught, because each one was
either wrapped in a try/catch that made it look transient, or was a missing method that only threw at
runtime. Listed because they are the substance of "make the sandbox usable", and because several of them
mean the feature was broken on **every** deployment, not just this one:

| Bug | Consequence before the fix |
|---|---|
| `redisService.setexWithCeiling` never existed, called from 10+ places across the quiz subsystem | No quiz could be delivered on any deployment, ever |
| `redisService.setNX` never existed — the idempotency claim at the top of every image analysis, un-caught | Every inbound image answered with the generic error |
| `quiz_class_*` list replies had no handler, though `continueWithClass()` is documented as "Called from whatsapp-bot.js list_reply handler" | `/quiz` dead-ended at the class picker |
| Five services built their own OpenAI client keyed on `OPENAI_API_KEY`, contradicting the documented single entry point | Quiz generation and the whole pic-to-LP pipeline failed on an OpenRouter deployment |
| `quiz_sessions` was missing six columns — present in the `CREATE TABLE`, absent from the column-reconcile block | Accepting a post-video quiz offer failed on any upgraded database |
| The reading assessment uploaded audio to R2 unconditionally, then downloaded it again in the queued analysis step | Recording a student read produced "🚨 CRITICAL: audio processing failed" wherever no bucket exists |
| Passage generation treated its R2 archival upload as required | A passage already rendered to disk was reported as "error generating the passage" |
| A TTS failure propagated out of the voice handler | A transcribed, answered voice note was replaced by "sorry, an error occurred" |
| `/quiz` told teachers to type "set up class" — a phrase no detector recognised | Following the bot's own instruction fell through to general AI chat |
| The pic-LP router pre-claimed the image idempotency key that its own batch coalescer then needed | No reply at all for any non-textbook image |
| Scheduling a quiz *report* threw when no queue was configured, after delivery had succeeded | Students received the quiz; the teacher was told it had failed |
| `.limit(1).single()` on six "find the newest, if any" lookups | A scary `Cannot coerce the result to a single JSON object` on the normal empty path, masking real errors |
| `doctor.js` probed only that the OpenRouter key authenticates | A valid-but-unfunded key reported `✅ … HTTP 200` and "all required services configured" while every substantial call returned 402 |
| Two processes could share one Baileys auth folder | WhatsApp invalidated the session itself (`Stream Errored (conflict)`), requiring a human to re-pair |
| A QR issued when credentials already existed was treated as a pairing opportunity | Endless QR reissue every ~20s — the mechanism behind this project's repeated "can't link new devices" rate limiting |
| The reading-assessment report PDF was uploaded to R2 unconditionally | A report that had already been rendered marked the assessment `failed` and the teacher got nothing |
| The failure message told the teacher "Our team has been notified" | False on a self-hosted deployment — nobody is notified, and it replaces an actionable instruction with a fiction |
| One reading failure produced three apologies (analysis service, reading branch, outer catch) plus a spoken one | The teacher is told about the same problem up to four times, the last in Urdu regardless of her language |
| Feature intro video URLs interpolated an unset `R2_PUBLIC_URL` into a relative path | The bot asked "Want to see how? 🎥" and could never deliver a video if she said yes |
| Nothing removed the locally-stored recording or report | Every assessment left an `.ogg` and a `.pdf` behind forever — a disk leak, and stale copies of a child's voice |

Four now carry conformance guards so they cannot silently return:
`tests/setup/no-undefined-redis-methods.test.js` (every `redisService.<method>()` resolves),
`tests/setup/llm-single-entry-point.test.js` (no service builds its own chat-completion client, with a
justified allow-list for the audio-only endpoints), plus unit coverage for the two new Redis methods and the
no-object-storage audio path.

The wizard also now sets `QUEUE_DRIVER=bullmq` for a sandbox: the template default is `sqs`, which needs an
AWS account, so a sandbox inherited a queue it could never use.

All 163 test suites / 1837 tests pass (`npm test`). Not done: everything already listed in §7's out-of-scope
list (Slack/Telegram drivers, the `'slash-command'` template mode, `rumi status`, global `rumi` install,
pairing-code security model, multi-tenant routing) — none of that changed. Also still open: the 12-hour quiz report has not been
observed (it is a timer), pronunciation scoring needs `AZURE_SPEECH_KEY`, and video *generation* needs
`KIE_API_KEY` — the pre-made library covers `/video` without it.
