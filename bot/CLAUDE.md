# bot — The WhatsApp bot service: web entry point, workers, services, setup CLI and tests
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot kg=5e25bfc6eb3d gen=c43aec6bae13 overflow=24 rendered=2026-10-28 kg.py=1.0.0 -->

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
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `coaching_sessions` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:732:5911672a`? · `dashboard/index.js:1518:5911672a`? (+51)
- column `coaching_sessions.status` (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:734:a69ef692` · `dashboard/routes/portal.routes.js:739:a69ef692` (+27)
- table `coaching_sessions` whole row (`*`) (written by `whatsapp-bot.js`) ← read by `dashboard/database/queries.js:733:7a0c163a`? · `dashboard/routes/portal.routes.js:960:d2b02c3e`? (+13)
- … 11 more → `CLAUDE.index.md`

## Never (human)
- Do not move the .env lookup: it is anchored to the repo root, not the cwd (bot/whatsapp-bot.js:7)
- Root `npm test` does not run bot-level tests/; it runs the separate ../tests suite (package.json:10, bot/jest.config.js:23)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/characterization/differential-verification.test.js` (whatsapp-bot.js)
- `tests/characterization/legacy-baseline.test.js` (whatsapp-bot.js)
- … 5 more → `CLAUDE.index.md`

## Related (generated)
- skills: `coaching`? · `debugging`? · `digital-coach`? · `feature-tracer`? · `pinokio-launcher`? · `video-generation`? (+1)
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `README.md`? · `SECURITY.md`? · `SETUP.md`? · `TEST_READY.md`? (+72)
- … 1 more → `CLAUDE.index.md`
