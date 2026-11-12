# pinokio — One-click Pinokio launcher: install, setup, start, update scripts, GUI wizard
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=pinokio kg=36bde60eac06 gen=ea4996e7135b overflow=13 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `README.md` — user guide
- `pinokio.js` — menu definition
- `start.js` — starts Redis and the bot
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `onboarding/` | GUI setup wizard server: three screens beside Rumi's console, loopback only → `onboarding/CLAUDE.md` |
| `scripts/` | Helper scripts the Pinokio launcher scripts call: Redis, ports, console wait → `scripts/CLAUDE.md` |
| `README.md` | User guide for the Pinokio launcher: sidebar buttons, GUI setup wizard, what it does; current |
| `start.js` | Pinokio Start daemon: starts Redis and the bot, captures its port and prints the console URL |
| `onboard.js` | Pinokio daemon that starts the GUI wizard (onboarding/server.js) on its own persisted port |
| `pinokio.js` | Pinokio menu definition: which buttons show given install/config/running state (placeholder-aware .env check) |
| `claude.js` | Pinokio script that installs Claude Code in Pinokio's npm prefix if missing and opens it in the repo |
| `doctor.js` | Pinokio script: ensures local Redis then runs `node bin/rumi.js doctor` |
| `install.js` | Pinokio Install button: npm ci for launcher, root and bot, copies .env, prepares the built-in database's password |
| `pair.js` | Pinokio script that runs the interactive `rumi pair` WhatsApp link in the terminal |
| … | 9 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Never use npm install; use npm ci: a rewritten lockfile makes git pull in update.js refuse (install.js:9-11)
- `onboarding/bridge.js` is the only file that requires Rumi's modules; never require them from any other file here (onboarding/bridge.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/setup.js`? (setup.js)
- `dashboard/tests/setup.js`? (setup.js)
- … 4 more → `CLAUDE.index.md`

## Related (generated)
- skills: `pinokio-launcher`?
- docs: `CLAUDE.md`? · `README.md`? · `docs/console.md`? · `docs/superpowers/plans/2026-11-11-console-first-run-and-restart.md`? · `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? · `docs/superpowers/specs/2026-11-11-pinokio-onboarding-redesign.md`? (+4)
