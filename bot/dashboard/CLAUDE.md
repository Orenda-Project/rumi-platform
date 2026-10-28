# dashboard — Legacy Express admin dashboard (login, users, conversations) over Supabase

<!-- kg:meta repo=rumi-platform dir=bot/dashboard kg=3b679dc6d00f gen=e4d6b2c9b837 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `index.js` — whole app: session, bcrypt login, /dashboard, /users, conversations routes
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `views/` | Tailwind-CDN EJS pages for the legacy admin dashboard → `views/CLAUDE.md` |
| `CLAUDE.md` | (unmapped) |
| `index.js` | Express admin dashboard (login, /dashboard, /users, conversations) over Supabase with bcrypt session auth |

## Who reads this (generated)
- env read here: `ADMIN_PASSWORD_HASH` · `ADMIN_USERNAME` · `DASHBOARD_PORT` · `NODE_ENV` · `SESSION_SECRET`

## Never (human)
- Do not ship the fallback session secret: set SESSION_SECRET in production (bot/dashboard/index.js:40)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/dashboard/CLAUDE.md`? · `bot/dashboard/views/CLAUDE.md`?
- service: `dashboard`
