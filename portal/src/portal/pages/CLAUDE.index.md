# pages — full index (generated)

<!-- kg:index repo=rumi-platform dir=portal/src/portal/pages -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `CoachObservations.tsx` | Coach 'My observations' page: waiting, in-flight and finished observations plus the coach's teachers (GET /coach/*) |
| `CoachTeacherDetail.tsx` | One teacher on a coach's roster and the observations of them; separate messages for 403, 404 and 500 |
| `PortalCoaching.tsx` | Paged list of the teacher's coaching sessions from GET /coaching-sessions |
| `PortalCoachingAnalytics.tsx` | Coaching score-trend and goal-area ApexCharts from GET /coaching-analytics |
| `PortalCoachingDetail.tsx` | One coaching session's scores, feedback and audio from GET /coaching-session/:id |
| `PortalDashboard.tsx` | Signed-in home: greeting, stat tiles, recent lesson plans and latest coaching session with score trend |
| `PortalEmptyStates.channel.test.tsx` | Pins that empty-state copy names WhatsApp and shows a chat button only when useChatChannel allows |
| `PortalLessonPlans.tsx` | Paged, filterable (lesson plan vs presentation) list from GET /lesson-plans |
| `PortalLogin.session.test.tsx` | Pins that PortalLogin forwards an existing session to the dashboard and never flashes the form meanwhile |
| `PortalLogin.tsx` | Phone-number and password sign-in form posting to /login; redirects when already signed in |
| `PortalPasswordReset.channel.test.tsx` | Pins that reset pages say 'your chat with Rumi' rather than WhatsApp and use a fictional example number |
| `PortalPasswordReset.tsx` | Step 1 of password reset: asks for a phone number and posts /request-reset |
| `PortalPasswordResetVerify.tsx` | Step 2 of password reset: checks the code (/verify-reset-code) then sets a new password (/reset-password) |
| `PortalReadingAssessmentDetail.tsx` | One reading assessment: fluency numbers, PDF report and voice feedback from GET /reading-assessment/:id |
| `PortalReadingAssessments.tsx` | Filterable, paged reading-assessment list with stats from GET /reading-assessments |
| `PortalRoot.test.tsx` | Pins that '/' sends a signed-in user to the dashboard and a signed-out one to login, never the form first |
| `PortalRoot.tsx` | What '/' shows on the portal host or app: waits for the session check, then dashboard or login |
| `PortalSetup.tsx` | First-time password setup from the WhatsApp or messenger link token (/validate-token, /setup) |
| `PortalVideoDetail.tsx` | One generated video request: status, language, player and download from GET /video/:id |
| `PortalVideos.tsx` | Paged list of the teacher's video requests with status badges from GET /videos |

## Who reads this (all, generated)
- `CoachObservations.tsx` ← imported by `portal/src/App.tsx:28:297ba748`
- `CoachTeacherDetail.tsx` ← imported by `portal/src/App.tsx:29:f034791b`
- `PortalCoaching.tsx` ← imported by `portal/src/App.tsx:19:df2b5b36`
- `PortalCoachingAnalytics.tsx` ← imported by `portal/src/App.tsx:20:8cd8ec04`
- `PortalCoachingDetail.tsx` ← imported by `portal/src/App.tsx:21:f1399371`
- `PortalDashboard.tsx` ← imported by `portal/src/App.tsx:17:e08580b8`
- `PortalLessonPlans.tsx` ← imported by `portal/src/App.tsx:18:8272f741`
- `PortalLogin.tsx` ← imported by `portal/src/App.tsx:14:66a7a677` · `portal/src/portal/pages/PortalRoot.tsx:4:1b16e767`
- `PortalPasswordReset.tsx` ← imported by `portal/src/App.tsx:15:21b94236`
- `PortalPasswordResetVerify.tsx` ← imported by `portal/src/App.tsx:16:032cf21e`
- `PortalReadingAssessmentDetail.tsx` ← imported by `portal/src/App.tsx:23:1caacaf9`
- `PortalReadingAssessments.tsx` ← imported by `portal/src/App.tsx:22:9d79a128`
- `PortalRoot.tsx` ← imported by `portal/src/App.tsx:12:722bd32f`
- `PortalSetup.tsx` ← imported by `portal/src/App.tsx:13:0e660a8c`
- `PortalVideoDetail.tsx` ← imported by `portal/src/App.tsx:25:54b03487`
- `PortalVideos.tsx` ← imported by `portal/src/App.tsx:24:25b48bca`

## Tests (all, generated)
- `PortalCoaching.tsx` ← `portal/src/portal/pages/PortalEmptyStates.channel.test.tsx`
- `PortalLessonPlans.tsx` ← `portal/src/portal/pages/PortalEmptyStates.channel.test.tsx`
- `PortalLogin.tsx` ← `portal/src/portal/pages/PortalLogin.session.test.tsx`
- `PortalPasswordReset.tsx` ← `portal/src/portal/pages/PortalPasswordReset.channel.test.tsx`
- `PortalPasswordResetVerify.tsx` ← `portal/src/portal/pages/PortalPasswordReset.channel.test.tsx`
- `PortalRoot.tsx` ← `portal/src/portal/pages/PortalRoot.test.tsx`

## Related (all, generated)
- docs: `portal/src/portal/CLAUDE.md`? · `portal/src/portal/pages/CLAUDE.index.md`? · `portal/src/portal/pages/CLAUDE.md`?
