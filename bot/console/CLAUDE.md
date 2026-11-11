# console — Operator web console: setup, feature switches, pipeline and live activity
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/console kg=4d525d2e6522 gen=f20cfd7c1471 overflow=23 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `index.js` — mountConsole(app) wires host guard, assets, pages and api routers at /console
- `auth.js` — local token vs network password modes; read before touching access
- `routes/api.js` — every mutating call (env set/clear/reveal, probes, feature switches)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 2 files) |
| `routes/` | → (no door; 2 files) |
| `views/` | EJS pages for the operator console screens → `views/CLAUDE.md` |
| `env-catalog.js` | Groups the .env into labelled rows per DB_DRIVER and feature-availability, with cards for other databases; feeds Setup |
| `features.js` | Builds the Features page data: configured vs switched-off vs effective state per feature |
| `restart.js` | (unmapped) |
| … | 9 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `env-catalog.js` ← imported by `bot/console/routes/api.js:17:3983811d` · `bot/console/routes/pages.js:16:66a578cf`
- `features.js` ← imported by `bot/console/routes/api.js:144:51a85b5e` · `bot/console/routes/pages.js:72:3de1e96f`
- `index.js` ← imported by `bot/whatsapp-bot.js:84:5945be51` · `bot/console/server.js:37:d5d102af`
- `restart.js` ← imported by `bot/console/routes/api.js:19:ec78bead` · `bot/console/routes/pages.js:20:383ee18e`
- … 9 more → `CLAUDE.index.md`

## Never (human)
- Never send CORS headers: the per-process token's safety relies on it (bot/console/index.js:129, bot/console/auth.js:14)
- Never loosen style-src 'self': no inline style attributes, use CSS classes (bot/console/index.js:80)
- Unknown env keys must always be classified as secret (default-deny) (bot/console/redaction.js:12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/console/live-state.test.js` (env-catalog.js, features.js, live-state.js)
- `tests/console/channel-cards.test.js` (env-catalog.js, features.js)
- … 6 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/CLAUDE.md`? · `docs/console.md`? · `docs/superpowers/plans/2026-11-11-console-first-run-and-restart.md`? · `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md`?
