# messaging — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/messaging -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `inbound/` | Adapters turning each channel's events into webhook-shaped payloads → `inbound/CLAUDE.md` |
| `baileys-channel.service.js` | Sandbox WhatsApp Web channel driver (Baileys) implementing the channel send interface |
| `baileys-connection.js` | Owns the single persistent Baileys socket shared by the pairing script and channel driver |
| `baileys-lib.js` | ESM-interop loader for the baileys package so CJS code and tests can import it |
| `channel-capabilities.js` | Says whether a channel can draw native WhatsApp Flows, so handlers pick Flow or text equivalent |
| `channel-health.js` | Retries persistent channels that failed at boot and builds the channel section of GET /health |
| `channel-registry.js` | Static map of channel drivers and which are production-tier; read by feature-availability and setup scripts |
| `command-words.js` | The one list of text commands, with bare-word aliases so Matrix users can invoke them without a slash |
| `discord-channel.service.js` | Discord channel driver with native buttons and select menus, keeping Meta button ids as customId |
| `discord-connection.js` | Owns the single Discord Gateway client shared by the outbound driver and inbound adapter |
| `discord-modal-flow.js` | Renders Flow screens on Discord via select-menu messages plus text-only modals |
| `endpoint-text-flow.js` | Turns a WhatsApp Flow data-exchange endpoint into a text conversation; used by text-flow-definitions |
| `index.js` | Channel driver router (CHANNEL_DRIVER plus additive Slack/Discord/Matrix by identifier prefix) behind whatsapp.service |
| `job-typing.js` | Holds a typing indicator in a Matrix teacher's room while the worker runs a long job; wraps jobs in sqs-worker |
| `matrix-channel.service.js` | Matrix channel driver (self-hosted homeserver) with E2EE sends, parity with the Meta driver methods |
| `matrix-connection.js` | Owns the one persistent Matrix sync client and crypto store shared by driver and inbound adapter |
| `matrix-crypto-module.js` | Loads the crypto package matrix-bot-sdk encrypts with, avoiding a mismatched top-level copy |
| `matrix-identity.js` | Pure codec for short/long Matrix identity strings and the homeserver allowlist, fitting varchar(20) columns |
| `matrix-outbound-relay.js` | Lets the SQS worker send to Matrix teachers by relaying through the bot, which owns the sync connection |
| `meta-channel.service.js` | Production WhatsApp Cloud API channel driver: every send method (text, buttons, lists, flows, media, templates) |
| `none-channel.service.js` | Stub driver for CHANNEL_DRIVER=none whose bare-phone sends fail loudly; method list mirrors the Meta driver |
| `pending-options.js` | Remembers numbered menus so a plain-text numeric reply maps back to the interactive button or list id |
| `slack-channel.service.js` | Slack channel driver rendering buttons and selects as Block Kit, keeping Meta ids in values |
| `slack-modal-flow.js` | Renders a Flow endpoint's screens as Slack Block Kit modals and encodes modal metadata |
| `slack-web-client.js` | Thin lazy wrapper over the Slack web API for opening, pushing and updating modals; mocked by tests |
| `text-flow-definitions.js` | Text stand-ins for Flows (settings, videos, content library) registered at startup when the channel cannot draw Flows |
| `text-flow.js` | Multi-step one-question-per-message engine standing in for WhatsApp Flow forms on text-only channels |
| `user-identity.js` | Resolves where to reach a person (phone or user_channels row) for workers, observe and portal messages |

