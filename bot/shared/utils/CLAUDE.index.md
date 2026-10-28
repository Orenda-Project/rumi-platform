# utils — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/utils -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 2 test files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `alphabet-grid-generator.js` | Draws the 14-letter alphabet assessment grid image with node-canvas for reading assessments |
| `canvas-loader.js` | Loads native canvas and chartjs-node-canvas gracefully; reports availability instead of crashing |
| `constants.js` | Reads WhatsApp, API and path env vars into module constants at require time (~50 of them), shared bot-wide |
| `display-name.js` | displayName(user): builds a person's name from existing parts so messages never print "null" |
| `flow-type-detector.js` | detectFlowType(response_json) classifies an nfm_reply Flow submission so whatsapp-bot.js routes it |
| `html-to-pdf.js` | Playwright/Chromium engine rendering HTML to PDF or PNG (Urdu shaping); lazy browser singleton |
| `json-tex-backslashes.js` | repairBackslashes keeps TeX backslashes intact in model JSON replies; used by lp612-author and quiz passes |
| `language-cache.js` | Redis-cached user language get/set with Postgres source of truth and language lock (setUserLanguage) |
| `language-detection.js` | Detects an explicit language request or subject/grade in a message; never auto-detects from content |
| `language-detector.js` | Computes dominant language from Soniox token-level ids and decides whether to update the user's language |
| `lazy-client.js` | lazyClient builds SDK clients on first use so a missing optional key does not crash cold boot |
| `letter-name-mapping.js` | Maps letter symbols to spoken names so reading assessment matches "alif" to the stored letter |
| `logger.js` | logToFile: writes bot log lines with correlation id and pushes them to the console event ring |
| `phone-validation.js` | Validates and normalises phone numbers to E.164; rejects Meta-blocked country codes |
| `private-temp.js` | Returns collision-free temp file paths for media sends so concurrent sends never overwrite each other |
| `redact-url.js` | redactUrl keeps only host and short path hash of file URLs in logs (presigned URLs are secrets) |
| `region.js` | Resolves the deployment region (DEFAULT_REGION) and a user's region from users.region |
| `setup-validator.js` | Boot-time synchronous check of flow-related env vars; reads process.env only, never blocks |
| `structured-logger.js` | Pino structured logging with console override, Axiom HTTP batching and correlation-id helpers |
| `telemetry.js` | Opt-in daily anonymous count ping (needs RUMI_TELEMETRY=on and a deployment id) for the open-source maintainers |
| `tex-to-unicode.js` | Converts TeX maths in one_screen message bodies to readable Unicode since WhatsApp cannot typeset |
| `text-format.js` | Class-report text helpers (grade/class labels, digit normalisation) kept out of service/template to avoid a cycle |
| `tracing.js` | Lightweight Span/withSpan for operation hierarchy and duration, OpenTelemetry-like |
| `tts-preprocessor.js` | makeVoiceoverSpeakable rewrites maths/science notation into speakable text for video voiceover TTS |
| `upload-digest.js` | Records a short sha of bytes a channel driver actually uploaded from a path, to detect swapped files |
| `validators.js` | Webhook guards: test-webhook and test-number checks, 24h message age, dedup of processed ids, own-number check |
| `version-check.js` | Checks GitHub releases for a newer rumi-platform version; never throws |
| `version.js` | rumiVersion(): single source of the running version, read from bot/package.json |
| `webhook-instructions.js` | Boot banner steps for exposing a public URL and setting the Meta webhook, shown only for relevant channel drivers |
| `word-grid-generator.js` | Generates age-appropriate words with an LLM and draws the 2-column word assessment grid with canvas |

