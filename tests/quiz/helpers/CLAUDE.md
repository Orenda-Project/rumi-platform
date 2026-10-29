# helpers — Shared stubs and fixtures for quiz suites: Supabase fakes, solver, KaTeX, PDF ink readers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/quiz/helpers kg=9da538ffe234 gen=638c1b42c855 overflow=7 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `supabase-chain.js` — the common canned-result Supabase stub, used by about 38 quiz suites
- `memory-supabase.js` — stateful fake for chained flows where one service's write feeds the next read
- `schema-db.js` — fake that rejects columns missing from 00_complete-schema.sql, as PostgREST would
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `supabase-chain.js` | Chainable Supabase query stub that records calls and replays a canned result; the common helper of ~38 quiz suites |
| `key-verify-agree.js` | Blind-solver stub that agrees with every answer key, installed by ~24 suites to skip the extra verify model call |
| `memory-supabase.js` | Stateful in-memory Supabase for chained quiz suites (hand-off, join, answers, report), writes feed later reads |
| `schema-db.js` | In-memory Supabase that rejects any column absent from 00_complete-schema.sql, as PostgREST would with 42703 |
| `language-mock.js` | Contract fakes for transcript-quiz-language and quiz language buttons, used by offer/menu/provider suites |
| `no-picture-repair.js` | Disables the generate step's add-a-picture repair model call so suites do not count it among their LLM calls |
| `plan-key-check-fixture.js` | Synthetic grade-3 Urdu singular/plural lesson whose quiz keyed the planted misconception as correct |
| `real-katex.js` | Loads real KaTeX from bot/node_modules, or signals skip, for suites that need true maths rendering over the stub |
| `key-verify-fixture.js` | Urdu letters-lesson quiz with two wrong answer keys, loaded by the transcript-quiz-key-verify suites |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Suites needing real maths rendering must use real-katex, which skips without bot deps (tests/quiz/helpers/real-katex.js:27)
- Column names in schema-checked fakes must stay in sync with the shipped schema file they read (tests/quiz/helpers/schema-db.js:25)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `tests/quiz/CLAUDE.md`?
