# views — EJS pages for the operator console screens

<!-- kg:meta repo=rumi-platform dir=bot/console/views kg=93dc3f5166ba gen=edcb14180dcd overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `overview.ejs` — console home and readiness banner
- `setup.ejs` — credential groups; rows come from partials/keyline.ejs
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `partials/` | Shared head, nav, foot and credential-row fragments for console pages → `partials/CLAUDE.md` |
| `activity.ejs` | Activity page: live feed of events (provider, model, timing, result) with click-to-trace; no phone numbers or content |
| `features.ejs` | Features page: running / switched-off counts and per-feature on/off switches |
| `locked.ejs` | Page shown when the console is network-reachable with no password set; explains how to set one |
| `overview.ejs` | Console home: readiness banner listing missing required settings and a deployment summary |
| `pipeline.ejs` | Pipeline page: listening, thinking, speaking layers with providers and fallbacks read from the code |
| `setup.ejs` | Setup page: every credential grouped, with what it does and where to get it, plus required-key counts |
| `system.ejs` | System page: version, uptime, channel and how to apply (restart for) saved changes |

## Who reads this (generated)
- (none)

## Never (human)
- Never use inline style attributes or inline scripts: CSP allows only self assets (bot/console/index.js:80)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `bot/tests/setup.js`? (setup.ejs)
- `dashboard/tests/setup.js`? (setup.ejs)
- `portal/src/test/setup.ts`? (setup.ejs)
- `tests/setup.js`? (setup.ejs)

## Related (generated)
- docs: `bot/console/CLAUDE.md`?
