# templates — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/templates -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `classroom-observation-report.html` | HTML template with {{placeholders}} for the classroom observation report PDF |
| `latin-runs.js` | Wraps English phrases in left-to-right isolates inside Urdu RTL HTML so mixed text reads correctly |
| `observation-report.template.js` | Builds branded observation report HTML via generateObservationReport(data) with an embedded Rumi logo |
| `quiz-brand.js` | Shared palette, font stacks and diamond/lattice motifs for quiz PDFs, reports and scorecards |
| `quiz-report.template.js` | Renders the 12-hour quiz report HTML for the teacher, converted to PDF by utils/html-to-pdf |
| `reading-report.template.js` | Reading-assessment report HTML (Urdu Nastaliq/RTL aware); rendered to PDF with Playwright |
| `transcript-quiz-teacher.template.js` | Teacher's three-page lesson-quiz PDF: what was taught, questions as the child sees them, how to send |
| `video-quiz-leaderboard.template.js` | Child's class-standing image sent with the class report, matching the scorecard style |
| `video-quiz-report.template.js` | Teacher's video-quiz class report HTML with per-language chrome, RTL and Nastaliq support |
| `video-quiz-scorecard.template.js` | Child's end-of-quiz scorecard image with embedded fonts and SVG stars (no system fonts needed) |

## Who reads this (all, generated)
- `latin-runs.js` ← imported by `bot/shared/templates/transcript-quiz-teacher.template.js:59:3e1953f3` · `bot/shared/templates/video-quiz-report.template.js:31:3e1953f3`
- `quiz-brand.js` ← imported by `bot/shared/services/quiz/quiz-picture-chrome.js:19:3235a2e9` · `bot/shared/services/quiz/transcript-quiz-card.js:35:53120112` · `bot/shared/services/quiz/video-quiz-report.service.js:43:810f2c79` · `bot/shared/templates/transcript-quiz-teacher.template.js:58:fd73ea07` (+3: `python3 kg/kg.py who-reads quiz-brand.js`)
- `quiz-report.template.js` ← imported by `bot/shared/services/quiz/quiz-report.service.js:13:621ac8f6`
- `reading-report.template.js` ← imported by `bot/shared/services/reading/report.service.js:26:961549ae`
- `transcript-quiz-teacher.template.js` ← imported by `bot/shared/services/quiz/transcript-quiz-render.js:107:922a235e`
- `video-quiz-leaderboard.template.js` ← imported by `bot/shared/services/quiz/video-quiz-report.service.js:836:4523b264`
- `video-quiz-report.template.js` ← imported by `bot/shared/services/quiz/video-quiz-report.service.js:944:0e84884f`
- `video-quiz-scorecard.template.js` ← imported by `bot/shared/services/quiz/video-quiz-scorecard.service.js:63:4a1a51ea` · `bot/shared/templates/video-quiz-leaderboard.template.js:60:de6c3e96`
- env `QUIZ_URDU_SPACING_V2` read at `bot/shared/templates/quiz-brand.js:200:e41b88a4`

## Tests (all, generated)
- `quiz-brand.js` ← `tests/quiz/plan-quiz-pdf.test.js` · `tests/quiz/teacher-artefact-type-floor.test.js` · `tests/quiz/transcript-quiz-teacher-template.test.js` · `tests/quiz/urdu-spacing-kill-switch.test.js`
- `quiz-report.template.js` ← `tests/quiz/quiz-report-template.test.js`
- `reading-report.template.js` ← `tests/reports/reading-report-template.test.js`
- `transcript-quiz-teacher.template.js` ← `tests/quiz/plan-quiz-pdf.test.js` · `tests/quiz/quiz-column-sum-katex.test.js` · `tests/quiz/quiz-equation-runs-katex.test.js` · `tests/quiz/quiz-rtl-languages.test.js` · `tests/quiz/quiz-stacked-fractions-katex.test.js` · `tests/quiz/quiz-typeset-maths-katex.test.js` (+13: `python3 kg/kg.py who-reads bot/shared/templates/transcript-quiz-teacher.template.js`)
- `video-quiz-leaderboard.template.js` ← `tests/quiz/urdu-line-spacing.test.js` · `tests/quiz/urdu-spacing-kill-switch.test.js` · `tests/quiz/video-quiz-templates-brand.test.js`
- `video-quiz-report.template.js` ← `tests/quiz/quiz-rtl-languages.test.js` · `tests/quiz/teacher-artefact-type-floor.test.js` · `tests/quiz/urdu-line-spacing.test.js` · `tests/quiz/urdu-spacing-kill-switch.test.js` · `tests/quiz/video-quiz-report-class-escape.test.js` · `tests/quiz/video-quiz-templates-brand.test.js`
- `video-quiz-scorecard.template.js` ← `tests/quiz/urdu-line-spacing.test.js` · `tests/quiz/urdu-spacing-kill-switch.test.js` · `tests/quiz/video-quiz-templates-brand.test.js`

## Related (all, generated)
- skills: `reading-assessment`?
- docs: `bot/shared/CLAUDE.md`? · `docs/customization.md`?
