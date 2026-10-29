# helpers — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/quiz/helpers -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `filtering-chain.js` | Supabase query stub that applies eq/order/range filters over fixtures, for the lp_v8 offer-cohort suites |
| `g1-numbers-urdu-fixture.js` | Synthetic grade-1 Urdu numbers 0-4 lesson-plan quiz with the faults of a validator_failed case; used by two quiz tests |
| `key-verify-agree.js` | Blind-solver stub that agrees with every answer key, installed by ~24 suites to skip the extra verify model call |
| `key-verify-fixture.js` | Urdu letters-lesson quiz with two wrong answer keys, loaded by the transcript-quiz-key-verify suites |
| `language-mock.js` | Contract fakes for transcript-quiz-language and quiz language buttons, used by offer/menu/provider suites |
| `line-ink.js` | Reads a rendered page as lines of ink so urdu-line-spacing.test.js can detect Nastaliq lines that touch |
| `memory-db.js` | Supabase stub whose tables remember writes across calls and apply filters; has no importer in this repo |
| `memory-supabase.js` | Stateful in-memory Supabase for chained quiz suites (hand-off, join, answers, report), writes feed later reads |
| `no-picture-repair.js` | Disables the generate step's add-a-picture repair model call so suites do not count it among their LLM calls |
| `pdf-layout.js` | Rasterises a printed PDF with pdftoppm and reports page count and how far each page's ink reaches |
| `plan-key-check-fixture.js` | Synthetic grade-3 Urdu singular/plural lesson whose quiz keyed the planted misconception as correct |
| `proper-fraction-fixture.js` | Proper-Fraction lesson quiz with a wrong key the blind solve agreed with; used by key-truth and summary-truth tests |
| `real-katex.js` | Loads real KaTeX from bot/node_modules, or signals skip, for suites that need true maths rendering over the stub |
| `schema-db.js` | In-memory Supabase that rejects any column absent from 00_complete-schema.sql, as PostgREST would with 42703 |
| `supabase-chain.js` | Chainable Supabase query stub that records calls and replays a canned result; the common helper of ~38 quiz suites |
| `type-floor.js` | Auditor that fails teacher PDF/report type below the 18px body and 13.5px floors; used by teacher-artefact-type-floor |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `tests/quiz/CLAUDE.md`?
