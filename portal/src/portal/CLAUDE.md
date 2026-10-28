# portal — The signed-in teacher and coach portal: pages, API client, auth hook, types

<!-- kg:meta repo=rumi-platform dir=portal/src/portal kg=21856fbf1ac5 gen=ca3a2cd021df overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `services/api.ts` — axios client; endpoints for auth, portal and coach
- `hooks/useAuth.ts` — session check and login/logout
- `pages/PortalRoot.tsx` — what / renders: dashboard or login
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `components/` | Building blocks for portal screens: layout, nav, cards, Android listeners → `components/CLAUDE.md` |
| `hooks/` | → (no door; 2 files) |
| `lib/` | → (no door; 1 files) |
| `pages/` | One file per /portal route: login, reset, dashboard, coaching, reading, videos, observe → `pages/CLAUDE.md` |
| `services/` | → (no door; 1 files) |
| `types/` | → (no door; 2 files) |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- The API client must send cookies; the session is a cookie (services/api.ts:15)
- login() must report failure when no session cookie was kept (hooks/useAuth.ts:39, useAuth.session.test.tsx)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `portal/src/CLAUDE.md`? · `portal/src/portal/components/CLAUDE.index.md`? · `portal/src/portal/components/CLAUDE.md`? · `portal/src/portal/pages/CLAUDE.index.md`? · `portal/src/portal/pages/CLAUDE.md`?
