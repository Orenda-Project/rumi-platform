# deployment — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/scripts/deployment -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `DEPLOY_NOW.sh` | Example shell script: pushes the current branch to origin main so Railway auto-deploys |
| `PUSH_TO_PRODUCTION.sh` | Example shell script template that pushes the branch to GitHub for Railway auto-deploy |
| `README.md` | Warns that deployment scripts are original-WABA reference code with hardcoded ids clones must replace |
| `SETUP_AND_TEST.sh` | One-off shell script that installs deps and smoke-tests AWS SQS plus Railway Redis connectivity |
| `change-pin.js` | One-off: changes the WhatsApp two-step PIN via Graph API; hardcodes a PIN literal in a public repo |
| `check-recent-logs.sh` | Operator shell tool: tails Railway bot logs filtered to registration/template/flow events; needs RAILWAY_TOKEN |
| `configure-menu-command.js` | One-off: registers the /menu command in WhatsApp conversational components on the configured phone number |
| `create-carousel-template.js` | One-off: creates the services carousel message template on the WABA via Graph API |
| `get-portal-test-tokens.js` | Dev tool: mints portal invitation tokens for test users so a frontend dev can exercise setup/login |
| `get-waba-id.js` | Dev tool: looks up the WABA id from the phone number id via Graph API; read-only |
| `link-railway.sh` | Helper shell script that walks the operator through linking the Railway CLI to the bot project, run once |
| `register-commands-meta.js` | One-off: registers the slash commands that appear when users type / in WhatsApp |
| `register-phone-number.js` | One-off: registers the phone number with Cloud API using a two-step PIN |
| `resize-and-upload-sticker.js` | One-off: resizes a sticker to 512x512 and uploads it to WhatsApp for a media id |
| `send-services-list.js` | Test script: sends an interactive services list (no template approval needed) as a carousel alternative |
| `setup-aws-sqs.sh` | Shell setup: creates the FIFO coaching queue and its dead-letter queue in AWS SQS |
| `update-display-name.js` | One-off: submits a new WhatsApp display name (env WHATSAPP_DISPLAY_NAME) to Meta for review |
| `update-whatsapp-profile.js` | One-off: uploads a profile photo and updates the WhatsApp business profile fields |
| `upload-carousel-images.js` | One-off: uploads carousel service images to WhatsApp and prints their media ids |
| `upload-listening-animation.js` | One-off: uploads the 'Listening Animation' webp sticker from marketing/ to WhatsApp for a media id |
| `upload-loading-sticker.js` | One-off: uploads the loading sticker to WhatsApp so its permanent media id can go in .env |
| `upload-menu-image.js` | One-off: uploads the Rumi menu image to WhatsApp for a permanent media id |
| `upload-pedagogical-animation.js` | One-off: uploads the 'Pedagogical Analysis' webp sticker from marketing/ to WhatsApp for a media id |
| `upload-registration-success.js` | One-off: uploads the registration-success sticker to WhatsApp and prints its media id |

