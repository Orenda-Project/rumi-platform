# components — full index (generated)

<!-- kg:index repo=rumi-platform dir=portal/src/portal/components -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `AppLinkListener.test.tsx` | Pins that appUrlOpen links navigate in-app only for own-origin /portal/ paths and the listener is cleaned up |
| `AppLinkListener.tsx` | Android only: routes a tapped portal link (appUrlOpen) to its page in the app; no-op in browsers |
| `AudioPlayer.tsx` | Audio player with play/seek/time and optional download; used for lesson and feedback recordings |
| `BackButtonHandler.test.tsx` | Pins Android back-key behaviour: close dialog, minimize from home pages, history back elsewhere |
| `BackButtonHandler.tsx` | Android only: enables the Capacitor back handler at runtime and applies back-button.cjs; no-op in browsers |
| `CoachingSessionCard.tsx` | Card for one coaching session (date, duration, score) linking to its detail; used by PortalCoaching |
| `EmptyState.tsx` | Generic empty-state block with icon, text and optional action button or link; used by portal list pages |
| `LessonPlanCard.tsx` | Card for one lesson plan or presentation with date and open/download links; used by PortalLessonPlans |
| `LoadingState.tsx` | Skeleton or spinner placeholders (card, list, table, full) shown while portal data loads |
| `ObservationRow.test.tsx` | Pins ObservationRow: Section B shown folded when present and never a percentage, band or zero |
| `ObservationRow.tsx` | One coach observation as a list row with report status and its Section B block; used by coach pages |
| `PortalLayout.tsx` | Page wrapper for signed-in pages: redirects to /portal/login when useAuth finds no session, adds the nav |
| `PortalNavigation.tsx` | Portal top nav (Dashboard, Lesson Plans, Coaching, Reading, Videos, Observations for coaches) with logout |
| `ScoreIndicator.tsx` | Coloured score badge: Strong at 80+, Good at 60+, else Focus Area; used on coaching pages |
| `SectionBBlock.tsx` | Folded block listing a lesson's moves with verdict chips (executed, substituted, partial, not done) |
| `StatCard.tsx` | Dashboard stat tile with title, value, icon and optional trend arrow |
| `VideoCard.tsx` | Card for a teacher's video request with status (pending to failed) and language; used by PortalVideos |

## Who reads this (all, generated)
- `AppLinkListener.tsx` ← imported by `portal/src/App.tsx:26:914ea212`
- `AudioPlayer.tsx` ← imported by `portal/src/portal/pages/PortalCoachingDetail.tsx:5:a4f26654` · `portal/src/portal/pages/PortalReadingAssessmentDetail.tsx:9:a4f26654`
- `BackButtonHandler.tsx` ← imported by `portal/src/App.tsx:27:16bba95a`
- `CoachingSessionCard.tsx` ← imported by `portal/src/portal/pages/PortalCoaching.tsx:5:6118e1b9`
- `EmptyState.tsx` ← imported by `portal/src/portal/pages/CoachTeacherDetail.tsx:6:c5fb14c1` · `portal/src/portal/pages/PortalCoaching.tsx:7:c5fb14c1` · `portal/src/portal/pages/PortalDashboard.tsx:13:c5fb14c1` · `portal/src/portal/pages/PortalLessonPlans.tsx:6:c5fb14c1` (+2: `python3 kg/kg.py who-reads EmptyState.tsx`)
- `LessonPlanCard.tsx` ← imported by `portal/src/portal/pages/PortalDashboard.tsx:10:b9f7ce02` · `portal/src/portal/pages/PortalLessonPlans.tsx:4:b9f7ce02`
- `LoadingState.tsx` ← imported by `portal/src/portal/pages/CoachObservations.tsx:5:63cbbcf9` · `portal/src/portal/pages/CoachTeacherDetail.tsx:5:63cbbcf9` · `portal/src/portal/pages/PortalCoaching.tsx:6:63cbbcf9` · `portal/src/portal/pages/PortalCoachingAnalytics.tsx:7:63cbbcf9` (+7: `python3 kg/kg.py who-reads LoadingState.tsx`)
- `ObservationRow.tsx` ← imported by `portal/src/portal/pages/CoachObservations.tsx:6:64cc7502` · `portal/src/portal/pages/CoachTeacherDetail.tsx:7:64cc7502`
- `PortalLayout.tsx` ← imported by `portal/src/portal/pages/CoachObservations.tsx:4:dd240fde` · `portal/src/portal/pages/CoachTeacherDetail.tsx:4:dd240fde` · `portal/src/portal/pages/PortalCoaching.tsx:4:dd240fde` · `portal/src/portal/pages/PortalCoachingAnalytics.tsx:6:dd240fde` (+7: `python3 kg/kg.py who-reads PortalLayout.tsx`)
- `PortalNavigation.tsx` ← imported by `portal/src/portal/components/PortalLayout.tsx:4:6bdd7e4c`
- `ScoreIndicator.tsx` ← imported by `portal/src/portal/pages/PortalCoachingDetail.tsx:6:6bc5406c` · `portal/src/portal/pages/PortalDashboard.tsx:11:6bc5406c` · `portal/src/portal/components/CoachingSessionCard.tsx:5:b686648a`
- `SectionBBlock.tsx` ← imported by `portal/src/portal/components/ObservationRow.tsx:3:e4e01dcc`
- `StatCard.tsx` ← imported by `portal/src/portal/pages/PortalDashboard.tsx:9:a854d5cb`

## Tests (all, generated)
- `AppLinkListener.tsx` ← `portal/src/portal/components/AppLinkListener.test.tsx`
- `BackButtonHandler.tsx` ← `portal/src/portal/components/BackButtonHandler.test.tsx`
- `ObservationRow.tsx` ← `portal/src/portal/components/ObservationRow.test.tsx`

## Related (all, generated)
- docs: `portal/src/portal/CLAUDE.md`?
