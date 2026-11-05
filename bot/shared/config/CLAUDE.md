# config — Env-driven config, language data and feature gating
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/config kg=94548cbe3074 gen=e6e04ab0a728 overflow=158 rendered=2026-11-05 kg.py=1.1.0 -->

## Entry points
- `feature-availability.js` — which features are live, by env key presence
- `supabase.js` — DB client and cold-boot env gate
- `supported-languages.js` — canonical language code list
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 files: 0 test + 1 support) |
| `supabase.js` | The bot's database client, kept at this path for its ~150 importers; re-exports services/db (exits 78 on missing DB env) |
| `feature-availability.js` | Single source of which features are live: presence of env keys, channel driver resolution, operator switch overlay |
| `ux-strings.js` | Quiz fixed-copy catalogue (en/ur) plus the language clamp; resolveUx(key, {user, language, params}) renders it |
| … | 24 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `supabase.js` ← imported by `bot/scripts/attendance/link-school.js:25:50ccc192` · `bot/scripts/generate-coaching-excel.js:15:bdc9e340` (+141)
- `feature-availability.js` ← imported by `bot/console/features.js:20:9962bd10` · `bot/console/pipeline-map.js:16:32a14f1b` (+25)
- `ux-strings.js` ← imported by `bot/shared/services/lesson-plan-availability.js:16:90174631` · `bot/shared/services/quiz/providers/lp-generated.provider.js:27:25374c99` (+24)
- … 35 more → `CLAUDE.index.md`

## Never (human)
- Missing Supabase credentials must always exit with code 78 at require time (bot/shared/config/supabase.js:48)
- Feature switches may only turn a feature off, never on (bot/shared/config/feature-overrides.js:11)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/language/french-language.test.js` (gamma-languages.config.js, language-prompts.js, supported-languages.js, tts-voices.js)
- `tests/language/indian-languages.test.js` (gamma-languages.config.js, language-prompts.js, supported-languages.js, tts-voices.js)
- … 113 more → `CLAUDE.index.md`

## Related (generated)
- skills: `digital-coach`? · `setup`?
- docs: `.github/CONTRIBUTING.md`? · `AGENTS.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `docs/agent-customization.md`? (+10)
