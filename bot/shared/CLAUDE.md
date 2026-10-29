# shared — Shared bot code: handlers, routes, config, services, templates, utils
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared kg=37ad7077e73f gen=0adeb72b59d4 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `handlers/CLAUDE.md` — message routers (text, voice, image, Flow) called from whatsapp-bot.js
- `routes/CLAUDE.md` — Flow endpoints and Slack/Discord modal equivalents
- `config/CLAUDE.md` — env-driven config and feature gating
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 7 sub-dirs, each with `CLAUDE.md` | `config/` · `database/` · `handlers/` · `routes/` · `services/` · `templates/` · `utils/` |
| 6 sub-dirs without a door | `assets/` (4) · `constants/` (2) · `fonts/` (8) · `middleware/` (1) · `observability/` (1) · +1 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- observability/event-ring.js must import nothing: it sits on the hottest log path (bot/shared/observability/event-ring.js:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.md`?
