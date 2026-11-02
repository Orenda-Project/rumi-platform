# bot — The WhatsApp bot service: web entry point, workers, services, setup CLI and tests
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot kg=ddcf53766586 gen=36f50eaec4c4 overflow=24 rendered=2026-11-02 kg.py=1.1.0 -->

## Entry points
- `whatsapp-bot.js` — Express web entry; mounts /webhook and routes every inbound message
- `README.md` — folder architecture and the web/worker/dashboard process split
- `package.json` — start scripts per process; Procfile mirrors them
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 11 sub-dirs, each with `CLAUDE.md` | `06_MMS_Inference_Service/` · `console/` · `dashboard/` · `database/` · `fonts/` · `gateway/` · `scripts/` · `shared/` · `tests/` · `vendor/` · `workers/` |
| 4 sub-dirs without a door | `.github/` (1) · `assets/` (1) · `marketing/` (1) · `test-assets/` (4) |
| `whatsapp-bot.js` | Web entry point: Express server mounting /webhook, /health and portal endpoints, routing inbound messages to handlers |
| … | 19 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:732:5911672a`? · `dashboard/index.js:1518:5911672a`? (+51)
- column `coaching_sessions.status` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:734:a69ef692` · `dashboard/routes/portal.routes.js:739:a69ef692` (+27)
- … 15 more → `CLAUDE.index.md`

## Never (human)
- Do not move the .env lookup: it is anchored to the repo root, not the cwd (bot/whatsapp-bot.js:7)
- Root `npm test` does not run bot-level tests/; it runs the separate ../tests suite (package.json:10, bot/jest.config.js:23)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/characterization/differential-verification.test.js` (whatsapp-bot.js)
- `tests/characterization/legacy-baseline.test.js` (whatsapp-bot.js)
- … 5 more → `CLAUDE.index.md`

## Related (generated)
- skills: `pinokio-launcher`? · `video-generation`? · `whatsapp-flows`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `SECURITY.md`? · `TEST_READY.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/queue/CLAUDE.md`? (+14)
- … 1 more → `CLAUDE.index.md`
