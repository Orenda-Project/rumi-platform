# graph — Curriculum knowledge graph: build from segments, explore offline, semantic layer

<!-- kg:meta repo=rumi-platform dir=curriculum/graph kg=90ce3067117c gen=a296a4f2a40e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `README.md` — commands and what each file builds
- `build_graph.py` — structural graph and SLO DAG builder
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `README.md` | Explains building and exploring the curriculum knowledge graph (graph.json, explorer.html, optional semantic layer) |
| `build_graph.py` | Builds the Book/Chapter/Lesson/SLO graph and derived SLO DAG from segmentation JSON; exports json/graphml/cypher |
| `semantic_slos.py` | Optional layer adding SLO similarity, equivalence and oriented prerequisite edges to the graph |
| `CLAUDE.md` | (unmapped) |
| `explorer.py` | Builds a self-contained offline HTML graph viewer from graph.json plus the vendored vis-network |
| `test_build_graph.py` | Pins build_graph on the shipped sample: lessons teach SLOs, SLOs progress per strand, SLO graph is acyclic |

## Who reads this (generated)
- `build_graph.py` ← imported by `curriculum/graph/semantic_slos.py:203:12b0d2c2` · `curriculum/graph/test_build_graph.py:11:1fa17e22`
- env read here: `NEO4J_PASSWORD` · `NEO4J_URI` · `NEO4J_USER`

## Never (human)
- Never add a CDN or network dependency to the explorer; it is offline and self-contained (explorer.py:2)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `curriculum/graph/test_build_graph.py` (build_graph.py)

## Related (generated)
- skills: `curriculum-baked-lesson-plans`?
- docs: `CHANGELOG.md`? · `curriculum/CLAUDE.md`? · `curriculum/README.md`? · `curriculum/graph/CLAUDE.md`? · `curriculum/graph/README.md`? · `curriculum/research/CLAUDE.md`? (+3)
