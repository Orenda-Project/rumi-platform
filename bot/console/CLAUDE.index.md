# console — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/console -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 2 files) |
| `routes/` | → (no door; 2 files) |
| `views/` | EJS pages for the operator console screens → `views/CLAUDE.md` |
| `auth.js` | Decides console access: loopback token mode vs network password mode, host guard, bcrypt check, Redis session store |
| `env-catalog.js` | Groups the .env into labelled rows per DB_DRIVER and feature-availability, with cards for other databases; feeds Setup |
| `features.js` | Builds the Features page data: configured vs switched-off vs effective state per feature |
| `first-run.js` | (unmapped) |
| `index.js` | mountConsole(app): mounts the operator console at /console with host guard, static assets, pages and /api routers |
| `live-state.js` | (unmapped) |
| `pipeline-map.js` | Derives the listening/thinking/speaking provider chains from the real service tables for the Pipeline page |
| `redaction.js` | Console security boundary: default-deny env classification and masking of secrets, URLs and phones before display |
| `restart.js` | (unmapped) |
| `runtime.js` | Console state holder: .env file path, backup-once, probes, and the file-vs-process (restart needed) distinction |
| `server.js` | `rumi console` standalone loopback server for when the bot will not boot (Supabase exit 78 at require time) |
| `view.js` | Renders console EJS views explicitly so the host Express app's view settings are never touched |

## Who reads this (all, generated)
- `auth.js` ← imported by `bot/console/index.js:31:b9ea4add`
- `env-catalog.js` ← imported by `bot/console/routes/api.js:17:3983811d` · `bot/console/routes/pages.js:16:66a578cf`
- `features.js` ← imported by `bot/console/routes/api.js:144:51a85b5e` · `bot/console/routes/pages.js:72:3de1e96f`
- `first-run.js` ← imported by `bot/console/routes/pages.js:17:6461d651`
- `index.js` ← imported by `bot/whatsapp-bot.js:84:5945be51` · `bot/console/server.js:37:d5d102af`
- `live-state.js` ← imported by `bot/console/features.js:23:fc5d243f`
- `pipeline-map.js` ← imported by `bot/console/routes/pages.js:18:d1379d95`
- `redaction.js` ← imported by `bot/console/routes/api.js:18:734b49d2`
- `restart.js` ← imported by `bot/console/routes/api.js:19:ec78bead` · `bot/console/routes/pages.js:20:383ee18e`
- `runtime.js` ← imported by `bot/console/index.js:30:cbd97f14`
- `view.js` ← imported by `bot/console/routes/pages.js:15:d6d0dfdb`
- env `CONSOLE_BIND` read at `bot/console/server.js:29:5ca1f3b6`
- env `CONSOLE_PORT` read at `bot/console/server.js:28:88adfc4b`

## Tests (all, generated)
- `auth.js` ← `tests/console/auth-gate.test.js`
- `env-catalog.js` ← `tests/console/channel-cards.test.js` · `tests/console/first-run.test.js` · `tests/console/live-state.test.js` · `tests/console/pages-live-env.test.js` · `tests/pinokio/jacks.test.js`
- `features.js` ← `tests/console/channel-cards.test.js` · `tests/console/live-state.test.js`
- `first-run.js` ← `tests/console/first-run.test.js`
- `live-state.js` ← `tests/console/live-state.test.js`
- `redaction.js` ← `tests/console/redaction.test.js`?
- `restart.js` ← `tests/console/restart.test.js`
- `runtime.js` ← `tests/console/pages-live-env.test.js`

## Related (all, generated)
- docs: `bot/CLAUDE.md`? · `docs/console.md`? · `docs/superpowers/plans/2026-11-11-console-first-run-and-restart.md`? · `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md`?
