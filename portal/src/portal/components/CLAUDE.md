# components — Building blocks for portal screens: layout, nav, cards, Android listeners
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=portal/src/portal/components kg=a80933dd7a83 gen=9c8530ba8c78 overflow=25 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `PortalLayout.tsx` — redirects signed-out users, wraps pages with the nav
- `PortalNavigation.tsx` — nav items; Observations only for coaches
- `SectionBBlock.tsx` — verdict chips shown under each observation
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `LoadingState.tsx` | Skeleton or spinner placeholders (card, list, table, full) shown while portal data loads |
| `PortalLayout.tsx` | Page wrapper for signed-in pages: redirects to /portal/login when useAuth finds no session, adds the nav |
| `EmptyState.tsx` | Generic empty-state block with icon, text and optional action button or link; used by portal list pages |
| `ObservationRow.tsx` | One coach observation as a list row with report status and its Section B block; used by coach pages |
| `ScoreIndicator.tsx` | Coloured score badge: Strong at 80+, Good at 60+, else Focus Area; used on coaching pages |
| … | 14 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `LoadingState.tsx` ← imported by `portal/src/portal/pages/CoachObservations.tsx:5:63cbbcf9` · `portal/src/portal/pages/CoachTeacherDetail.tsx:5:63cbbcf9` (+9)
- `PortalLayout.tsx` ← imported by `portal/src/portal/pages/CoachObservations.tsx:4:dd240fde` · `portal/src/portal/pages/CoachTeacherDetail.tsx:4:dd240fde` (+9)
- `EmptyState.tsx` ← imported by `portal/src/portal/pages/CoachTeacherDetail.tsx:6:c5fb14c1` · `portal/src/portal/pages/PortalCoaching.tsx:7:c5fb14c1` (+4)
- … 10 more → `CLAUDE.index.md`

## Never (human)
- Observations never show a score, percentage, band or zero (components/SectionBBlock.tsx:20-21, ObservationRow.test.tsx)
- AppLinkListener and BackButtonHandler must stay no-ops outside the Android app (their header comments)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `portal/src/portal/components/AppLinkListener.test.tsx` (AppLinkListener.tsx)
- `portal/src/portal/components/BackButtonHandler.test.tsx` (BackButtonHandler.tsx)
- … 1 more → `CLAUDE.index.md`

## Related (generated)
- docs: `portal/src/portal/CLAUDE.md`? · `portal/src/portal/components/CLAUDE.index.md`? · `portal/src/portal/components/CLAUDE.md`?