## Who reads this (all, generated)
- `baileys-channel.service.js` ← imported by `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:23:8e73faed`
- `baileys-connection.js` ← imported by `bot/scripts/setup/link-whatsapp.js:73:b0bf043c` · `bot/whatsapp-bot.js:1941:d3c3851e` · `bot/scripts/setup/baileys-pair.js:32:1fb95985` · `bot/shared/services/messaging/baileys-channel.service.js:39:ee3a7685` (+1: `python3 kg/kg.py who-reads baileys-connection.js`)
- `baileys-lib.js` ← imported by `bot/shared/services/messaging/baileys-connection.js:300:bfb8a558` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:483:a5db2529`
- `channel-capabilities.js` ← imported by `bot/shared/handlers/text-message.handler.js:50:073ea19e` · `bot/shared/services/exam-checker/exam-checker.orchestrator.js:15:27b40de4` · `bot/shared/services/feature-registration.service.js:21:71f9ae44` · `bot/shared/services/menu.service.js:8:71f9ae44` (+2: `python3 kg/kg.py who-reads channel-capabilities.js`)
- `channel-health.js` ← imported by `bot/whatsapp-bot.js:1898:3144e371`
- `channel-registry.js` ← imported by `bot/scripts/setup/doctor.js:31:90458071` · `bot/scripts/setup/graduate.js:45:218140d6` · `bot/scripts/setup/status.js:113:2701644f` · `bot/shared/config/feature-availability.js:27:97996aa9` (+18: `python3 kg/kg.py who-reads channel-registry.js`)
- `command-words.js` ← imported by `bot/shared/handlers/text-message.handler.js:49:bf03620f` · `bot/whatsapp-bot.js:52:5c96f84a` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:26:7f188880` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:52:7f188880` (+1: `python3 kg/kg.py who-reads command-words.js`)
- `discord-channel.service.js` ← imported by `bot/shared/routes/discord-flow-registry.js:20:9c5262dc` · `bot/shared/routes/discord-modal-interactions.handler.js:133:9c5262dc` · `bot/shared/services/messaging/discord-modal-flow.js:414:de66dd64` · `bot/shared/services/messaging/inbound/discord-events.adapter.js:88:f99ada50`
- `discord-connection.js` ← imported by `bot/whatsapp-bot.js:1967:0d191c31` · `bot/shared/services/messaging/discord-channel.service.js:104:a5f0f464` · `bot/shared/services/messaging/inbound/discord-events.adapter.js:268:83c186fa`
- `discord-modal-flow.js` ← imported by `bot/shared/routes/discord-flow-registry.js:19:0d65d71d` · `bot/shared/routes/discord-modal-interactions.handler.js:39:f6efbf6e`
- `endpoint-text-flow.js` ← imported by `bot/shared/services/messaging/text-flow-definitions.js:28:9b309331`
- `index.js` ← imported by `bot/scripts/brief/send-brief.js:162:efb25df6` · `bot/shared/services/whatsapp.service.js:12:ee9372b6`
- `job-typing.js` ← imported by `bot/workers/sqs-worker.js:54:d31ac490`
- `matrix-channel.service.js` ← imported by `bot/scripts/matrix-smoke.js:40:8513837d` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:114:cd6a1df7`
- `matrix-connection.js` ← imported by `bot/whatsapp-bot.js:1987:3dcf8d32` · `bot/scripts/matrix-smoke.js:39:14e39621` · `bot/shared/services/messaging/channel-health.js:77:9b97ca19` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:1076:2a8951cf` (+1: `python3 kg/kg.py who-reads matrix-connection.js`)
- `matrix-crypto-module.js` ← imported by `bot/scripts/setup/doctor.js:292:9880c03e` · `bot/shared/services/messaging/matrix-connection.js:164:ab09bf4f`
- `matrix-identity.js` ← imported by `bot/shared/services/messaging/inbound/matrix-events.adapter.js:50:55d6cf82` · `bot/shared/services/messaging/matrix-channel.service.js:50:c738a1ef` · `bot/shared/services/messaging/matrix-connection.js:114:c738a1ef`
- `matrix-outbound-relay.js` ← imported by `bot/whatsapp-bot.js:1974:40b0ef8b` · `bot/workers/sqs-worker.js:40:a34259b4` · `bot/scripts/matrix-smoke.js:38:a8b73e9c` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:1229:0adcf037` (+3: `python3 kg/kg.py who-reads matrix-outbound-relay.js`)
- `pending-options.js` ← imported by `bot/shared/services/quiz/transcript-quiz-offer.service.js:41:7210e963` · `bot/shared/services/messaging/baileys-channel.service.js:40:789e5ae1` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:24:eaca5893` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:51:eaca5893` (+2: `python3 kg/kg.py who-reads pending-options.js`)
- `slack-modal-flow.js` ← imported by `bot/shared/routes/slack-flow-registry.js:15:a94be41e` · `bot/shared/routes/slack-modal-interactions.handler.js:35:6aeabc42`
- `slack-web-client.js` ← imported by `bot/shared/routes/slack-flow-registry.js:16:4058ddcb` · `bot/shared/routes/slack-modal-interactions.handler.js:34:04d8ab87` · `bot/shared/services/messaging/slack-modal-flow.js:94:54f3a360`
- `text-flow-definitions.js` ← imported by `bot/shared/services/attendance-entry.service.js:83:5f268127` · `bot/shared/services/messaging/baileys-channel.service.js:305:6b581cc9` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:291:0ae73051` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:246:0ae73051` (+1: `python3 kg/kg.py who-reads text-flow-definitions.js`)
- `text-flow.js` ← imported by `bot/shared/services/messaging/baileys-channel.service.js:41:db810c7c` · `bot/shared/services/messaging/inbound/baileys-socket.adapter.js:25:029518bc` · `bot/shared/services/messaging/inbound/matrix-events.adapter.js:211:a4a36ca2` · `bot/shared/services/messaging/matrix-channel.service.js:1204:db810c7c` (+1: `python3 kg/kg.py who-reads text-flow.js`)
- `user-identity.js` ← imported by `bot/scripts/observe-roster.js:232:5afa51a1` · `bot/shared/routes/portal-internal-endpoint.js:19:767b44cc` · `bot/shared/services/observe/observe-identity.js:6:22be8eed` · `bot/shared/services/portal-invite.service.js:23:794a825c`
- env `ASSETS_BASE_URL` read at `bot/shared/services/messaging/meta-channel.service.js:31:0038e54c`
- env `ASSET_BASE_URL` read at `bot/shared/services/messaging/meta-channel.service.js:31:0038e54c`
- env `CHANNEL_DRIVER` read at `bot/shared/services/messaging/index.js:41:c9601253`
- env `CHANNEL_STATE_DIR` read at `bot/shared/services/messaging/baileys-connection.js:58:2f20fdbc`
- env `DISCORD_BOT_TOKEN` read at `bot/shared/services/messaging/discord-connection.js:69:0e607e4e`
- env `GRAPH_API_VERSION` read at `bot/shared/services/messaging/meta-channel.service.js:32:ddcada1f`
- env `MATRIX_ACCESS_TOKEN` read at `bot/shared/services/messaging/matrix-connection.js:413:7c4f5d80` · `bot/shared/services/messaging/matrix-outbound-relay.js:153:da0ef1b0`
- env `MATRIX_E2EE` read at `bot/shared/services/messaging/matrix-connection.js:138:7b19c88e`
- env `MATRIX_HOMESERVER_URL` read at `bot/shared/services/messaging/matrix-connection.js:412:e20f2881` · `bot/shared/services/messaging/matrix-outbound-relay.js:155:9ec8a515`
- env `MATRIX_STORAGE_DIR` read at `bot/shared/services/messaging/matrix-connection.js:142:f9e30456`
- env `MATRIX_TYPING_MAX_SECONDS` read at `bot/shared/services/messaging/matrix-channel.service.js:510:615c2c49`
- env `MATRIX_USER_ID` read at `bot/shared/services/messaging/matrix-channel.service.js:76:de75e5ab` · `bot/shared/services/messaging/matrix-connection.js:370:bfffd6a8`
- env `R2_ACCESS_KEY_ID` read at `bot/shared/services/messaging/baileys-channel.service.js:196:8e2ba78e` · `bot/shared/services/messaging/discord-channel.service.js:162:8e2ba78e` · `bot/shared/services/messaging/matrix-channel.service.js:236:8e2ba78e` · `bot/shared/services/messaging/slack-channel.service.js:154:8e2ba78e`
- env `R2_ENDPOINT` read at `bot/shared/services/messaging/baileys-channel.service.js:196:8e2ba78e` · `bot/shared/services/messaging/discord-channel.service.js:162:8e2ba78e` · `bot/shared/services/messaging/matrix-channel.service.js:236:8e2ba78e` · `bot/shared/services/messaging/slack-channel.service.js:154:8e2ba78e`
- env `R2_SECRET_ACCESS_KEY` read at `bot/shared/services/messaging/baileys-channel.service.js:196:8e2ba78e` · `bot/shared/services/messaging/discord-channel.service.js:162:8e2ba78e` · `bot/shared/services/messaging/matrix-channel.service.js:236:8e2ba78e` · `bot/shared/services/messaging/slack-channel.service.js:154:8e2ba78e`
- env `REDIS_URL` read at `bot/shared/services/messaging/matrix-outbound-relay.js:195:9bfac239`
- env `RUMI_CLI` read at `bot/shared/services/messaging/baileys-connection.js:350:b0f38a1d`
- env `SLACK_BOT_TOKEN` read at `bot/shared/services/messaging/slack-channel.service.js:87:f97760c5` · `bot/shared/services/messaging/slack-web-client.js:18:f97760c5`