## Who reads this (all, generated)
- `alphabet-grid-generator.js` ← imported by `bot/shared/services/reading/passage-generation.service.js:28:f6a50008`
- `canvas-loader.js` ← imported by `bot/shared/services/reading/passage-generation.service.js:19:0c7a3bb1` · `bot/shared/utils/alphabet-grid-generator.js:15:8bc89b5c` · `bot/shared/utils/word-grid-generator.js:20:8bc89b5c`
- `constants.js` ← imported by `bot/console/pipeline-map.js:148:47d4b067` · `bot/gateway/adapters/whatsapp.js:23:b4e4b38e` · `bot/shared/handlers/text-message.handler.js:27:ccf4b2d5` · `bot/shared/handlers/voice-message.handler.js:18:9ab52fc1` (+44: `python3 kg/kg.py who-reads constants.js`)
- `display-name.js` ← imported by `bot/shared/services/coaching/report-generator.service.js:22:dc1f8dc1` · `bot/shared/services/reading/analysis.service.js:35:dc1f8dc1` · `bot/workers/stale-session.worker.js:28:3a8d8340`
- `flow-type-detector.js` ← imported by `bot/whatsapp-bot.js:1200:5409f3d6`
- `html-to-pdf.js` ← imported by `bot/shared/services/coaching/coaching-card/card-image.service.js:148:e9f99754` · `bot/shared/services/coaching/report-v2/hero-report.service.js:16:e9f99754` · `bot/shared/services/observe/observe-coach-card.js:179:028135b7` · `bot/shared/services/pdf-report.service.js:1247:48ea689c` (+8: `python3 kg/kg.py who-reads html-to-pdf.js`)
- `json-tex-backslashes.js` ← imported by `bot/shared/services/quiz/transcript-quiz-llm.js:25:6aa16317`
- `language-cache.js` ← imported by `bot/shared/handlers/image-message.handler.js:29:9cfbe857` · `bot/shared/handlers/testpaper-trigger.js:63:9cfbe857` · `bot/shared/handlers/text-message.handler.js:33:7832b484` · `bot/shared/handlers/voice-message.handler.js:32:7832b484` (+6: `python3 kg/kg.py who-reads language-cache.js`)
- `language-detection.js` ← imported by `bot/shared/handlers/text-message.handler.js:35:dedee3d4` · `bot/shared/handlers/voice-message.handler.js:30:77508d07`
- `language-detector.js` ← imported by `bot/shared/handlers/text-message.handler.js:32:26938c7e` · `bot/shared/handlers/voice-message.handler.js:917:26938c7e` · `bot/shared/services/coaching/transcription-processor.service.js:26:c4974a5b`
- `lazy-client.js` ← imported by `bot/shared/services/aws-textract.service.js:3:cefd900d` · `bot/shared/services/coaching/reflective-questions/llm-router.service.js:45:ce0c2ed9` · `bot/shared/services/reading/vocabulary-image.service.js:20:0f3248c3` · `bot/shared/storage/r2.js:10:cefd900d`
- `letter-name-mapping.js` ← imported by `bot/shared/services/reading/fluency.service.js:26:8cdbddc5`
- `logger.js` ← imported by `bot/gateway/adapters/slack.js:21:fb807dd5` · `bot/gateway/adapters/whatsapp.js:24:fb807dd5` · `bot/gateway/ingress-dispatcher.js:11:ec72845d` · `bot/gateway/webhook.routes.js:22:ec72845d` (+274: `python3 kg/kg.py who-reads logger.js`)
- `phone-validation.js` ← imported by `bot/shared/routes/edit-class-endpoint.js:20:75960717`
- `private-temp.js` ← imported by `bot/shared/handlers/voice-message.handler.js:17:18ed7c80` · `bot/shared/services/attendance-register-delivery.service.js:18:18ed7c80` · `bot/shared/services/audio.service.js:17:18ed7c80` · `bot/shared/services/coaching/report-generator.service.js:33:43fd1c80` (+14: `python3 kg/kg.py who-reads private-temp.js`)
- `redact-url.js` ← imported by `bot/shared/handlers/exam-checker.handler.js:14:8f6a3ee5` · `bot/shared/handlers/image-message.handler.js:27:8f6a3ee5` · `bot/shared/handlers/voice-message.handler.js:16:8f6a3ee5` · `bot/shared/routes/student-videos-endpoint.js:22:8f6a3ee5` (+25: `python3 kg/kg.py who-reads redact-url.js`)
- `region.js` ← imported by `bot/shared/handlers/text-message.handler.js:22:ccc8d66f` · `bot/shared/routes/pic-lp-endpoint.js:26:342576fb` · `bot/shared/services/pic-to-lp/completion-handler.service.js:22:5883247a` · `bot/shared/services/quiz/video-quiz-share.service.js:400:5883247a` (+2: `python3 kg/kg.py who-reads region.js`)
- `setup-validator.js` ← imported by `bot/whatsapp-bot.js:2125:6cad87bc`
- `structured-logger.js` ← imported by `bot/console/routes/api.js:105:0b8a1e8e` · `bot/gateway/adapters/whatsapp.js:25:dc0b40e1` · `bot/gateway/webhook.routes.js:21:86f8bff9` · `bot/shared/handlers/exam-checker.handler.js:15:6565d9d3` (+52: `python3 kg/kg.py who-reads structured-logger.js`)
- `telemetry.js` ← imported by `bot/scripts/setup/telemetry-consent.js:98:4493c478` · `bot/whatsapp-bot.js:2145:2d4cdc11`
- `tex-to-unicode.js` ← imported by `bot/shared/services/quiz/quiz-math.js:37:9e842b49`
- `text-format.js` ← imported by `bot/shared/services/quiz/video-quiz-report.service.js:28:b6cab053` · `bot/shared/templates/video-quiz-report.template.js:30:15111072`
- `tts-preprocessor.js` ← imported by `bot/shared/services/video/video-script.service.js:8:fed97c92`
- `upload-digest.js` ← imported by `bot/shared/services/attendance-register-delivery.service.js:19:3c2e8d7f` · `bot/shared/services/messaging/baileys-channel.service.js:36:599175bb` · `bot/shared/services/messaging/discord-channel.service.js:65:599175bb` · `bot/shared/services/messaging/matrix-channel.service.js:46:599175bb` (+2: `python3 kg/kg.py who-reads upload-digest.js`)
- `validators.js` ← imported by `bot/gateway/adapters/whatsapp.js:22:630238f1` · `bot/gateway/envelope.js:77:bcbb07a1` · `bot/whatsapp-bot.js:31:d625b49d`
- `version-check.js` ← imported by `bot/whatsapp-bot.js:2135:7e4b5ef2`
- `version.js` ← imported by `bot/console/routes/pages.js:146:af1dd056` · `bot/whatsapp-bot.js:1892:02c3f8b7`
- `webhook-instructions.js` ← imported by `bot/whatsapp-bot.js:2091:468ce402`
- `word-grid-generator.js` ← imported by `bot/shared/services/reading/passage-generation.service.js:29:ab676e5c`
- column `users.preferred_language` (written by `language-cache.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/routes/quiz-flow-endpoint.js:380:2f976336` · `bot/shared/routes/settings-endpoint.js:46:f26864bf` · `bot/shared/routes/student-videos-endpoint.js:303:cd922948` (+16: `python3 kg/kg.py who-reads users.preferred_language`)
- table `users` whole row (`*`) (written by `language-cache.js`) ← read by `bot/shared/database/bot-helpers.js:18:d2b02c3e`? · `bot/shared/database/queries.js:14:77bc023b`? · `dashboard/database/queries.js:687:7a0c163a`? · `dashboard/routes/portal.routes.js:160:d2b02c3e`? (+2: `python3 kg/kg.py who-reads users`)
- table `users` (written by `language-cache.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? · `bot/scripts/observe-roster.js:80:355943ca`? · `bot/shared/database/bot-helpers.js:17:61dfd735`? (+52: `python3 kg/kg.py who-reads users`)
- env `ATTENDANCE_MARKING_FLOW_ID` read at `bot/shared/utils/constants.js:25:e080b7be` · `bot/shared/utils/setup-validator.js:34:a4121013`
- env `ATTENDANCE_SETUP_FLOW_ID` read at `bot/shared/utils/constants.js:24:84baca7c` · `bot/shared/utils/setup-validator.js:33:87532897`
- env `AXIOM_DATASET` read at `bot/shared/utils/structured-logger.js:41:5bf82b5f`
- env `AXIOM_TOKEN` read at `bot/shared/utils/structured-logger.js:42:2c93238a`
- env `COACHING_WHATSAPP_NUMBER` read at `bot/shared/utils/constants.js:54:407dffe7`
- env `CONSOLE_RING` read at `bot/shared/utils/logger.js:8:2bcd8e16` · `bot/shared/utils/structured-logger.js:503:2bcd8e16`
- env `DEFAULT_PHONE_COUNTRY_CODE` read at `bot/shared/utils/phone-validation.js:33:92bbd975`
- env `DEFAULT_REGION` read at `bot/shared/utils/region.js:15:93579612`
- env `EDIT_CLASS_FLOW_ID` read at `bot/shared/utils/constants.js:39:2fdc82e1`
- env `ELEVENLABS_API_KEY` read at `bot/shared/utils/constants.js:11:a931f25a`
- env `ELEVENLABS_VOICE_ID` read at `bot/shared/utils/constants.js:94:b42a941c`
- env `ELEVENLABS_VOICE_ID_AR` read at `bot/shared/utils/constants.js:96:73bcc96b`
- env `ELEVENLABS_VOICE_ID_BN` read at `bot/shared/utils/constants.js:102:e59880e3`
- env `ELEVENLABS_VOICE_ID_ES` read at `bot/shared/utils/constants.js:95:8b1895af`
- env `ELEVENLABS_VOICE_ID_FR` read at `bot/shared/utils/constants.js:110:07119f06`
- env `ELEVENLABS_VOICE_ID_HI` read at `bot/shared/utils/constants.js:101:9de9b8a2`
- env `ELEVENLABS_VOICE_ID_KN` read at `bot/shared/utils/constants.js:106:a7c77528`
- env `ELEVENLABS_VOICE_ID_MR` read at `bot/shared/utils/constants.js:103:c7262bee`
- env `ELEVENLABS_VOICE_ID_TA_IN` read at `bot/shared/utils/constants.js:105:8d6f2363`
- env `ELEVENLABS_VOICE_ID_TE` read at `bot/shared/utils/constants.js:104:35bea4c5`
- env `FLOW_PRIVATE_KEY` read at `bot/shared/utils/setup-validator.js:35:54aad2ef`
- env `GAMMA_API_KEY` read at `bot/shared/utils/constants.js:13:a931dea8`
- env `HOMEWORK_FLOW_ID` read at `bot/shared/utils/constants.js:36:dbf221a0`
- env `INTERNAL_API_KEY` read at `bot/shared/utils/setup-validator.js:72:e48d2058`
- env `KIE_API_KEY` read at `bot/shared/utils/constants.js:42:afc63570`
- env `KIE_API_KEY_PIC_LP` read at `bot/shared/utils/constants.js:45:45c0aeee`
- env `LISTENING_ANIMATION_MEDIA_ID` read at `bot/shared/utils/constants.js:17:a89aa0a1`
- env `LOADING_STICKER_MEDIA_ID` read at `bot/shared/utils/constants.js:15:0f6c40a8`
- env `LOG_LEVEL` read at `bot/shared/utils/structured-logger.js:267:ad70edb0`
- env `MENU_IMAGE_MEDIA_ID` read at `bot/shared/utils/constants.js:19:56e221e5`
- env `MMS_API_KEY` read at `bot/shared/utils/constants.js:85:046972d3`
- env `MMS_SERVICE_URL` read at `bot/shared/utils/constants.js:83:9080c308` · `bot/shared/utils/setup-validator.js:82:0e8d70d9`
- env `MMS_TIMEOUT_MS` read at `bot/shared/utils/constants.js:84:d93a3a6a`
- env `NODE_ENV` read at `bot/shared/utils/setup-validator.js:81:d8e24952` · `bot/shared/utils/structured-logger.js:23:f5fe5763`
- env `OPENAI_API_KEY` read at `bot/shared/utils/constants.js:14:d7d391c6`
- env `PEDAGOGICAL_ANALYSIS_MEDIA_ID` read at `bot/shared/utils/constants.js:18:5abbd29a`
- env `PHONE_NUMBER_ID` read at `bot/shared/utils/constants.js:8:c79e4792` · `bot/shared/utils/validators.js:100:4e41fbbf`
- env `PIC_LP_FLOW_ID` read at `bot/shared/utils/constants.js:49:775438b5`
- env `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` read at `bot/shared/utils/html-to-pdf.js:33:9c959316`
- env `PORT` read at `bot/shared/utils/constants.js:21:75261947`
- env `PUPPETEER_EXECUTABLE_PATH` read at `bot/shared/utils/html-to-pdf.js:34:dd69a95a`
- env `QUIZ_FLOW_ID` read at `bot/shared/utils/constants.js:51:2441e085`
- env `RAILWAY_ENVIRONMENT` read at `bot/shared/utils/structured-logger.js:23:f5fe5763`
- env `RAILWAY_SERVICE_NAME` read at `bot/shared/utils/structured-logger.js:280:2303aca6`
- env `RATE_LIMIT_MAX` read at `bot/shared/utils/constants.js:148:083e53e6`
- env `RATE_LIMIT_WINDOW_SECONDS` read at `bot/shared/utils/constants.js:149:14f7848e`
- env `READING_ASSESSMENT_FLOW_ID` read at `bot/shared/utils/setup-validator.js:32:c98d40c5`
- env `REGISTRATION_SUCCESS_STICKER_MEDIA_ID` read at `bot/shared/utils/constants.js:16:daad8d6c`
- env `REGISTRATION_VIDEO_MEDIA_ID` read at `bot/shared/utils/constants.js:67:976255f2`
- env `RUMI_CLI` read at `bot/shared/utils/logger.js:8:2bcd8e16` · `bot/shared/utils/structured-logger.js:67:32fbf399`
- env `RUMI_LOGO_R2_KEY` read at `bot/shared/utils/constants.js:47:1b8d6217`
- env `SERVICE_NAME` read at `bot/shared/utils/structured-logger.js:280:2303aca6`
- env `SETTINGS_FLOW_ID` read at `bot/shared/utils/constants.js:27:34dda61d`
- env `SONIOX_API_KEY` read at `bot/shared/utils/constants.js:10:6a29fde5`
- env `STATUS_FLOW_ID` read at `bot/shared/utils/constants.js:30:66cea4be`
- env `STUDENT_VIDEOS_FLOW_ID` read at `bot/shared/utils/constants.js:33:c4b23c5c`
- env `UPLIFT_API_KEY` read at `bot/shared/utils/constants.js:12:f6869902`
- env `UPLIFT_VOICE_ID_BAL` read at `bot/shared/utils/constants.js:91:2101e7e3`
- env `UPLIFT_VOICE_ID_SD` read at `bot/shared/utils/constants.js:90:95c6bcde`
- env `UPLIFT_VOICE_ID_UR` read at `bot/shared/utils/constants.js:89:28f612ae`
- env `WABA_ID` read at `bot/shared/utils/constants.js:20:601afc5a`
- env `WEBHOOK_VERIFY_TOKEN` read at `bot/shared/utils/constants.js:9:e44131aa`
- env `WHATSAPP_TOKEN` read at `bot/shared/utils/constants.js:7:60bafac2`

## Tests (all, generated)
- `constants.js` ← `tests/attendance/register-delivery-temp-race.test.js` · `tests/gateway/differential.test.js` · `tests/language/french-language.test.js` · `tests/language/indian-languages.test.js` · `tests/observe/observe-card-temp.test.js` · `tests/setup/config-overrides.test.js` (+1: `python3 kg/kg.py who-reads bot/shared/utils/constants.js`)
- `display-name.js` ← `tests/registration/name-capture.test.js`
- `flow-type-detector.js` ← `tests/messaging/text-flow-definitions.test.js` · `tests/registration/flow-type-detector.test.js`
- `html-to-pdf.js` ← `tests/quiz/plan-quiz-pdf.test.js` · `tests/quiz/teacher-pdf-footer.test.js` · `tests/quiz/transcript-quiz-figure-frame.test.js` · `tests/quiz/transcript-quiz-figure-generate.test.js` · `tests/quiz/transcript-quiz-figure.test.js` · `tests/quiz/transcript-quiz-generate.test.js` (+6: `python3 kg/kg.py who-reads bot/shared/utils/html-to-pdf.js`)
- `language-detector.js` ← `tests/language/french-language.test.js`
- `logger.js` ← `bot/tests/unit/lesson-plan-worker.test.js` · `bot/tests/unit/logger.test.js` · `tests/attendance/register-delivery-temp-race.test.js` · `tests/coaching/fidelity/diarization-contract.test.js` · `tests/coaching/own-coaching-missing-column.test.js` · `tests/coaching/report-pdf-url-not-logged.test.js` (+26: `python3 kg/kg.py who-reads bot/shared/utils/logger.js`)
- `phone-validation.js` ← `tests/edit-class/edit-class-flow.test.js`
- `private-temp.js` ← `tests/unit/private-temp.test.js`
- `redact-url.js` ← `tests/unit/redact-url.test.js`
- `region.js` ← `tests/language/indian-languages.test.js` · `tests/region/region-features.test.js`
- `setup-validator.js` ← `tests/setup/security.test.js` · `tests/setup/setup-validator.test.js`
- `structured-logger.js` ← `bot/tests/unit/logger.test.js` · `bot/tests/unit/structured-logger.test.js` · `bot/tests/unit/tracing.test.js` · `tests/gateway/gateway-queue-integration.test.js` · `tests/quiz/plan-quiz-digest.test.js` · `tests/quiz/plan-quiz-failure-reasons.test.js` (+29: `python3 kg/kg.py who-reads bot/shared/utils/structured-logger.js`)
- `telemetry.js` ← `tests/telemetry/telemetry-consent.test.js` · `tests/telemetry/telemetry.test.js`
- `tracing.js` ← `bot/tests/unit/tracing.test.js`
- `upload-digest.js` ← `tests/messaging/matrix-channel-service.test.js` · `tests/unit/upload-digest.test.js`
- `validators.js` ← `tests/gateway/differential.test.js` · `tests/gateway/empirical-adversarial-challenger.test.js` · `tests/gateway/iteration2-empirical-adversarial-verification.test.js`
- `version-check.js` ← `tests/setup/version-check.test.js`
- `version.js` ← `tests/setup/version-single-source.test.js`
- `webhook-instructions.js` ← `tests/setup/webhook-instructions.test.js`

## Related (all, generated)
- skills: `debugging`? · `logging`? · `whatsapp-flows`?
- docs: `CHANGELOG.md`? · `SETUP.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.md`? · `bot/tests/unit/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/architecture.md`? · `docs/console.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/test-papers.md`? · `tests/attendance/CLAUDE.index.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/edit-class/CLAUDE.md`? · `tests/gateway/CLAUDE.index.md`? · `tests/language/CLAUDE.md`? · `tests/messaging/CLAUDE.index.md`? · `tests/observe/CLAUDE.index.md`? · `tests/quiz/CLAUDE.index.md`? · `tests/region/CLAUDE.md`? · `tests/registration/CLAUDE.md`? · `tests/setup/CLAUDE.index.md`? · `tests/telemetry/CLAUDE.md`? · `tests/unit/CLAUDE.md`?
