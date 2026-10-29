# templates — HTML and image templates for PDFs, reports and quiz cards
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/templates kg=81291ededf3a gen=9e8f7aa75660 overflow=31 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `quiz-brand.js` — palette and fonts shared by quiz artefacts
- `video-quiz-report.template.js` — teacher class report
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `transcript-quiz-teacher.template.js` | Teacher's three-page lesson-quiz PDF: what was taught, questions as the child sees them, how to send |
| `quiz-brand.js` | Shared palette, font stacks and diamond/lattice motifs for quiz PDFs, reports and scorecards |
| `video*` | 3 files; most used `video-quiz-report.template.js`: Teacher's video-quiz class report HTML with per-language chrome, RTL and Nastaliq support |
| `latin-runs.js` | Wraps English phrases in left-to-right isolates inside Urdu RTL HTML so mixed text reads correctly |
| … | 6 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `quiz-brand.js` ← imported by `bot/shared/services/quiz/quiz-picture-chrome.js:19:3235a2e9` · `bot/shared/services/quiz/transcript-quiz-card.js:35:53120112` (+5)
- `latin-runs.js` ← imported by `bot/shared/templates/transcript-quiz-teacher.template.js:59:3e1953f3` · `bot/shared/templates/video-quiz-report.template.js:31:3e1953f3`
- `video-quiz-scorecard.template.js` ← imported by `bot/shared/services/quiz/video-quiz-scorecard.service.js:63:4a1a51ea` · `bot/shared/templates/video-quiz-leaderboard.template.js:60:de6c3e96`
- … 6 more → `CLAUDE.index.md`

## Never (human)
- Every font must be embedded as base64: renders run headless, no system fonts (video-quiz-scorecard.template.js:7-9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/quiz/urdu-spacing-kill-switch.test.js` (quiz-brand.js, transcript-quiz-teacher.template.js, video-quiz-leaderboard.template.js, video-quiz-report.template.js, video-quiz-scorecard.template.js)
- `tests/quiz/urdu-line-spacing.test.js` (transcript-quiz-teacher.template.js, video-quiz-leaderboard.template.js, video-quiz-report.template.js, video-quiz-scorecard.template.js)
- … 21 more → `CLAUDE.index.md`

## Related (generated)
- skills: `reading-assessment`?
- docs: `bot/shared/CLAUDE.md`? · `docs/customization.md`?