## Tests (all, generated)
- `baileys-channel.service.js` ← `tests/messaging/baileys-channel-service.test.js` · `tests/messaging/channel-driver-index.test.js` · `tests/messaging/channel-driver-parity.test.js`
- `baileys-connection.js` ← `tests/messaging/baileys-connection.test.js` · `tests/setup/cli-console.test.js`
- `channel-capabilities.js` ← `tests/messaging/channel-capabilities.test.js`
- `channel-health.js` ← `tests/messaging/channel-health.test.js`
- `channel-registry.js` ← `tests/database/get-or-create-user-by-channel.test.js` · `tests/messaging/channel-driver-none.test.js` · `tests/messaging/channel-driver-parity.test.js` · `tests/messaging/channel-registry.test.js` · `tests/messaging/matrix-events-adapter.test.js`
- `command-words.js` ← `tests/messaging/bare-command-routing.test.js` · `tests/messaging/command-words.test.js`
- `discord-channel.service.js` ← `tests/messaging/channel-driver-parity.test.js` · `tests/messaging/discord-channel-service.test.js` · `tests/messaging/discord-events-adapter.test.js` · `tests/quiz/video-quiz-discord-long-options.test.js` · `tests/routes/discord-flow-registry.test.js`
- `discord-connection.js` ← `tests/messaging/discord-connection.test.js`
- `discord-modal-flow.js` ← `tests/messaging/discord-modal-flow.test.js`
- `endpoint-text-flow.js` ← `tests/messaging/endpoint-text-flow.test.js`
- `index.js` ← `tests/messaging/channel-driver-index.test.js` · `tests/messaging/channel-driver-none.test.js` · `tests/messaging/channel-switch-off.test.js`
- `job-typing.js` ← `tests/messaging/matrix-job-typing.test.js`
- `matrix-channel.service.js` ← `tests/messaging/channel-driver-parity.test.js` · `tests/messaging/matrix-channel-service.test.js` · `tests/messaging/matrix-encrypted-send-guard.test.js` · `tests/messaging/matrix-events-adapter.test.js` · `tests/messaging/matrix-group-reply-room.test.js` · `tests/messaging/matrix-media-error-no-url.test.js` (+4: `python3 kg/kg.py who-reads bot/shared/services/messaging/matrix-channel.service.js`)
- `matrix-connection.js` ← `tests/messaging/matrix-account-data-serialization.test.js` · `tests/messaging/matrix-allowed-servers.test.js` · `tests/messaging/matrix-connection.test.js` · `tests/messaging/matrix-encrypted-send-guard.test.js` · `tests/messaging/matrix-outbound-relay.test.js` · `tests/messaging/matrix-reply-room.test.js`
- `matrix-identity.js` ← `tests/database/get-or-create-user-by-channel.test.js` · `tests/messaging/matrix-identity.test.js`
- `matrix-outbound-relay.js` ← `tests/messaging/channel-driver-index.test.js` · `tests/messaging/channel-driver-none.test.js` · `tests/messaging/matrix-account-data-serialization.test.js` · `tests/messaging/matrix-channel-service.test.js` · `tests/messaging/matrix-connection.test.js` · `tests/messaging/matrix-encrypted-send-guard.test.js` (+7: `python3 kg/kg.py who-reads bot/shared/services/messaging/matrix-outbound-relay.js`)
- `meta-channel.service.js` ← `tests/messaging/channel-driver-parity.test.js`
- `none-channel.service.js` ← `tests/messaging/channel-driver-parity.test.js`
- `pending-options.js` ← `tests/messaging/baileys-socket-adapter.test.js` · `tests/messaging/endpoint-text-flow.test.js` · `tests/messaging/matrix-channel-service.test.js` · `tests/messaging/pending-options.test.js` · `tests/messaging/text-flow-definitions.test.js` · `tests/messaging/text-flow.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/services/messaging/pending-options.js`)
- `slack-channel.service.js` ← `tests/messaging/channel-driver-parity.test.js`
- `slack-modal-flow.js` ← `tests/messaging/slack-modal-flow.test.js`
- `slack-web-client.js` ← `tests/messaging/slack-modal-flow.test.js` · `tests/routes/slack-flow-registry.test.js`
- `text-flow-definitions.js` ← `tests/attendance/marking-leave-and-staff.test.js` · `tests/messaging/text-flow-definitions.test.js`
- `text-flow.js` ← `tests/attendance/marking-leave-and-staff.test.js` · `tests/messaging/endpoint-text-flow.test.js` · `tests/messaging/matrix-channel-service.test.js` · `tests/messaging/text-flow-definitions.test.js` · `tests/messaging/text-flow.test.js`

## Related (all, generated)
- skills: `setup`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `bot/shared/services/CLAUDE.md`? · `docs/features/attendance.md`? · `docs/features/public-limits.md`? · `docs/onboarding/sandbox-production-design.md`?
