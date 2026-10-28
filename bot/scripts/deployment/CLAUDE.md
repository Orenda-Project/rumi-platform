# deployment — Reference scripts for registering and branding a WhatsApp number; ids are WABA-specific
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/scripts/deployment kg=a2e7818d6dfe gen=0454d9c2c3c4 overflow=23 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `README.md` — warns which ids are tied to the original account and must be replaced
- `check-recent-logs.sh` — Railway log tail; shows the env-token pattern to copy
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `create-carousel-template.js` | One-off: creates the services carousel message template on the WABA via Graph API |
| `register-phone-number.js` | One-off: registers the phone number with Cloud API using a two-step PIN |
| `upload*` | 6 files; most used `upload-menu-image.js`: One-off: uploads the Rumi menu image to WhatsApp for a permanent media id |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `DEPLOY_NOW.sh` | Example shell script: pushes the current branch to origin main so Railway auto-deploys |
| `PUSH_TO_PRODUCTION.sh` | Example shell script template that pushes the branch to GitHub for Railway auto-deploy |
| … | 14 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `users` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+54)
- column `users.phone_number` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10` · `bot/scripts/generate-coaching-excel.js:57:8bbdcecd` (+33)
- column `users.preferred_language` (written by `get-portal-test-tokens.js`) ← read by `bot/scripts/observe-roster.js:81:44b70a83` · `bot/shared/routes/quiz-flow-endpoint.js:380:2f976336` (+19)
- … 9 more → `CLAUDE.index.md`

## Never (human)
- Never hardcode tokens; take them from env (bot/scripts/deployment/check-recent-logs.sh:4); change-pin.js still carries a PIN literal (bot/scripts/deployment/change-pin.js:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `SETUP.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/deployment/CLAUDE.index.md`? · `bot/scripts/deployment/CLAUDE.md`? · `bot/scripts/deployment/README.md`?
