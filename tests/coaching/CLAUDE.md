# coaching — Tests for coaching sessions, frameworks, hero reports and reflective debrief
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/coaching kg=e048dc4f84e3 gen=fcc248719c13 overflow=20 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `framework-registry.test.js` — how frameworks (OECD, HOTS, TEACH, FICO, MEWAKA) are selected
- `report-renderer-registry.test.js` — hero renderer default and PDFKit fallback
- `fidelity/` — lesson-plan fidelity suites (own door)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `fidelity/` | Tests for lesson-plan fidelity: extract moves, grade recording, score, report → `fidelity/CLAUDE.md` |
| `report-transformers/` | → (no door; 2 tests) |
| `coaching*` | 6 files; most used `coaching-flow-integration.test.js`: Pins glue wiring photo prompt, coaching card and LP selection list into the coaching flow |
| `teacher-facing-reads-ignore-observations.test.js` | Pins chat context, /status, last-use, quiz nudge and reminders all ignoring a coach's observation rows |
| `framework-wiring.test.js` | Pins analysis-processor and coaching.service resolving the framework via selectFramework, env-driven region map |
| `report-pdf-url-not-logged.test.js` | Pins generateReport storing the public report URL on the session but never logging it or its path |
| `lp-coaching-link.test.js` | Pins the LP selection list builder, LP linking to a coaching session and framework-aware prompts |
| … | 29 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- A coach's observation row (user_id = teacher) must never feed a teacher's own trend or history (tests/coaching/coaching-trend-excludes-observations.test.js:6)
- Deliver coaching notices to recipient_identifier, never users.phone_number (tests/coaching/coaching-session-recipient-identifier.test.js:3)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/CLAUDE.md`? · `bot/shared/services/coaching/coaching-card/CLAUDE.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.md`? (+3)
