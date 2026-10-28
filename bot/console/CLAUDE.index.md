# console — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/console -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 2 files) |
| `routes/` | → (no door; 2 files) |
| `views/` | EJS pages for the operator console screens → `views/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `auth.js` | Decides console access: loopback token mode vs network password mode, host guard, bcrypt check, Redis session store |
| `env-catalog.js` | Groups the .env into labelled rows by joining setup-wizard copy with feature-availability; feeds the Setup page |
| `features.js` | Builds the Features page data: configured vs switched-off vs effective state per feature |
| `index.js` | mountConsole(app): mounts the operator console at /console with host guard, static assets, pages and /api routers |
| `pipeline-map.js` | Derives the listening/thinking/speaking provider chains from the real service tables for the Pipeline page |
| `redaction.js` | Console security boundary: default-deny env classification and masking of secrets, URLs and phones before display |
| `runtime.js` | Console state holder: .env file path, backup-once, probes, and the file-vs-process (restart needed) distinction |
| `server.js` | `rumi console` standalone loopback server for when the bot will not boot (Supabase exit 78 at require time) |
| `view.js` | Renders console EJS views explicitly so the host Express app's view settings are never touched |

## Who reads this (all, generated)
- `auth.js` ← imported by `bot/console/index.js:31:b9ea4add`
- `env-catalog.js` ← imported by `bot/console/routes/api.js:17:3983811d` · `bot/console/routes/pages.js:16:66a578cf`
- `features.js` ← imported by `bot/console/routes/api.js:129:51a85b5e` · `bot/console/routes/pages.js:63:ef3851db`
- `index.js` ← imported by `bot/whatsapp-bot.js:84:5945be51` · `bot/console/server.js:37:d5d102af`
- `pipeline-map.js` ← imported by `bot/console/routes/pages.js:17:d1379d95`
- `redaction.js` ← imported by `bot/console/env-catalog.js:33:20c75a3e` · `bot/console/routes/api.js:18:734b49d2`
- `runtime.js` ← imported by `bot/console/index.js:30:cbd97f14`
- `view.js` ← imported by `bot/console/routes/pages.js:15:d6d0dfdb`
- env `CONSOLE_BIND` read at `bot/console/server.js:29:5ca1f3b6`
- env `CONSOLE_PORT` read at `bot/console/server.js:28:88adfc4b`

## Tests (all, generated)
- `auth.js` ← `tests/console/auth-gate.test.js`
- `env-catalog.js` ← `tests/console/channel-cards.test.js`
- `features.js` ← `tests/console/channel-cards.test.js`
- `redaction.js` ← `tests/console/redaction.test.js`?

## Related (all, generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/console/CLAUDE.index.md`? · `bot/console/CLAUDE.md`? · `bot/console/views/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/console.md`? · `tests/console/CLAUDE.md`?
