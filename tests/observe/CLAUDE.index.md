# observe — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/observe -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `_helpers/` | Fake Supabase client shared by the observe suites → `_helpers/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `observe-audio-router.test.js` | Pins observe-audio-router: a coach's classroom-length audio never starts teacher self-coaching; parks and asks instead |
| `observe-binding.test.js` | Pins binding of parked recordings: 6h FIFO, who-is-this picker, scheduled teachers first, right teacher each |
| `observe-capture.test.js` | Pins observe-capture: a coach recording becomes a leader_observation on the coaching pipeline with OK/Cancel ack |
| `observe-card-temp.test.js` | Pins that two coach cards for one session in the same millisecond each send their own temp image, none left behind |
| `observe-channel-only-users.test.js` | Pins observe for Matrix/Slack/Discord users with user_channels but no phone: roster, form, report still reach them |
| `observe-channel.test.js` | Pins observe-channel isMetaRecipient and displayIdentity: Meta-only machinery applies only to bare WhatsApp numbers |
| `observe-coach-card.test.js` | Pins observe-coach-card HTML: value as header, no score, model text escaped, no celebration on a harmful debrief |
| `observe-coach-directory.test.js` | Pins coach-directory name matching: exact, mailbox first.last or reordered words only, never a subset or fuzzy match |
| `observe-coach-feedback.test.js` | Pins observe-coach-feedback pure layer: rubric keys, harm gate, validation and render of coach-the-coach feedback |
| `observe-command.handler.test.js` | Pins /observe command handler: feature gate, one-time onboarding persisted first, capture prompt arms awaiting_audio |
| `observe-completion-sweep.test.js` | Pins observe-completion (form + debrief + delivery all required) and the debrief-retry sweep, neither ever throws |
| `observe-debrief-entry.test.js` | Pins debrief entry: Debrief now/Later buttons (20-char ids), tap routing via observe-interactive, six-step guide |
| `observe-debrief-guide.test.js` | Pins observe-debrief-guide: six ordered steps; prompt never shows the model scores or contact details |
| `observe-debrief-sqs-worker.test.js` | Pins sqs-worker debrief hooks: observe_debrief routes to processDebriefRecording; failure never marks the session failed |
| `observe-debrief-worker.test.js` | Pins processDebriefRecording: transcribe, coach feedback, card/text fallback, deliver to coach, offer the send |
| `observe-delivery-sweeps.test.js` | Pins the untapped-invite and undelivered-report sweeps run by the stale-session worker: nudge once, give up, never chase |
| `observe-draft-form.test.js` | Pins onAnalysisReady and chat form: freeze AI draft v1 once, send first domain to coach, reconcile late plan |
| `observe-entry-wiring.test.js` | Source guard that whatsapp-bot.js dispatches observe_ buttons, lists and audio documents to observe before coaching |
| `observe-form-endpoint.test.js` | Pins observe-form-endpoint Flow data_exchange: ping, INIT prefill from draft and pack scale, per-screen edit buffering |
| `observe-form-flow-completion.test.js` | Pins completeFromFlow for the Meta form nfm_reply: clear state, ack with change count, offer debrief, dedupe redelivery |
| `observe-form-flow-json.test.js` | Pins generate-observe-flow-json: shipped observe-form-flow.json equals generator output and endpoint bindings |
| `observe-framework-pack.test.js` | Pins observe-framework pack selection via OBSERVE_FRAMEWORK: TEACH default, hots and mewaka offered, ratings clamped |
| `observe-gate.test.js` | Pins observe-gate: OBSERVE_ENABLED=true is the only switch, plus the operator console pause and /observe trigger regex |
| `observe-identity.test.js` | Pins observe-identity: wireIdentity per channel, identityForUser uses last channel else phone, batch lookup for rosters |
| `observe-language-roster.test.js` | Pins observe-language per audience (coach vs teacher) and the coach roster derived from leader_schools x school_id |
| `observe-late-plan-pick.test.js` | Pins a plan picked after analysis stopped waiting: Section B re-graded; late No-plan needs no model call |
| `observe-menu-degrade.test.js` | Pins that the /observe menu never dead-ends: missing debrief step or failing menu falls back to the capture prompt |
| `observe-organise.test.js` | Pins /observe menu and visit picker: pending work oldest first, school-teacher-brief flow, chat scheduling |
| `observe-pipeline-analysis.test.js` | Pins coaching analysis on a leader observation: observe pack, no teacher-facing steps, draft handed to the coach |
| `observe-pipeline-section-b.test.js` | Pins Section B in observation analysis: linked plan graded into lp_fidelity/section_b; no-timings skips the model call |
| `observe-pipeline-transcription.test.js` | Pins transcription of a leader observation: queues analysis directly, no progress or language switch, no R2 |
| `observe-plan.test.js` | Pins asking which lesson plan was taught: teacher-owned, never blocks capture, re-grades before form save |
| `observe-plumbing.test.js` | Pins GPT5MiniService.completeJson (JSON mode, repair) and observe job types and identities on the coaching job queue |
| `observe-portal-coach.routes.test.js` | Pins portal /api/portal/coach/* routes: 401 without session, 403 for teachers, coach sees own observations, no scores |
| `observe-portal-coach.service.test.js` | Pins the coach's portal payload service: upcoming/waiting/finished visits and derived roster as a score-free whitelist |
| `observe-roster-cli.test.js` | Pins observe-roster CLI (grant-coach, add-school, add-teacher) used to set up coaches on any channel |
| `observe-schedule.test.js` | Pins observe-schedule store (one upcoming visit per coach-school-teacher) and optional calendar invite |
| `observe-section-b-form.test.js` | Pins Section B in the coach's chat form: page-by-page plan moves, ok or verdict edits merged in one write and re-scored |
| `observe-section-b.test.js` | Pins observe-section-b: fidelity blob to reviewable pages, verdict re-scoring, named no-plan/no-timings states |
| `observe-send-gave-up.test.js` | Pins gave-up invite path: coach told to resend from /observe, portal lists it; live invites keep waiting |
| `observe-send-processor.test.js` | Pins teacher report preview/deliver worker: scoreless hero report and the trust firewall rechecked before delivery |
| `observe-send-sqs.test.js` | Pins send flow on the real SQS chain with stateful Redis: distinct coach actions queue, double taps dedupe |
| `observe-send-stale.test.js` | Pins trust firewall on send buttons: per-preview ids, Someone-else voids old previews, no cross-teacher report |
| `observe-send-wiring.test.js` | Source guard: worker runs observe_teacher_report jobs without failing the session; handles invite quick-reply tap |
| `observe-send.test.js` | Pins coach side of sending a teacher report: recipient from bound teacher, roster pick or typed number |
| `observe-state.test.js` | Pins observe-state: one Redis key per coach tracking where their observation is (awaiting_audio, form, debrief), 2h TTL |
| `observe-teacher-report.test.js` | Pins the teacher report trust firewall: no coach critique, no coach-the-coach material, no scores, enforced in code |
| `observe-who.test.js` | Pins the who-did-you-observe prompt after a bare capture: records a done visit and re-owns the session to that teacher |
| `observe-wiring.test.js` | Drives live handleTextMessage/handleVoiceMessage: /observe works; a coach's recording becomes a leader observation |

## Who reads this (all, generated)
- env `OBSERVE_ENABLED` read at `tests/observe/observe-portal-coach.service.test.js:119:a55fb489`
- env `OBSERVE_FRAMEWORK` read at `tests/observe/observe-form-flow-json.test.js:25:15ea134a` · `tests/observe/observe-framework-pack.test.js:12:4d5e96d5`
- env `RUMI_FEATURE_OBSERVE` read at `tests/observe/observe-portal-coach.service.test.js:119:a55fb489`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `CHANGELOG.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.index.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.md`? · `bot/shared/services/observe/CLAUDE.index.md`? · `bot/shared/services/observe/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `dashboard/routes/CLAUDE.index.md`? · `dashboard/routes/CLAUDE.md`? · `dashboard/services/CLAUDE.index.md`? · `dashboard/services/CLAUDE.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/observe/CLAUDE.index.md`? · `tests/observe/CLAUDE.md`? · `tests/observe/_helpers/CLAUDE.md`?
