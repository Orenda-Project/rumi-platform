# Run Rumi on your own messenger (Matrix)

Rumi can run on a chat server your school system owns: a [Matrix](https://matrix.org) homeserver. Teachers
use a Rumi-branded Android app or web app that looks and behaves like WhatsApp: they sign in with their phone
number, chat and call colleagues, and find Rumi already there as a contact. Every message, voice note and PDF
is end-to-end encrypted, and there is no per-message fee and no third-party app review.

It is the same Rumi. Matrix is a channel next to WhatsApp, Slack and Discord: a teacher's message goes through
the same pipeline, so lesson plans, coaching, reading assessments and the rest are the same code. Where
WhatsApp shows buttons and forms, Matrix shows a numbered menu ("reply 1, 2 or the option's name") and asks a
form's questions one message at a time.

**What you need**

| Piece | Where it comes from |
|---|---|
| A Matrix homeserver (Synapse) and the teacher apps | [rumi-messenger](https://github.com/Orenda-Project/rumi-messenger): a Docker or Railway deploy of Synapse, a branded Element Web, the Android app, calls and push. Its setup creates the `@rumi` account and writes the connection lines for you. |
| This repo, running the bot **and** the worker | [SETUP.md](../../SETUP.md), or [a laptop setup](../local-stack.md) with no Supabase account |
| **Node 22 or newer** | The same floor as the rest of Rumi; end-to-end encryption works on it (see [Encryption](#encryption)) |
| **Redis** (`REDIS_URL`) | Already required. On Matrix it also carries the worker's sends to the bot (see [The relay](#the-relay)) |
| Object storage (`R2_*`) | For coaching recordings, reading recordings and generated images, as on any non-Meta channel |

## See it running

Try our hosted Rumi Messenger at https://chat.hellorumi.ai: create an account, tap **Chat with Rumi**,
and say hi. To open your own deployment to the public, read [Running Rumi in public](../running-in-public.md) first.

## In programme terms

**Own the channel: run your teacher-support programme on a messenger your school system controls.**

In programmes that work, the delivery channel is infrastructure for a human support cycle. Coaches use tablets, and teachers get SMS tips on top of training [Jordan-Mitchell20; Piper-JEC18]. Most programmes rent that infrastructure from a commercial messaging platform. Its prices and rules can change, and every service message can carry a fee. This channel lets a school system run Rumi on a messenger it owns. The system hosts its own server. Teachers sign in to a branded app or web app with their phone number, and Rumi is already there as a contact. Everything teachers already use works the same way: lesson plans, coaching from a recording, reading checks, attendance and quizzes. Coaches still get their morning brief. Messages, voice notes and documents are end-to-end encrypted. In staff groups, Rumi stays quiet until someone addresses it. A deployment can run with no third-party messaging platform at all.

**Where it sits in a structured-pedagogy programme:** underneath the whole chain, as **delivery infrastructure** for guide, coaching, assessment and M&E messages alike.



### Honest limits

- **Who can reach Rumi.** Only accounts on the deployment's own homeserver, or on servers listed in `MATRIX_ALLOWED_SERVERS`, can reach Rumi; an identity always names one account on one server. A staff group never receives a teacher's private replies: only a confirmed one-to-one room counts as a teacher's chat.
- **Running cost.** No server or running cost was measured.
- **Accounts.** A teacher's existing account on another platform is not merged automatically.
- **Pre-existing bug.** The exam checker is broken on every channel. This bug predates the release.
- **Messages during a restart.** Messages sent while the bot restarts are answered exactly once. A send waiting on a down bot fails after about three minutes.
- **What it does not show.** Owning the channel does not by itself improve learning. The evidence is about the support delivered over it.

### Sources

- [Jordan-Mitchell20] Jordan, K., & Mitchell, J., 2020, *Messaging Apps, SMS and Social Media: A Rapid Evidence Review*, EdTech Hub. https://doi.org/10.5281/zenodo.4556938
- [Piper-JEC18] Piper, B., DeStefano, J., Kinyanjui, E. M., & Ong'ele, S., 2018, "Scaling up successfully: Lessons from Kenya's Tusome national literacy program", *Journal of Educational Change* 19(3):293–321. https://doi.org/10.1007/s10833-018-9325-4

## Turn it on

The guided way: `rumi setup` has a Matrix step after Slack and Discord. Point it at rumi-messenger's
`deploy/rumi-channel.env` (or paste the homeserver URL and token), and it checks the connection and
whether encryption can start.

By hand, in `.env`:

```bash
CHANNEL_DRIVER=none                                # no WhatsApp at all; or keep meta/baileys alongside
MATRIX_HOMESERVER_URL=https://matrix.example.org   # your homeserver's client API
MATRIX_ACCESS_TOKEN=                               # the @rumi account's access token
MATRIX_USER_ID=@rumi:example.org                   # optional; saves a lookup on the first send
MATRIX_STORAGE_DIR=/data/matrix-storage            # must survive restarts (see below)
MATRIX_E2EE=on                                     # the default; "off" only if plaintext is acceptable
```

Then start both processes and check:

```bash
node bot/whatsapp-bot.js          # owns the Matrix connection
node bot/workers/sqs-worker.js    # lesson plans, coaching reports, ... sent through the bot
node bin/rumi.js doctor           # "Matrix channel — connected as @rumi:…, end-to-end encrypted"
```

`node bot/scripts/matrix-smoke.js` (with `MATRIX_SMOKE_TARGET_USER=@teacher:example.org`) runs a live round
trip with one account. Stop the bot first: it opens its own connection.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `MATRIX_HOMESERVER_URL` | yes | — | With the token, switches the channel on |
| `MATRIX_ACCESS_TOKEN` | yes | — | The bot account's token. Keep it secret; rotating it means a new device (see below) |
| `MATRIX_USER_ID` | no | looked up | The bot's own id |
| `MATRIX_ALLOWED_SERVERS` | no | the bot's own server | Other homeservers whose users may reach Rumi, comma-separated (`example.org,other.example.org`). Invites from any other server are declined and its users' messages ignored |
| `MATRIX_STORAGE_DIR` | no | `./.matrix-storage` | Sync position and the encryption store |
| `MATRIX_E2EE` | no | `on` | Only `off` runs without encryption |
| `MATRIX_WELCOME_ROOM_ALIAS` | no | `#rumi-announcements:<server>` | The room new accounts are auto-joined to; Rumi greets each newcomer in a DM |
| `MATRIX_TYPING_MAX_SECONDS` | no | `300` | The longest Rumi shows "is typing…" for one piece of work (see [Typing and read receipts](#typing-and-read-receipts)) |
| `RUMI_FEATURE_CHANNEL_MATRIX` | no | — | `off` pauses the channel without deleting its keys: the bot does not connect to Matrix and does not send to it, from the next restart (the console's Features page writes it) |

**Matrix only, or alongside WhatsApp.** With `CHANNEL_DRIVER=none` there is no WhatsApp at all: no Meta
account, no linked phone, and `rumi doctor` and the console say Rumi is answering on Rumi Messenger. Anything
that tries to send to a bare phone number then fails with a clear error instead of pretending to succeed.
Keep `meta` or `baileys` instead to run both while teachers move across.

**Phones must reach the homeserver.** The URL your homeserver advertises (its `.well-known` client base URL
and `public_baseurl`) is what the teachers' apps connect to, so it must be reachable from their phones — a
public `https://` name, not `127.0.0.1` or a LAN-only address. The bot itself can use a private URL.

## How teachers are identified

A teacher's Matrix username is their phone number with a leading `+`: `@+15550100001:example.org`.
Rumi stores that teacher as `mtx:15550100001`, the same digits a WhatsApp number would have, so it fits the
existing database columns, and records the number for the portal's sign-in. rumi-messenger's
`teacher.sh add "+1555…" "Name"` creates accounts in this form. The short form is only for accounts on the
bot's own homeserver. An older `t` username (`@t15550100001:example.org`) is a different account and so a
different teacher (`mtx:t15550100001`, no phone number recorded). Any other username (`@teacher:example.org`),
and every account on another homeserver, is stored in full, as `matrix:@teacher:example.org`. Two numbers
that differ only in their country code stay two different teachers.

### Who can reach Rumi

Only users on the bot's own homeserver, plus any listed in `MATRIX_ALLOWED_SERVERS`. Rumi declines invites
from every other server and ignores its users' messages, even in a room it shares with them. Within your
server, Rumi trusts the username: the phone number in `@+15550100001` is whatever the account was created
with, not a verified number, and it decides which teacher (and which portal sign-in) the account gets. So run
the homeserver the way rumi-messenger does: accounts created by an admin only (registration closed) and
federation off. Never allow a server where people pick their own usernames.

### Running Rumi in public

The server described here is a closed school server: an admin creates every account. To let anyone sign up,
first set the bot's limits and harden the homeserver. [Running Rumi in public](../running-in-public.md) has the
full list. In short:

- **Bot** (`.env`): `INBOUND_RATE_LIMIT_PER_MINUTE=30` and `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE=120` (defaults), `DAILY_MESSAGE_CAP_UNREGISTERED=40`, `DAILY_MESSAGE_CAP_REGISTERED=300`,
  `DAILY_LESSON_PLAN_CAP_UNREGISTERED=3`, `DAILY_COACHING_CAP_UNREGISTERED=0`, `DAILY_QUIZ_CAP_UNREGISTERED=2`,
  and the deployment's own OpenRouter key with a credit limit. When the key runs dry, Rumi says "busy" once
  instead of failing ([how the limits work](../features/public-limits.md)).
- **Synapse:** keep `enable_registration: false` and create accounts from a sign-up service (captcha, per-IP
  limits) through `registration_shared_secret`; give public accounts random `@t<digits>` usernames, not phone
  numbers. Keep federation off, set `user_directory.search_all_users: false` and
  `limit_profile_requests_to_users_who_share_rooms: true`, send announcements as DMs rather than through a room
  every account joins, keep `rc_message` and set a low `rc_invites.per_issuer`, and block `/_synapse/admin` at
  the proxy.

## Portal sign-in on the messenger

The [teacher portal](../features/teacher-portal.md) signs people in by phone number and a password. A teacher
whose username is their number (`@+15550100001`) types `/portal` in their DM with Rumi and gets the setup link
there; the message says to sign in with `+15550100001`. "Forgot password" on the portal sends the 6-digit code
to the same DM. This works with `CHANNEL_DRIVER=none`: the setup link and the code go to the teacher's Matrix
account, never to a bare phone number. A coach on the observe roster can be sent the invite before they have
written to Rumi: `node bot/scripts/observe-roster.js portal-invite mtx:15550100011`.

A username that is a name (`@robin:example.org`) carries no phone number, so there is nothing to sign in with.
`/portal` says so and sends no link. An operator can record a number for that person
(`update users set phone_number = '<digits>' where id = '<their users.id>'`); the link and reset codes then go to
their Matrix DM as usual.

## Encryption

Encryption is on by default and **fails closed**. It uses the native `@matrix-org/matrix-sdk-crypto-nodejs`
package that `matrix-bot-sdk` installs, on **Node 22 or newer**. If it cannot load (no prebuilt binary for the host),
the Matrix channel refuses to start with an error saying why, the bot keeps serving its other channels, and
`rumi doctor` reports it. Set `MATRIX_E2EE=off` only if plaintext is acceptable on your homeserver.

Sends fail closed too. Before the first send to a room the bot does not yet know as encrypted, it reads the
room's encryption state from the homeserver. Only a "not found" answer allows a plaintext send. If that read
fails (a 5xx or a timeout), the message or attachment is not sent, and the log line
`cannot confirm whether the room is encrypted` names the room.

**`MATRIX_STORAGE_DIR` must persist.** It holds the encryption keys of the bot's device, paired with its
access token. On a host with an ephemeral disk (most PaaS services), mount a volume there. If the store is
lost, the old token can no longer encrypt: log in again for a new token (a new device) and, if you
cross-sign, sign the new device (rumi-messenger's `scripts/bot-cross-sign.sh`).

**Run one bot process per store.** Two processes syncing on one device fight over its keys and its saved
state. Let an old instance stop before a new one starts (no overlapping deploys on one volume).

## The relay

Only the bot process holds the Matrix connection. Every other process (the queue worker, the stale-session
cron, the Morning Brief worker, a script) sends to Matrix by queuing the call in Redis; the bot performs it
and returns the result. Files travel with the call, so the processes do not need a shared disk. This is
automatic. If the bot is down, a worker's send waits up to three minutes and is then reported as failed.

The bot does not trust the Redis it shares. Each queued call is signed with a key derived from
`MATRIX_ACCESS_TOKEN`, so every process that sends to Matrix needs the same token as the bot. The bot drops
unsigned calls and calls whose sender has stopped waiting. The Redis keys include a short id derived from the
token and `MATRIX_HOMESERVER_URL`, so two deployments on one Redis do not run each other's sends. The bot never
reads a file path from a call: a file comes only as the bytes the sender read, and media only as those bytes
or an `http(s)` URL. A send that is already uploading when its sender gives up can still arrive, so a retry
can send it twice.

## Typing and read receipts

When Rumi takes a message it marks it read (an `m.read` receipt, so the teacher sees it was seen) and shows
"Rumi is typing…" in that room. The typing stays on while the work runs, including a lesson plan, test paper,
lesson quiz, photo lesson plan or homework bundle that the worker makes. It goes off as soon as Rumi's answer
arrives, whether the bot sends it or the worker does through the relay. While the worker is still making
something, Rumi's other messages to the room (the "I'm making your test paper…" note, a reminder) leave the
typing on: it ends with the job's own delivery, or when the job ends. A safety cap ends it after
`MATRIX_TYPING_MAX_SECONDS` (default 300). Rumi shows no typing and sends no receipt for a group message it
ignores. If a typing call fails, the failure is logged and the answer is still sent. Receipts and typing
notices are not encrypted on any Matrix server, so they work the same with `MATRIX_E2EE` on or off.

## Messages sent while the bot is down

Rumi answers them when it comes back, once. It keeps a marker of the last message it processed next to the
encryption store, answers everything after it, and skips anything it already answered. (Messages older than
23 hours are dropped, as on WhatsApp.)

## Staff group rooms

In a room with more than one person, Rumi stays quiet unless someone addresses it: by mention, or by starting
the message with its name ("Rumi, …"). A numbered reply only answers the menu Rumi sent to that teacher.
Rumi's answer goes to the group, but nothing else does: reports, registers, reminders and every later message
for that teacher go to their own DM. If Rumi cannot read a room's members, it treats the room as a group.

## In the apps

- **Element treats a leading `/` as an app command** and does not send it, so on the messenger every Rumi
  command is typed as the bare word: `menu`, `quiz`, `register`, `language`. See
  [Registration and commands](#registration-and-commands-on-the-messenger).
- Element shows a small shield on Rumi's messages until the bot's device is cross-signed. It is cosmetic;
  messages are still encrypted.

## Registration and commands on the messenger

**Anyone can start chatting.** A person who is not registered gets Rumi's answer to whatever they sent first
("Hi", or a teaching question), followed by one optional offer:

> By the way, what should I call you? Tell me your name to register — or just keep chatting; you can type
> register any time.

- An introduction ("my name is Ayesha", "I'm Ayesha", "Hi, I'm Ayesha", "mera naam Ayesha hai") completes
  registration: the `users` row gets `first_name` and `registration_completed = true`, and Rumi confirms ("Nice to
  meet you, Ayesha!"), with a portal link when the account has a phone number to sign in with.
- A bare word or two ("Ayesha") is asked about once, because keeping chatting is often one word ("fractions"):
  *"Shall I call you Ayesha? Reply yes, or tell me your name."* "yes", the same name again, or an introduction
  completes registration; anything else is answered as usual and the offer stays open.
- Anything that is not a name (a question, a request, "ok", "got it") is answered as usual and the offer stays
  open. "no thanks", "later" or "skip" closes it, also after the confirm question. The offer is made once.
- `register` starts registration at any time; a registered person is told they already are.

On WhatsApp nothing changes: Rumi asks for the name after a teacher's first finished feature, where an unprompted
question would read as spam. Slack and Discord keep their registration form.

**Commands are bare words.** Every Rumi command also works without its slash, on every channel: `menu`,
`register`, `language`, `settings`, `status`, `portal`, `quiz`, `video`, `reading test`, `testpaper`,
`my papers`, `homework`, `editclass`, `addclass`, `attendance`, `observe`. Only the whole message counts, so
"menu items for lunch" is still chat. On the messenger, `quiz` also takes a topic (`quiz fractions`,
`quiz me on the water cycle`), as `/quiz fractions` does elsewhere. `paper`, `exam` and `grade` stay
slash-only because the bare words are ordinary answers ("grade 4").

Rumi's own messages on the messenger name the bare word ("type quiz"); WhatsApp, Slack and Discord still see
`/quiz`. The rewrite happens in the Matrix driver, so it covers every message, model replies included, and
never touches a link (`https://…/portal/…`).

## What works on Matrix

From the scripted end-to-end run (a local Synapse, the full bot and worker, real model providers, encryption
on). "Degrades" means it works with a plainer experience; "breaks" means a teacher cannot finish.

| Feature | On Matrix | Notes |
|---|---|---|
| Chat (text) | works | Reaction, read receipt, typing, reply |
| Welcome for a new account | works | Greeting in a DM once the teacher joins it |
| Registration | works | Offered after the first reply, or on `register` at any time; the name completes it. Asked as a question even when `REGISTRATION_FLOW_ID` is set for WhatsApp |
| Menus and pickers | degrades | Numbered menu; reply with a number or the option's name |
| Forms (reading setup, class setup, attendance) | degrades | One question per message; `cancel` leaves; commands still work |
| Voice note in, spoken reply out | works | Reply is a voice message |
| Reading assessment | works | Passage image, recording, then the result, PDF report and audio feedback |
| Classroom coaching | works | Send the recording as an audio file (15 minutes or longer). Report PDF, voice debrief and commitment card arrive from the worker. The "share a classroom photo?" Yes/No has no handler yet on any channel: send the photos (up to 3) to continue |
| Attendance | works | Including the monthly register spreadsheet |
| Quiz preview in chat | works | Numbered questions |
| Lesson plans | works with `GAMMA_API_KEY` | Without the key the teacher gets an apology within seconds |
| Exam checker | breaks after OCR | Photos and OCR work and students are confirmed automatically; the question-confirmation step has no handler yet on any channel |
| Morning Brief to a Matrix room | works | `BRIEF_RECIPIENTS=mtx:1555…`, sent through the relay |
| `/status`, homework, edit class | degrades | Text summary, or an honest "not available", when their Flow ids are set for WhatsApp |
| Group rooms | works | Quiet until addressed |
| Approved templates (24-hour window) | n/a | Matrix has no message window; template-only sends return false |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `The matrix channel did not start: … refusing to start without encryption` | The crypto package did not load. Reinstall `bot/` dependencies (`npm ci` in `bot/`) on Node 22+, or set `MATRIX_E2EE=off` |
| `M_UNKNOWN_TOKEN` at start | The token was revoked or mistyped. Log the bot in again |
| `The matrix channel did not start: … retrying in N s`, `/health` shows `channels.matrix: "down"` | The homeserver did not answer. The bot retries (5 s, doubling to 5 minutes) and Matrix starts once it answers; `rumi doctor` says why it failed. With `CHANNEL_DRIVER=none`, `/health` reports `status: "degraded"` meanwhile (still HTTP 200) |
| `One time key … already exists`, or messages Rumi cannot decrypt | Two processes share the device, or the store was lost. Stop extra processes; if the store is gone, use a new token and device |
| The worker's PDFs and reports never arrive | `REDIS_URL` differs between bot and worker, or the bot is not running |
| A teacher gets no welcome | The announcements room alias does not exist; create it or set `MATRIX_WELCOME_ROOM_ALIAS` |
| A coaching recording is answered like a voice note | It was sent as a voice message, or is shorter than 15 minutes |
| Uploads fail on a self-hosted object store | Set `R2_FORCE_PATH_STYLE=true` for stores that need path-style addressing (MinIO) |
