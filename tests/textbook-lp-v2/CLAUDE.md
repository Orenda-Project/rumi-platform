# textbook-lp-v2 — Tests for textbook lesson plans: ToC loading, topic matching, pre-generated lookup

<!-- kg:meta repo=rumi-platform dir=tests/textbook-lp-v2 kg=f84475f04253 gen=4200a31e4acb overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `handler-curriculum.test.js` — serves a pre-generated PDF or falls through
- `topic-matching.test.js` — typed topic to unit matching
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `lesson-plan-template.test.js` | Pins lesson-plan-template.service as the single source of framework sections and Gamma hints |
| `handler-curriculum.test.js` | Pins lesson-plan-v2 curriculum path: serve pre-generated PDF by path else page_prompt, never throws |
| `pregen-lookup.test.js` | Pins pregen-lookup: R2 keys only when a pre_generated_lps row is completed, else null |
| `toc-loading.test.js` | Pins toc-loading.service loadToc storing chapters into textbook_toc |
| `topic-matching.test.js` | Pins topic-matching.service keyword, containment and fuzzy matching of a typed topic to a unit |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? (+1)
