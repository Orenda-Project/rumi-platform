# utils — Small shared helpers: logging, language, phone, rendering, locks
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/utils kg=78432ca97e8f gen=c06c37fff0d7 overflow=144 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `logger.js` — logToFile used across the bot
- `language-cache.js` — setUserLanguage / getUserLanguage
- `lazy-client.js` — build SDK clients lazily
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 2 test files) |
| `logger.js` | logToFile: writes bot log lines with correlation id and pushes them to the console event ring |
| `structured-logger.js` | Pino structured logging with console override, Axiom HTTP batching and correlation-id helpers |
| `constants.js` | Reads WhatsApp, API and path env vars into module constants at require time (~50 of them), shared bot-wide |
| `redact-url.js` | redactUrl keeps only host and short path hash of file URLs in logs (presigned URLs are secrets) |
| `html-to-pdf.js` | Playwright/Chromium engine rendering HTML to PDF or PNG (Urdu shaping); lazy browser singleton |
| … | 25 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `logger.js` ← imported by `bot/gateway/adapters/slack.js:21:fb807dd5` · `bot/gateway/adapters/whatsapp.js:24:fb807dd5` (+276)
- `structured-logger.js` ← imported by `bot/console/routes/api.js:105:0b8a1e8e` · `bot/gateway/adapters/whatsapp.js:25:dc0b40e1` (+54)
- table `users` (written by `language-cache.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- `constants.js` ← imported by `bot/console/pipeline-map.js:148:47d4b067` · `bot/gateway/adapters/whatsapp.js:23:b4e4b38e` (+46)
- … 29 more → `CLAUDE.index.md`

## Never (human)
- SDK clients must always be created lazily so a missing optional key cannot crash boot (bot/shared/utils/lazy-client.js:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/unit/logger.test.js` (logger.js, structured-logger.js)
- `bot/tests/unit/tracing.test.js` (structured-logger.js, tracing.js)
- … 90 more → `CLAUDE.index.md`

## Related (generated)
- skills: `debugging`? · `logging`? · `whatsapp-flows`?
- docs: `CHANGELOG.md`? · `SETUP.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? (+21)
