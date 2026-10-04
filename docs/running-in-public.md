# Running Rumi in public

Most Rumi deployments serve a known group: teachers a programme registered, on a WhatsApp number or a school
messenger where an admin creates every account. **Running in public** means anyone with the link can open an
account, like a public WhatsApp number or a messenger with open sign-up. This page lists what to set before you
do that, on the bot and on the messenger.

## On the bot

Each limit is an `.env` value, read per message ([how they work](features/public-limits.md)).

| Limit | Variable | Recommended in public | Default |
|---|---|---|---|
| Messages per sender per minute | `INBOUND_RATE_LIMIT_PER_MINUTE` | `30` | `30` |
| Photos, documents, voice notes and other media per sender per minute (counted apart from text) | `INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE` | `120` | `120` |
| Messages a day, unregistered account | `DAILY_MESSAGE_CAP_UNREGISTERED` | `40` | no cap |
| Messages a day, registered account | `DAILY_MESSAGE_CAP_REGISTERED` | `300` (a generous ceiling: Rumi's own registration is just a name, so "registered" alone is no barrier) | no cap |
| Lesson plans a day, unregistered | `DAILY_LESSON_PLAN_CAP_UNREGISTERED` | `3` | no cap |
| Lesson plans a day, registered | `DAILY_LESSON_PLAN_CAP_REGISTERED` | `5` | no cap |
| Lesson plans a day, the whole deployment (every account together) | `DAILY_LESSON_PLAN_CAP_TOTAL` | what your Gamma plan covers in a day, e.g. `100` | no cap |
| Coaching recordings a day, unregistered | `DAILY_COACHING_CAP_UNREGISTERED` | `0` (after registration only) | no cap |
| Quizzes a day, unregistered | `DAILY_QUIZ_CAP_UNREGISTERED` | `2` | no cap |
| Quizzes a day, everyone | `QUIZ_DAILY_CAP` | `10` | `10` |
| "Busy" cooldown after the budget runs out | `MODEL_BUDGET_COOLDOWN_SECONDS` | `300` | `300` |
| The school day | `SCHOOL_TIMEZONE` | your schools' zone | `UTC` |

Also:

1. **Decide what "registered" means.** The daily caps distinguish accounts by `users.registration_completed`.
   Rumi sets it once a teacher gives their name, so on a public link it says little about who someone is. If
   your sign-up service verifies people (a link to a known teacher, a school token), let it decide when an
   account counts as registered, and keep `DAILY_MESSAGE_CAP_REGISTERED` set either way.
1. **Give the public deployment its own OpenRouter key with a credit limit.** Make the key in the OpenRouter
   dashboard and set its limit there. When the key reaches the limit, Rumi replies "Rumi is very busy right now"
   (once per sender), and you get one `model_budget_exhausted` alert in the log instead of an error per
   message. Raise the limit or top up, and Rumi answers again within `MODEL_BUDGET_COOLDOWN_SECONDS`.
1. **Lesson plans cost Gamma credits.** Leave `GAMMA_API_KEY` unset to keep them off: a teacher who asks is
   told "Lesson plans aren't available on this service yet." and nothing is queued. With the key set, cap them
   per account and for the whole deployment (`DAILY_LESSON_PLAN_CAP_REGISTERED`, `DAILY_LESSON_PLAN_CAP_TOTAL`),
   so the daily total cannot outrun your Gamma plan.
2. **Run Redis.** Every limit is shared across replicas through Redis. Without it each process keeps its own
   count, which still limits, but less precisely.
3. **Watch for the alert.** Search the logs for `model_budget_exhausted`, or point your log alerts at it (see
   [monitoring](monitoring.md)). Lines with `Inbound rate limit: message dropped` and `Daily message cap reached`
   show the limits working.

## On the teacher portal (dashboard)

The portal's sign-in, setup and password-reset routes are public, so the dashboard limits them per client IP and
per account (the phone number typed in). Either limit answers `429` with the same message, "Too many attempts.
Please try again later.", whether or not the account exists. The counts live in Redis when the dashboard has
`REDIS_URL` (shared by every worker and replica), otherwise in each process's memory. All values are optional
([details](features/teacher-portal.md#sign-in-limits)).

| Limit | Variable | Default |
|---|---|---|
| Window for every limit below, in minutes | `PORTAL_AUTH_LIMIT_WINDOW_MINUTES` | `15` |
| Failed sign-ins per IP | `PORTAL_LOGIN_LIMIT_PER_IP` | `10` |
| Failed sign-ins per phone number | `PORTAL_LOGIN_LIMIT_PER_ACCOUNT` | `5` |
| Reset requests, code checks and new passwords per IP (each step counted apart) | `PORTAL_RESET_LIMIT_PER_IP` | `5` |
| Reset requests and code checks per phone number | `PORTAL_RESET_LIMIT_PER_ACCOUNT` | `5` |
| Setup-link checks and setups per IP | `PORTAL_SETUP_LIMIT_PER_IP` | `10` |
| Every portal request per IP per minute | `PORTAL_DATA_LIMIT_PER_MINUTE` | `300` |
| Wrong tries one reset code allows before it is cleared | `PORTAL_RESET_CODE_MAX_ATTEMPTS` | `5` |

Many teachers in one school can share one IP. Successful sign-ins are not counted, but if a school still hits the
per-IP limits, raise them rather than turning them off. Set `SESSION_SECRET`: it also keys the hash that keeps
phone numbers out of the Redis keys.

Logs never carry a full file URL: the bot and the dashboard log a report, PDF or export link as its host and a
short hash of its path (`pub-abc.r2.dev#sha256:1a2b3c4d5e6f.pdf`), so reading the logs does not open anyone's files.

## On the messenger (Matrix / Synapse)

The [Rumi Messenger](channels/matrix.md) server is set up for a closed school, where every account is created by
an admin. Opening it to the public changes what the homeserver must do. These measures come from the
`rumi-messenger` project's homeserver setup (`deploy/synapse/patch_homeserver.py`) and its public sign-up
review:

| Measure | Setting | Why |
|---|---|---|
| **No open registration on Synapse** | `enable_registration: false`; create accounts through a sign-up service that calls the `registration_shared_secret` API after its own checks (a captcha such as Turnstile, one account per token, per-IP limits) | Synapse's own docs call open registration "a known vector for spam and abuse" |
| **Usernames are not phone numbers** | public accounts get a random id (`@t<digits>`); a number typed at sign-up stays unverified | stops anyone claiming an existing teacher's account by typing their number. Rumi already refuses to give a `t` account a phone number |
| **Federation off** | `federation_domain_whitelist: []` and the `federation` listener resource removed (already so in rumi-messenger) | the server is an island; no traffic from other servers |
| **User directory scoped** | `user_directory.search_all_users: false`; `limit_profile_requests_to_users_who_share_rooms: true` (with `require_auth_for_profile_requests: true`, already set) | otherwise a new account can search the whole directory and list every teacher |
| **No shared room every account joins** | send announcements as direct messages from Rumi, not through a public room in `auto_join_rooms` | a room everyone is in shows everyone in its member list |
| **Rate limits** | keep `rc_message` (5/s, burst 30) and `rc_login`; set `rc_registration` and a low `rc_invites.per_issuer` for new accounts | a new account cannot spam invites |
| **Admin API off the public address** | block `/_synapse/admin` at the proxy (a Caddy route), or reach it only over a private network | otherwise only the admin password stands between the internet and the admin API |
| **Uploads** | `max_upload_size: 20M`; purge local media nobody has opened in 180 days (`media_retention.local_media_lifetime`) | an account cannot store unlimited files at your cost |

Bot-side, Rumi still answers only users on its own homeserver (plus any in `MATRIX_ALLOWED_SERVERS`). Leave
`MATRIX_ALLOWED_SERVERS` empty in public.

## Before you open the link

- [ ] The `.env` values above are set, and `rumi doctor` is green.
- [ ] The OpenRouter key is the public deployment's own key and has a credit limit.
- [ ] Redis is running and `REDIS_URL` points at it.
- [ ] The dashboard has `REDIS_URL` and `SESSION_SECRET` too. Try 11 wrong portal sign-ins from one address and
      expect the 11th to answer "Too many attempts".
- [ ] Log alerts watch for `model_budget_exhausted`.
- [ ] (Matrix) Registration is closed on Synapse, federation is off, the directory is scoped, the admin API is
      not public, and accounts come from your sign-up service.
- [ ] Try it yourself. Send 40 messages in a minute and expect 30 answers plus one "slow down". From a new
      account, ask for a fourth lesson plan in a day and expect a clear "daily limit" message.
