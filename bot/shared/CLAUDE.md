# shared — Shared bot code: handlers, routes, config, services, templates, utils

<!-- kg:meta repo=rumi-platform dir=bot/shared kg=37ad7077e73f gen=b29ad0867764 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `handlers/CLAUDE.md` — message routers (text, voice, image, Flow) called from whatsapp-bot.js
- `routes/CLAUDE.md` — Flow endpoints and Slack/Discord modal equivalents
- `config/CLAUDE.md` — env-driven config and feature gating
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 7 sub-dirs, each with `CLAUDE.md` | `config/` · `database/` · `handlers/` · `routes/` · `services/` · `templates/` · `utils/` |
| 6 sub-dirs without a door | `assets/` (4) · `constants/` (2) · `fonts/` (8) · `middleware/` (1) · `observability/` (1) · `storage/` (1) |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- observability/event-ring.js must import nothing: it sits on the hottest log path (bot/shared/observability/event-ring.js:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.md`? · `bot/shared/database/CLAUDE.index.md`? · `bot/shared/database/CLAUDE.md`? (+9)
