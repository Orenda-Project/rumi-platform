# language — Tests for language enablement: French, French STT, six Indian languages

<!-- kg:meta repo=rumi-platform dir=tests/language kg=cb859c6eec70 gen=7110583dd7fb overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `french-language.test.js` — fr wired across config surfaces
- `indian-languages.test.js` — six India-market languages wired end to end
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `indian-languages.test.js` | Pins six Indian languages wired across config surfaces (text, STT, TTS, lesson plans, picker), ta-IN distinct |
| `french-language.test.js` | Pins French (fr) wired into supported languages, display labels, STT trust, TTS and lesson plans |
| `CLAUDE.md` | (unmapped) |
| `french-stt.test.js` | Pins fr in the Soniox auto-detect hints and trusted when Soniox identifies French audio |

## Who reads this (generated)
- (none)

## Never (human)
- Do not hardcode a francophone country; deployments opt in via SETTINGS_LANGUAGES (tests/language/french-language.test.js:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/pedagogy/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? (+2)
