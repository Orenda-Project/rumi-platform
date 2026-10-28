# pedagogy — Grade-band and cultural-context rules injected into lesson-plan prompts

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/pedagogy kg=285435ab57d5 gen=ca387ce38366 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `grade-calibration.service.js` — 15-axis grade band rubric rendered as a prompt block (renderCalibrationBlock)
- `lp-localization.service.js` — cultural cast, classroom, currency per region, shared by Gamma and pic-LP builders
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `lp-localization.service.js` | Single cultural-context table (character cast, classroom, currency, callouts) shared by pic-LP and Gamma LP builders |
| `CLAUDE.md` | (unmapped) |
| `grade-calibration.service.js` | Maps a grade to a 15-axis pedagogy band and renders the prompt block that tunes LP density/vocabulary by grade |

## Who reads this (generated)
- `lp-localization.service.js` ← imported by `bot/shared/services/lesson-plan-template.service.js:129:2a073fab` · `bot/shared/services/pic-to-lp/kieai-prompt-builder.service.js:169:da22a7c2`
- `grade-calibration.service.js` ← imported by `bot/shared/services/pic-to-lp/kieai-prompt-builder.service.js:386:5884598c`

## Never (human)
- The cultural-context table must live only here; pic-LP and Gamma builders must import it so the two paths cannot drift (bot/shared/services/pedagogy/lp-localization.service.js:7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/language/french-language.test.js` (lp-localization.service.js)
- `tests/language/indian-languages.test.js` (lp-localization.service.js)

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/pedagogy/CLAUDE.md`? · `tests/language/CLAUDE.md`?
