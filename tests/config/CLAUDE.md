# config — Tests for deployment config readers: Discord regions, quiz languages, school clock

<!-- kg:meta repo=rumi-platform dir=tests/config kg=144ce1e483f6 gen=40b3114e2050 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `school-clock.test.js` — SCHOOL_TIMEZONE and QUIET_HOURS read per call
- `quiz-languages.test.js` — QUIZ_LANGUAGES parsing
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `discord-country-regions.test.js` | Pins Discord country-region buckets staying within the 25-option select cap and covering COUNTRIES_DROPDOWN once |
| `quiz-languages.test.js` | Pins QUIZ_LANGUAGES parsing: English default, ordered de-duplicated list, unknown codes dropped |
| `school-clock.test.js` | Pins the school clock reading SCHOOL_TIMEZONE and QUIET_HOURS per call, UTC fallback for bad zones |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- env read here: `QUIET_HOURS` · `QUIZ_LANGUAGES` · `SCHOOL_TIMEZONE`

## Never (human)
- Read the school clock from env on every call, never a fixed offset (tests/config/school-clock.test.js:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/config/CLAUDE.md`?
