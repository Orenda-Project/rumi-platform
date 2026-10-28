# observe — Tests for the /observe coach feature: capture, form, debrief, teacher report
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/observe kg=1316daac3bb0 gen=592c0386a7ae overflow=44 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `observe-wiring.test.js` — drives the live text and voice handlers
- `observe-teacher-report.test.js` — trust firewall for what a teacher may see
- `observe-send-stale.test.js` — send-button firewall: right teacher, right preview
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `_helpers/` | Fake Supabase client shared by the observe suites → `_helpers/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `observe-portal-coach.service.test.js` | Pins the coach's portal payload service: upcoming/waiting/finished visits and derived roster as a score-free whitelist |
| `observe-draft-form.test.js` | Pins onAnalysisReady and chat form: freeze AI draft v1 once, send first domain to coach, reconcile late plan |
| `observe-section-b-form.test.js` | Pins Section B in the coach's chat form: page-by-page plan moves, ok or verdict edits merged in one write and re-scored |
| `observe-channel-only-users.test.js` | Pins observe for Matrix/Slack/Discord users with user_channels but no phone: roster, form, report still reach them |
| `observe-organise.test.js` | Pins /observe menu and visit picker: pending work oldest first, school-teacher-brief flow, chat scheduling |
| `observe-debrief-entry.test.js` | Pins debrief entry: Debrief now/Later buttons (20-char ids), tap routing via observe-interactive, six-step guide |
| … | 44 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `OBSERVE_ENABLED` · `OBSERVE_FRAMEWORK` · `RUMI_FEATURE_OBSERVE`

## Never (human)
- A coach's classroom-length audio must never start teacher self-coaching (observe-audio-router.test.js:4)
- The teacher report never carries critique, coach feedback or scores (observe-teacher-report.test.js:5-6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? (+20)
