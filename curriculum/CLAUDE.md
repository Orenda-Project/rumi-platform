# curriculum — Textbook-to-lesson-plan pipeline (stages A-F): gates, briefs, graph, sample

<!-- kg:meta repo=rumi-platform dir=curriculum kg=38985b5a3689 gen=2d4af6099cda overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `README.md` — pipeline overview and sample walkthrough
- `cli.py` — init, check, status, graph front door
- `method/a-pagetruth.md` — start of the stage-by-stage method docs
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `briefs/` | Agent briefs for stage A (recon, page-truth), B (divide) and C (enrich) → `briefs/CLAUDE.md` |
| `gates/` | Quality gates for enriched lessons: QA, v3 rubric, scoring, pass rule → `gates/CLAUDE.md` |
| `graph/` | Curriculum knowledge graph: build from segments, explore offline, semantic layer → `graph/CLAUDE.md` |
| `method/` | Stage-by-stage method docs agents must read in full before each stage → `method/CLAUDE.md` |
| `research/` | Pedagogy research reports that justify the enrichment elements and scoring → `research/CLAUDE.md` |
| `sample/` | Runnable worked example: one textbook chapter with expected outputs per stage → `sample/CLAUDE.md` |
| `tools/` | SLO registry, segmentation validator and folder-contract scaffold, with tests → `tools/CLAUDE.md` |
| `README.md` | Explains the curriculum/ pipeline (textbook PDFs to gated lesson-plan corpus), stages A-F, CLI and sample; current |
| `test_cli.py` | Pins the curriculum CLI: init scaffolds the layout, check runs both gates and reports without raising |
| `cli.py` | Thin CLI over the pipeline: init scaffolds the A-F layout, check runs both gates, status, graph |
| `.gitignore` | (unmapped) |
| `curriculum_film_poster.png` | (unmapped) |
| `curriculum_knowledge_graph.gif` | (unmapped) |

## Who reads this (generated)
- `cli.py` ← imported by `curriculum/test_cli.py:12:6bc8d357`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `curriculum/test_cli.py` (cli.py)

## Related (generated)
- skills: `curriculum-baked-lesson-plans`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `SETUP.md`? · `bot/shared/services/CLAUDE.md`? · `brief/CLAUDE.md`? · `curriculum/README.md`? (+5)
