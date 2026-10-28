# gates — Quality gates for enriched lessons: QA, v3 rubric, scoring, pass rule

<!-- kg:meta repo=rumi-platform dir=curriculum/gates kg=f53f3d3f0edb gen=46e024515349 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `production_gate.py` — the pass rule: hard QA, no check <=2, composite >=92
- `qa_checks.py` — deterministic checks on a lesson body
- `score_lp.py` — judge scoring via OpenRouter, judge pinned per batch
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `reviewer_rubric_v3.py` | Data-driven v3 lesson-plan reviewer rubric: criteria 0-9, checks with 1-4 descriptors and standard codes |
| `qa_checks.py` | Deterministic QA of an enriched lesson body: hard fails (placeholders, unsolved problems) and soft checks |
| `reviewer_prompt_v3.py` | Builds the v3 LP-reviewer system prompt from the data-driven rubric plus an editable frame |
| `test_qa_checks.py` | Pins qa_checks: hard vs soft split and that the SLO-code check resolves the validator in tools/ |
| `production_gate.py` | Production gate: a lesson passes only on hard-QA pass, no rubric check <=2, and composite >=92 (D-022) |
| `score_lp.py` | Scores one enriched LP against the v3 rubric via OpenRouter with a pinned judge model; score-only batch path |

## Who reads this (generated)
- `reviewer_rubric_v3.py` ← imported by `curriculum/gates/reviewer_prompt_v3.py:19:479879a5` · `curriculum/gates/score_lp.py:21:ed4eefe3`
- `qa_checks.py` ← imported by `curriculum/gates/test_qa_checks.py:10:594ae1d8`
- `reviewer_prompt_v3.py` ← imported by `curriculum/gates/score_lp.py:22:2388302e`
- env read here: `OPENROUTER_API_KEY`

## Never (human)
- Never lower the composite bar casually; the 92 pass rule is production_gate.py:9, :21
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `curriculum/gates/test_qa_checks.py` (qa_checks.py)

## Related (generated)
- docs: `curriculum/CLAUDE.md`? · `curriculum/gates/CLAUDE.md`? · `curriculum/method/CLAUDE.md`? · `curriculum/method/c-enrichment.md`? · `curriculum/research/CLAUDE.md`? · `curriculum/research/INDEX.md`?
