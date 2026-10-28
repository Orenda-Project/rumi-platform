# console — Operator web console: setup, feature switches, pipeline and live activity
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/console kg=0506455ea9f4 gen=06ff5ebd9664 overflow=13 rendered=2026-10-28 kg.py=1.0.0 -->

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
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `env-catalog.js` | Groups the .env into labelled rows by joining setup-wizard copy with feature-availability; feeds the Setup page |
| `features.js` | Builds the Features page data: configured vs switched-off vs effective state per feature |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `env-catalog.js` ← imported by `bot/console/routes/api.js:17:3983811d` · `bot/console/routes/pages.js:16:66a578cf`
- `features.js` ← imported by `bot/console/routes/api.js:129:51a85b5e` · `bot/console/routes/pages.js:63:ef3851db`
- `index.js` ← imported by `bot/whatsapp-bot.js:84:5945be51` · `bot/console/server.js:37:d5d102af`
- `redaction.js` ← imported by `bot/console/env-catalog.js:33:20c75a3e` · `bot/console/routes/api.js:18:734b49d2`
- … 5 more → `CLAUDE.index.md`

## Never (human)
- Never send CORS headers: the per-process token's safety relies on it (bot/console/index.js:129, bot/console/auth.js:14)
- Never loosen style-src 'self': no inline style attributes, use CSS classes (bot/console/index.js:80)
- Unknown env keys must always be classified as secret (default-deny) (bot/console/redaction.js:12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/console/channel-cards.test.js` (env-catalog.js, features.js)
- `tests/console/auth-gate.test.js` (auth.js)
- … 1 more → `CLAUDE.index.md`

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/console/CLAUDE.index.md`? · `bot/console/CLAUDE.md`? · `bot/console/views/CLAUDE.md`? · `docs/CLAUDE.index.md`? (+2)
