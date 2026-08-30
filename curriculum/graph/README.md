# graph/ — the curriculum knowledge graph

Once you've segmented a curriculum (Stage B), turn it into a **knowledge graph**: see how lessons map
to learning outcomes, how outcomes progress, and trace any SLO back to its prerequisites.

```bash
python3 ../cli.py graph ./my-corpus          # build graph.json/.graphml/.cypher + explorer.html
# or directly:
python3 build_graph.py ./my-corpus --export ./my-corpus/graph
python3 explorer.py ./my-corpus/graph/graph.json
open ./my-corpus/graph/explorer.html         # self-contained, no network, no CDN
```

## What it builds — credential-free, zero-dependency core (`build_graph.py`)

**Nodes:** Book · Chapter · Lesson · SLO · SkillType · Bloom.
**Structural edges:** `Book-CONTAINS→Chapter-CONTAINS→Lesson`, `Lesson-TEACHES→SLO`,
`Lesson-HAS_SKILL→SkillType`, `Lesson-AT_BLOOM→Bloom`, `Lesson-PRECEDES→Lesson` (teaching order).

**The derived SLO-level DAG** (the useful part). SLOs carry no native SLO→SLO link, and a single
book-wide chain would be a straight *line* — which a curriculum is not. So we derive:
- **`SLO-PRECEDES_SLO→SLO`** — a directed sequence **within each skill strand** (number-sense,
  comprehension, geometry…), by first-introduction order. Strands fan out as parallel acyclic
  threads; follow incoming edges to trace an SLO back to its strand's first outcome.
- **`SLO-CO_TAUGHT_WITH→SLO`** — where one lesson teaches SLOs from more than one strand; these
  weave the parallel threads into one connected mesh.

Every SLO code is validated against the canonical registry (`../tools/slo_registry.py`) as it goes
in, so a grade-mismatched code is **quarantined** under a book-namespaced id instead of silently
false-merging with the real outcome that happens to share its string.

## The viewer (`explorer.py`)

A single self-contained HTML file (the vendored `vis-network`, no CDN, no network). Views: one book
(Book→Chapter→Lesson→SLO), the **SLO DAG** (per-strand progression + co-teaching), the pure SLO
sequence (trace an outcome back to its prerequisites), the Lesson→SkillType map, cross-book spiral,
and — if you've run the optional semantic layer — the prerequisite and similarity graphs. Click any
node to inspect it.

## Optional: the semantic prerequisite layer (`semantic_slos.py`)

For a **whole-curriculum** corpus (many grades, many subjects), the structural per-strand ordering is
coarse. The optional semantic layer proposes cross-grade / cross-strand prerequisite edges using
**local, credential-free embeddings** (`pip install fastembed` — ONNX, no torch, no API key). It
follows the education-KG literature faithfully (see [`../research/education_kg_methods.md`](../research/education_kg_methods.md)):
**embeddings are symmetric — they only *propose* candidate pairs; a separate orienter (grade ordering
+ Bloom complexity) *directs* them; the result is DAG-constrained** (cycle-checked). Cosine never
asserts a prerequisite direction. The one step that needs a key is the optional LLM adjudication of
same-grade/cross-strand ties (`OPENROUTER_API_KEY` from the environment — never hardcoded).

## Optional: load into Neo4j

`build_graph.py --neo4j` loads the graph into a Neo4j instance for Cypher queries. Connection details
come only from the environment (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`) — nothing is hardcoded.
Not required: the JSON export + the HTML viewer need no database.

## Run the tests

```bash
python3 test_build_graph.py     # structural graph + derived SLO DAG, acyclicity, exports
```
