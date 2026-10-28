# pinokio — full index (generated)

<!-- kg:index repo=rumi-platform dir=pinokio -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `onboarding/` | GUI setup wizard server: five steps beside Rumi's console, loopback only → `onboarding/CLAUDE.md` |
| `scripts/` | Helper scripts the Pinokio launcher scripts call: Redis, ports, console wait → `scripts/CLAUDE.md` |
| `.gitignore` | (unmapped) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `README.md` | User guide for the Pinokio launcher: sidebar buttons, GUI setup wizard, what it does; current |
| `claude.js` | Pinokio script that installs Claude Code in Pinokio's npm prefix if missing and opens it in the repo |
| `doctor.js` | Pinokio script: ensures local Redis then runs `node bin/rumi.js doctor` |
| `home.html` | Start-screen page shown while the bot runs; learns the bot port from the query string and links the console |
| `icon.jpg` | (unmapped) |
| `install.js` | Pinokio Install button: installs launcher (qrcode) and bot dependencies with npm ci, falling back to install |
| `onboard.js` | Pinokio daemon that starts the GUI wizard (onboarding/server.js) on its own persisted port |
| `package.json` | Manifest for the launcher: depends only on qrcode, which draws the WhatsApp QR |
| `pair.js` | Pinokio script that runs the interactive `rumi pair` WhatsApp link in the terminal |
| `pinokio.js` | Pinokio menu definition: which buttons show given install/config/running state (placeholder-aware .env check) |
| `pinokio.json` | Pinokio app metadata: title, description, icon and website/GitHub links |
| `reset.js` | Pinokio script removing bot/node_modules to return to fresh-clone dependencies, keeping .env and session |
| `setup.js` | Pinokio script running the interactive `rumi setup` wizard with QUEUE_DRIVER=bullmq |
| `start.js` | Pinokio Start daemon: starts Redis and the bot, captures its port and prints the console URL |
| `update.js` | Pinokio Update button: git pull then dependency refresh for launcher and bot |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- `doctor.js` ← `tests/setup/doctor.test.js`?
- `setup.js` ← `bot/tests/setup.js`? · `dashboard/tests/setup.js`? · `portal/src/test/setup.ts`? · `tests/setup.js`?

## Related (all, generated)
- skills: `pinokio-launcher`?
- docs: `.claude/CLAUDE.index.md`? · `.claude/CLAUDE.md`? · `CLAUDE.md`? · `README.md`? · `bot/CLAUDE.index.md`? · `dashboard/tests/CLAUDE.index.md`? · `pinokio/CLAUDE.index.md`? · `pinokio/CLAUDE.md`? · `pinokio/README.md`? · `pinokio/onboarding/CLAUDE.index.md`? · `pinokio/onboarding/CLAUDE.md`? · `pinokio/onboarding/public/CLAUDE.md`? · `pinokio/scripts/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/setup/CLAUDE.index.md`?

## Previous notes (human, unverified — moved here from the old CLAUDE.md)
**Parent:** [../CLAUDE.md](../CLAUDE.md) · Deep knowledge: [.claude/skills/pinokio-launcher](../.claude/skills/pinokio-launcher/SKILL.md)

The 1-click Pinokio launcher for Rumi. Pinokio finds `pinokio/pinokio.js` when someone pastes this repo's
URL, clones the whole repository, and runs these scripts from this folder. Rumi's code is the repository
itself (`..`), so the launcher and the app always move together.

| Need | Go to |
|------|-------|
| The launcher scripts, the sidebar, and the rules for editing them | [.claude/skills/pinokio-launcher](../.claude/skills/pinokio-launcher/SKILL.md) |
| The GUI setup wizard | [onboarding/CLAUDE.md](onboarding/CLAUDE.md) |
| User-facing docs and the HTTP API | [README.md](README.md) |

Rules:

- **Every Rumi command runs with `path: ".."`** (or `"../bot"`), and every path the sidebar checks is `../…`.
  Scripts run from this folder, not the repository root.
- **`onboarding/bridge.js` is the only file that requires Rumi's modules.** Keep it that way: it
  feature-detects each one at boot, so a refactor elsewhere in the repo disables one wizard step instead of
  taking the wizard down. If you rename or change an export it lists, update `MODULES` there in the same PR.