## Who reads this (all, generated)
- column `users.first_name` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/feature-registration.service.js:166:50676655` · `bot/shared/services/nudges/re-engage.kind.js:198:f9c1d8d9` (+12: `python3 kg/kg.py who-reads users.first_name`)
- column `users.last_name` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `bot/shared/services/quiz/quiz-delivery.service.js:50:845e6b11` (+5: `python3 kg/kg.py who-reads users.last_name`)
- column `users.phone_number` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` · `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/database/bot-helpers.js:19:6b9ae1f2` (+31: `python3 kg/kg.py who-reads users.phone_number`)
- column `users.portal_activated` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/routes/portal.routes.js:254:7575bd4a` · `dashboard/services/password-reset.service.js:91:0bba03e7`
- column `users.portal_invite_expires_at` (written by `get-portal-test-tokens.js`) ← read by `bot/shared/services/portal-invite.service.js:293:7575bd4a` · `dashboard/routes/portal.routes.js:254:7575bd4a`
- column `users.portal_invite_token` (written by `get-portal-test-tokens.js`) ← read by `bot/shared/services/portal-invite.service.js:294:53285ac9` · `dashboard/routes/portal.routes.js:255:53285ac9`
- column `users.portal_password_hash` (written by `get-portal-test-tokens.js`) ← read by `dashboard/routes/portal.routes.js:442:90501a4d`
- column `users.preferred_language` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/routes/quiz-flow-endpoint.js:380:2f976336` · `bot/shared/routes/settings-endpoint.js:46:f26864bf` · `bot/shared/routes/student-videos-endpoint.js:303:cd922948` (+17: `python3 kg/kg.py who-reads users.preferred_language`)
- column `users.registration_completed` (written by `get-portal-test-tokens.js`) ← read by `bot/shared/database/queries.js:106:fef21f32` · `bot/shared/services/coaching/coaching-session.service.js:43:3e063076` · `bot/shared/services/feature-registration.service.js:166:50676655` · `bot/shared/services/limits/daily-caps.js:175:d8f97c3d` (+5: `python3 kg/kg.py who-reads users.registration_completed`)
- table `users` whole row (`*`) (written by `get-portal-test-tokens.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `bot/shared/utils/telemetry.js:74:7a0c163a`? · `dashboard/database/queries.js:687:7a0c163a`? (+2: `python3 kg/kg.py who-reads users`)
- table `users` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+52: `python3 kg/kg.py who-reads users`)
- env `AWS_REGION` read at `bot/scripts/deployment/setup-aws-sqs.sh:12:d3d926e2`
- env `BOT_NAME` read at `bot/scripts/deployment/register-phone-number.js:17:1235cf6f`
- env `GRAPH_API_VERSION` read at `bot/scripts/deployment/configure-menu-command.js:13:ddcada1f` · `bot/scripts/deployment/resize-and-upload-sticker.js:20:ddcada1f` · `bot/scripts/deployment/upload-listening-animation.js:9:ddcada1f` · `bot/scripts/deployment/upload-loading-sticker.js:18:ddcada1f` · `bot/scripts/deployment/upload-menu-image.js:13:ddcada1f` · `bot/scripts/deployment/upload-pedagogical-animation.js:9:ddcada1f` · `bot/scripts/deployment/upload-registration-success.js:14:ddcada1f`
- env `MENU_IMAGE_MEDIA_ID` read at `bot/scripts/deployment/upload-menu-image.js:52:2c45e724`
- env `PHONE_NUMBER_ID` read at `bot/scripts/deployment/change-pin.js:5:c79e4792` · `bot/scripts/deployment/configure-menu-command.js:11:c79e4792` · `bot/scripts/deployment/create-carousel-template.js:13:c79e4792` · `bot/scripts/deployment/get-waba-id.js:5:c79e4792` · `bot/scripts/deployment/register-commands-meta.js:19:c79e4792` · `bot/scripts/deployment/register-phone-number.js:5:c79e4792` · `bot/scripts/deployment/resize-and-upload-sticker.js:19:c79e4792` · `bot/scripts/deployment/send-services-list.js:13:c79e4792` · `bot/scripts/deployment/update-display-name.js:12:c79e4792` · `bot/scripts/deployment/update-whatsapp-profile.js:8:c79e4792` · `bot/scripts/deployment/upload-carousel-images.js:15:c79e4792` · `bot/scripts/deployment/upload-listening-animation.js:8:c79e4792` · `bot/scripts/deployment/upload-loading-sticker.js:17:c79e4792` · `bot/scripts/deployment/upload-menu-image.js:12:35f02dca` · `bot/scripts/deployment/upload-pedagogical-animation.js:8:c79e4792` · `bot/scripts/deployment/upload-registration-success.js:13:c79e4792`
- env `PORTAL_URL` read at `bot/scripts/deployment/get-portal-test-tokens.js:98:2e403234`
- env `RAILWAY_SERVICE` read at `bot/scripts/deployment/check-recent-logs.sh:9:1597e566`
- env `RAILWAY_TOKEN` read at `bot/scripts/deployment/check-recent-logs.sh:8:d9dea95f`
- env `REDIS_URL` read at `bot/scripts/deployment/SETUP_AND_TEST.sh:47:9d583e6e`
- env `SUPPORT_EMAIL` read at `bot/scripts/deployment/update-whatsapp-profile.js:102:0e9719ac`
- env `TEST_PHONE_NUMBER` read at `bot/scripts/deployment/send-services-list.js:14:ce427c5e`
- env `WABA_ID` read at `bot/scripts/deployment/create-carousel-template.js:12:601afc5a` · `bot/scripts/deployment/update-whatsapp-profile.js:9:a4122f6a`
- env `WHATSAPP_2FA_PIN` read at `bot/scripts/deployment/register-phone-number.js:11:5f630fa0`
- env `WHATSAPP_DISPLAY_NAME` read at `bot/scripts/deployment/update-display-name.js:16:da6eb135`
- env `WHATSAPP_TOKEN` read at `bot/scripts/deployment/change-pin.js:4:60bafac2` · `bot/scripts/deployment/configure-menu-command.js:12:60bafac2` · `bot/scripts/deployment/create-carousel-template.js:11:60bafac2` · `bot/scripts/deployment/get-waba-id.js:4:60bafac2` · `bot/scripts/deployment/register-commands-meta.js:20:babb0b93` · `bot/scripts/deployment/register-phone-number.js:4:60bafac2` · `bot/scripts/deployment/resize-and-upload-sticker.js:18:60bafac2` · `bot/scripts/deployment/send-services-list.js:12:60bafac2` · `bot/scripts/deployment/update-display-name.js:11:60bafac2` · `bot/scripts/deployment/update-whatsapp-profile.js:7:60bafac2` · `bot/scripts/deployment/upload-carousel-images.js:14:60bafac2` · `bot/scripts/deployment/upload-listening-animation.js:7:60bafac2` · `bot/scripts/deployment/upload-loading-sticker.js:16:60bafac2` · `bot/scripts/deployment/upload-menu-image.js:12:35f02dca` · `bot/scripts/deployment/upload-pedagogical-animation.js:7:60bafac2` · `bot/scripts/deployment/upload-registration-success.js:12:60bafac2`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `SETUP.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/deployment/README.md`?
