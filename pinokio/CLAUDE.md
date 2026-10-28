# pinokio — One-click Pinokio launcher: install, setup, start, update scripts, GUI wizard
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=pinokio kg=6311852e1b20 gen=7505286704ac overflow=10 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `README.md` — user guide
- `pinokio.js` — menu definition
- `start.js` — starts Redis and the bot
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `onboarding/` | GUI setup wizard server: five steps beside Rumi's console, loopback only → `onboarding/CLAUDE.md` |
| `scripts/` | Helper scripts the Pinokio launcher scripts call: Redis, ports, console wait → `scripts/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `README.md` | User guide for the Pinokio launcher: sidebar buttons, GUI setup wizard, what it does; current |
| `CLAUDE.md` | (unmapped) |
| `pinokio.js` | Pinokio menu definition: which buttons show given install/config/running state (placeholder-aware .env check) |
| `claude.js` | Pinokio script that installs Claude Code in Pinokio's npm prefix if missing and opens it in the repo |
| `doctor.js` | Pinokio script: ensures local Redis then runs `node bin/rumi.js doctor` |
| `install.js` | Pinokio Install button: installs launcher (qrcode) and bot dependencies with npm ci, falling back to install |
| `onboard.js` | Pinokio daemon that starts the GUI wizard (onboarding/server.js) on its own persisted port |
| `pair.js` | Pinokio script that runs the interactive `rumi pair` WhatsApp link in the terminal |
| `reset.js` | Pinokio script removing bot/node_modules to return to fresh-clone dependencies, keeping .env and session |
| `setup.js` | Pinokio script running the interactive `rumi setup` wizard with QUEUE_DRIVER=bullmq |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Never use npm install; use npm ci: a rewritten lockfile makes git pull in update.js refuse (install.js:9-11)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/setup.js`? (setup.js)
- `dashboard/tests/setup.js`? (setup.js)
- … 3 more → `CLAUDE.index.md`

## Related (generated)
- skills: `pinokio-launcher`?
- docs: `.claude/CLAUDE.index.md`? · `.claude/CLAUDE.md`? · `CLAUDE.md`? · `README.md`? · `bot/CLAUDE.index.md`? · `dashboard/tests/CLAUDE.index.md`? (+9)
