# views — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/views -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `partials/` | → (no door; 2 files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `ab-testing.ejs` | A/B test page: lists ab_tests with variants and results; rendered by GET /observability/ab-testing in index.js. |
| `admin-invitations.ejs` | Super-admin page to create, resend, revoke partner invitations with scope preview via /api/admin/invitations. |
| `admin-users.ejs` | Super-admin user table: edit access scope, deactivate, bulk-deactivate dashboard users via /api/admin/users. |
| `ama.ejs` | AMA chat UI: conversation list, streamed answers, charts; calls /observability/ama routes. |
| `api-health.ejs` | API Health page rendering per-service usage and limit cards from /observability/api/api-health. |
| `brief-screen.ejs` | Full-bleed single-panel Morning Brief page for office wall displays; refreshes itself. |
| `brief.ejs` | Morning Brief page: cover, panels with captions and dateline for the daily or weekly brief. |
| `broadcast-history.ejs` | Lists past WhatsApp broadcasts and their delivery status from broadcast_logs. |
| `broadcast.ejs` | Broadcast composer: pick audience, dry-run, submit, watch stats or cancel via /api/broadcast endpoints. |
| `byof-admin.ejs` | Super-admin screen to grant or revoke users' BYOF role via /byof/api/users/:id/byof-role. |
| `byof-new.ejs` | Form to start a new BYOF session (bug report or feature idea) via /byof/api/sessions. |
| `byof-session.ejs` | BYOF session chat with the agent, plan view, approve and link-PR actions. |
| `byof.ejs` | BYOF landing page listing the user's sessions and their status. |
| `change-password.ejs` | Form for a signed-in dashboard user to change their password (POST /observability/settings/change-password). |
| `coaching.ejs` | Coaching Sessions list with status and date filters and pagination; links to the transcript view. |
| `dashboard.ejs` | Overview page of headline stats (users, lesson plans, coaching, reading) with charts from the MV-backed stats. |
| `error.ejs` | Generic error page rendered by every route's catch block. |
| `forgot-password.ejs` | Dashboard-admin forgot-password page: request, verify code, then reset steps. |
| `funnel.ejs` | Funnel Analytics page: website visits, CTA clicks, chat starts, registrations by source. |
| `invite-user.ejs` | Form for a super admin to invite a dashboard user by email with a role (settings/invite). |
| `layout.ejs` | Minimal express-ejs-layouts wrapper: html shell, Tailwind CSS link, page title and body slot. |
| `loading-transcript.ejs` | Wait screen for a transcript being processed by the SQS worker; polls /api/transcript-status/:sessionId. |
| `login.ejs` | Admin login page for /observability. |
| `release-notes.ejs` | "What's New with Rumi" page listing release_notes entries. |
| `reset-password.ejs` | Reset-password page: enter emailed code and a new password. |
| `retention.ejs` | Retention Analysis page showing weekly cohort retention and activation tables from the retention service. |
| `schema.ejs` | Database Schema explorer page documenting tables and columns, including the A/B test tables. |
| `sessions.ejs` | Session Analytics page with conversation analysis and word cloud via /api/wordcloud/words. |
| `settings.ejs` | Super-admin settings page: users table with role change, deactivate, reactivate and delete actions. |
| `setup-password.ejs` | Invitation-acceptance page where an invited dashboard user picks a username and password. |
| `transcript-enhanced.ejs` | Processed coaching transcript view: sections, speaker roles, summary, SLO mastery and climate indicators. |
| `users.ejs` | Bot users list with search, paging and an in-page conversation viewer using /api/conversations/:userId. |
| `video-detail.ejs` | Detail page for one video_requests row: pipeline status, script and playback. |
| `videos.ejs` | Video gallery of generation requests with filters and pagination. |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- `admin-invitations.ejs` ← `tests/dashboard/admin-view-escaping/admin-invitations.test.js`?
- `admin-users.ejs` ← `tests/dashboard/admin-view-escaping/admin-users.test.js`?
- `ama.ejs` ← `tests/dashboard/admin-view-escaping/ama.test.js`?
- `api-health.ejs` ← `tests/dashboard/admin-view-escaping/api-health.test.js`?
- `broadcast.ejs` ← `tests/dashboard/admin-view-escaping/broadcast.test.js`?
- `byof-session.ejs` ← `tests/dashboard/admin-view-escaping/byof-session.test.js`?
- `transcript-enhanced.ejs` ← `tests/dashboard/admin-view-escaping/transcript-enhanced.test.js`?
- `users.ejs` ← `tests/dashboard/admin-view-escaping/users.test.js`?

## Related (all, generated)
- docs: `CHANGELOG.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/views/CLAUDE.index.md`? · `dashboard/views/CLAUDE.md`? · `docs/features/CLAUDE.index.md`? · `docs/features/admin-views-security.md`? · `tests/dashboard/admin-view-escaping/CLAUDE.md`?
