# messaging — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/messaging -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `baileys-channel-service.test.js` | Pins baileys-channel.service outbound (text JID send, emotion-tag strip, false on socket error), connection mocked |
| `baileys-connection.test.js` | Pins baileys-connection lazy connect, getSocket on "open", and auth-state dir, with baileys-lib mocked |
| `baileys-socket-adapter.test.js` | Pins baileys-socket.adapter mapping a WAMessage to the Meta webhook shape, JID parsing and numeric-reply selection |
| `bare-command-routing.test.js` | Pins every command-words.js command working as a bare word, reaching the same handler as the slash form |
| `channel-capabilities.test.js` | Pins flowSurfaceFor deciding native vs text Flows per channel and driver, so Matrix/Baileys never hit a dead end |
| `channel-driver-index.test.js` | Pins messaging/index.js choosing Meta or Baileys from CHANNEL_DRIVER, inferring meta from existing Meta vars |
| `channel-driver-none.test.js` | Pins CHANNEL_DRIVER=none: no WhatsApp credentials or Graph calls at boot, Matrix routing, bare numbers refused |
| `channel-driver-parity.test.js` | Pins every channel driver exposing the same method surface so WhatsAppService calls never hit "not a function" |
| `channel-health.test.js` | Pins attachWithRetry backoff (5s doubling to 5min) for failed channels and /health reporting them as degraded |
| `channel-lifecycle.test.js` | Pins a logged-out Baileys session exiting with code 78 and shutdown closing the socket cleanly |
| `channel-registry.test.js` | Pins channel-registry data: WhatsApp-family vs additive channels and the production-tier allowlist, baileys sandbox |
| `channel-switch-off.test.js` | Pins resolveActiveChannels honouring RUMI_FEATURE_CHANNEL_<NAME>=off so a switched-off channel really stops |
| `command-words.test.js` | Pins normalizeCommand turning bare command words into slash commands, leaving ordinary sentences alone |
| `discord-channel-service.test.js` | Pins discord-channel.service outbound and identity behaviour, with discord-connection mocked and real builders |
| `discord-connection.test.js` | Pins discord-connection lazy login and the clientReady event, with discord.js virtually mocked |
| `discord-events-adapter.test.js` | Pins discord-events.adapter mapping messageCreate/interactionCreate to the Meta webhook shape with discord: ids |
| `discord-modal-flow.test.js` | Pins discord-modal-flow customId codec and Redis-backed modal state for the Discord modal workaround |
| `endpoint-text-flow.test.js` | Pins endpoint-text-flow driving a Flow endpoint over chat: screen order, accumulated data, single final submit |
| `matrix-account-data-serialization.test.js` | Pins matrix-connection serialising and retrying m.direct account-data writes so an invite burst cannot crash the bot |
| `matrix-allowed-servers.test.js` | Pins Matrix invites and messages being accepted only from the own server or MATRIX_ALLOWED_SERVERS |
| `matrix-channel-service.test.js` | Pins matrix-channel.service identity stripping, DM room caching and outbound sends, with matrix-connection mocked |
| `matrix-connection.test.js` | Pins matrix-connection lazy start, getClient on start, and refusing to run when the E2EE crypto module is absent |
| `matrix-encrypted-send-guard.test.js` | Pins sends into encrypted Matrix rooms never falling back to plaintext when the encryption lookup fails |
| `matrix-events-adapter.test.js` | Pins matrix-events.adapter mapping room.message and failed decryption events to the Meta webhook shape |
| `matrix-group-reply-room.test.js` | Pins replies going to the room used and a group room never becoming a teacher's DM for private deliveries |
| `matrix-identity.test.js` | Pins the matrix-identity codec between short mtx:<digits> and long matrix:@user:server forms (varchar(20) budget) |
| `matrix-job-typing.test.js` | Pins the worker holding Rumi-is-typing in a Matrix teacher's room through the relay for the job's duration |
| `matrix-media-error-no-url.test.js` | Pins Matrix sendDocumentFromUrl redacting file URLs from R2-failure and fetch-failure log lines |
| `matrix-outbound-relay-security.test.js` | Pins the relay owner refusing local paths, unsigned or expired requests and malformed argument shapes |
| `matrix-outbound-relay.test.js` | Pins the Redis relay shipping worker Matrix calls to the sync owner, with files and buffers crossing by value |
| `matrix-reply-room.test.js` | Pins replies going to the room the message arrived in, remembered across restarts, DM lookup only as fallback |
| `matrix-typing.test.js` | Pins Matrix read receipt, typing on and typing off right after the reply, with no typing for unaddressed group messages |
| `pending-options.test.js` | Pins pending-options mapping a bare number to the menu option shown, with in-memory fallback on Redis failure |
| `slack-channel-service.test.js` | Pins slack-channel.service identity stripping, DM channel caching and outbound sends, with @slack/web-api mocked |
| `slack-events-adapter.test.js` | Pins slack-events.adapter mapping Events API messages and block_actions to the Meta webhook shape |
| `slack-modal-flow.test.js` | Pins slack-modal-flow metadata codec and Block Kit modal building over an endpoint's init/exchange/back |
| `slack-signature-service.test.js` | Pins slack-signature.service HMAC verification against independently computed signatures and freshness |
| `team-channel-targets.test.js` | Pins Slack channel, Discord channel and Baileys group targets for the team brief send, without breaking person sends |
| `text-flow-definitions.test.js` | Pins the five sandbox text flows, incl. reading-assessment synthesising a routable nfm_reply for flow-response.handler |
| `text-flow.test.js` | Pins the text-flow engine standing in for Meta Flows: registration, step-by-step run, in-memory fallback |
| `text-handler-channel-identity.test.js` | Pins handleTextMessage splitting "mtx:<digits>" at the colon when no user is passed, creating no wrong account |

## Who reads this (all, generated)
- env `REDIS_URL` read at `tests/messaging/matrix-group-reply-room.test.js:59:88d1c0ac` · `tests/messaging/matrix-typing.test.js:58:88d1c0ac`
- env `TRANSCRIPT_QUIZ_ENABLED` read at `tests/messaging/bare-command-routing.test.js:120:64520470`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/messaging/CLAUDE.index.md`? · `bot/shared/services/messaging/CLAUDE.md`? · `bot/shared/services/messaging/inbound/CLAUDE.index.md`? · `bot/shared/services/messaging/inbound/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `docs/onboarding/sandbox-production-design.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/messaging/CLAUDE.index.md`? · `tests/messaging/CLAUDE.md`?
