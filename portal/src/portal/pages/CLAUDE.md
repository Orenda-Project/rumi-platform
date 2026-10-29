# pages — One file per /portal route: login, reset, dashboard, coaching, reading, videos, observe
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=portal/src/portal/pages kg=38573cbdd68f gen=709a221fdd32 overflow=28 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `PortalDashboard.tsx` — signed-in home; shows the data-fetch pattern
- `PortalLogin.tsx` — sign-in form, forwards an existing session
- `CoachObservations.tsx` — coach view, read-only
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `PortalLogin.tsx` | Phone-number and password sign-in form posting to /login; redirects when already signed in |
| `PortalRoot.tsx` | What '/' shows on the portal host or app: waits for the session check, then dashboard or login |
| `PortalCoaching.tsx` | Paged list of the teacher's coaching sessions from GET /coaching-sessions |
| `PortalEmptyStates.channel.test.tsx` | Pins that empty-state copy names WhatsApp and shows a chat button only when useChatChannel allows |
| `PortalLessonPlans.tsx` | Paged, filterable (lesson plan vs presentation) list from GET /lesson-plans |
| `PortalLogin.session.test.tsx` | Pins that PortalLogin forwards an existing session to the dashboard and never flashes the form meanwhile |
| … | 14 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `PortalLogin.tsx` ← imported by `portal/src/App.tsx:14:66a7a677` · `portal/src/portal/pages/PortalRoot.tsx:4:1b16e767`
- `CoachObservations.tsx` ← imported by `portal/src/App.tsx:28:297ba748`
- `CoachTeacherDetail.tsx` ← imported by `portal/src/App.tsx:29:f034791b`
- `PortalCoaching.tsx` ← imported by `portal/src/App.tsx:19:df2b5b36`
- … 12 more → `CLAUDE.index.md`

## Never (human)
- A failed load must show an error state, never 'Nothing waiting' (pages/CoachObservations.tsx:17)
- The / route must wait for the session check before choosing login or dashboard (PortalRoot.test.tsx)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `portal/src/portal/pages/PortalEmptyStates.channel.test.tsx` (PortalCoaching.tsx, PortalLessonPlans.tsx)
- `portal/src/portal/pages/PortalPasswordReset.channel.test.tsx` (PortalPasswordReset.tsx, PortalPasswordResetVerify.tsx)
- … 4 more → `CLAUDE.index.md`

## Related (generated)
- docs: `portal/src/portal/CLAUDE.md`?
