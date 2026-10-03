# 🖥️ Teacher portal sign-in

> Teachers and coaches sign in to the portal with their phone number and a password. The setup link and the
> password reset code reach them in their own chat with Rumi, on WhatsApp or on Rumi Messenger.

## What it is

The teacher portal (`portal/`, served by the dashboard) shows a teacher their lesson plans, coaching reports,
reading results and videos, and shows a coach their observations. Sign-in is a phone number and a password:

- **Setting a password.** Rumi sends a one-time setup link (valid 7 days). The teacher opens it and chooses a
  password. The link comes when they type `/portal`, at the end of registration, or (for coaches) when the partner
  sends it from the roster.
- **Forgot password.** The teacher types their number on the portal's reset page and gets a 6-digit code (valid
  10 minutes), then chooses a new password.

Both messages go to the person's **own channel**: where they last talked to Rumi, as recorded in
`user_channels`. A teacher on WhatsApp gets them on WhatsApp, exactly as before. A teacher who uses only
[Rumi Messenger](../channels/matrix.md) gets them in their Matrix DM, including on a deployment with no
WhatsApp at all (`CHANNEL_DRIVER=none`).

## How it works

1. **`/portal`** in any chat. If the portal is already set up, Rumi replies with the sign-in link. Otherwise
   it mints a setup token and sends the link, through the messaging facade, to the identity the teacher wrote
   from. Off WhatsApp the message also says which number to sign in with (`+15550100001`), since it is not the
   address they chat on.
2. **The setup page** sets the password and signs them in.
3. **The reset page** posts the number to `/api/portal/request-reset`. The dashboard finds the account, stores
   a code and asks the bot (`POST /api/internal/send-password-reset`, with `INTERNAL_API_KEY`) to send it to
   that user. The bot sends it to the user's channel identity, not to the typed number. Every answer the page
   shows is the same generic one, so the page does not reveal which numbers have accounts, and an unknown
   number gets nothing sent.
4. **Coaches** (anyone in the observe role family, with `OBSERVE_ENABLED=true`) see an **Observations** item
   after signing in. Their invite says so.

## Who can sign in

The portal signs in by **phone number** (`users.phone_number`), so a person needs one on file:

| Person | Phone number on file | Portal |
|---|---|---|
| WhatsApp teacher | their WhatsApp number | as before |
| Rumi Messenger teacher, username `@+15550100001` | `15550100001`, recorded from the username when they first write | link and code in their Matrix DM |
| Coach put on the roster as `mtx:15550100011`, has not written yet | recorded from the roster identity when the invite is sent | `observe-roster.js portal-invite`, link in their Matrix DM |
| Rumi Messenger username that is a name (`@robin:example.org`), or a Slack/Discord account | none | `/portal` explains this and sends no link (see below) |

A number is only recorded when no other user already holds it.

**No phone number.** A setup link would let them choose a password they can never sign in with, so Rumi sends
no link. `/portal` replies: *"The portal signs you in with your phone number, and this chat account doesn't
have one on file, so a portal link wouldn't let you in. Ask your administrator to add your phone number to your
Rumi account, then send /portal again."* Registration ends with the welcome but no portal link. To give them
access, an operator records the number on their row:

```sql
update users set phone_number = '15550100051' where id = '<their users.id>';
```

After that, `/portal` sends the link and the reset code still reaches the account they chat on (their Matrix DM,
Slack or Discord). Messenger usernames that are phone numbers (`@+15550100001`) need none of this, and
rumi-messenger creates accounts that way.

## Turn it on

The portal is optional. With `PORTAL_URL` unset, no message carries a portal link.

1. **Build the portal** and give it to the dashboard, which serves it next to its API:
   `cd portal && npm ci && npm run build && cp -R dist ../dashboard/portal-frontend/dist`.
2. **Run the dashboard** (`node dashboard/index.js`) on an `https://` address: the session cookie is
   `Secure`, so the portal cannot keep anyone signed in over plain http. Behind a proxy that terminates TLS,
   the dashboard trusts its `X-Forwarded-Proto`.
3. **Set the variables**:

| Variable | Service | Meaning |
|---|---|---|
| `PORTAL_URL` | bot | The dashboard's public address; links are `<PORTAL_URL>/portal/setup/<token>` |
| `MAIN_BOT_URL` | dashboard | Where the dashboard reaches the bot, to send reset codes |
| `INTERNAL_API_KEY` | bot **and** dashboard | The same random secret on both. The bot refuses every internal send while it is unset |
| `SESSION_SECRET` | dashboard | Signs the portal session |
| `OBSERVE_ENABLED=true` | dashboard too | Shows coaches the Observations view (see [Observe](observe.md)) |

4. **Coaches** on the observe roster can be sent their invite from the roster, on whichever channel they use:

```bash
node bot/scripts/observe-roster.js portal-invite mtx:15550100011
# ✓ portal invite sent to mtx:15550100011
```

   It runs as a one-off process; on Rumi Messenger the message goes through the bot's
   [relay](../channels/matrix.md#the-relay), so the bot must be running. It refuses someone who has already set
   up the portal, someone not on the roster, and someone with no phone number.

## Limits

- Sign-in is by phone number only; there is no sign-in with a Matrix, Slack or Discord identity.
- The reset code goes to the channel the person last used. Someone on both WhatsApp and Rumi Messenger gets it
  on the one they used most recently.
- The portal's own pages are in English.
