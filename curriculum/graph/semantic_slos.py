#!/usr/bin/env python3
"""semantic_slos.py — the OPTIONAL SEMANTIC + PREREQUISITE layer of the curriculum KG.

This augments the credential-free core graph produced by `build_graph.py` with three
SLO->SLO edge types the structural pass can't see: semantic similarity, equivalence, and
oriented prerequisites. It is **optional** — the graph is fully usable without it.

Built to the literature, not to a guess (see ../research/education_kg_methods.md). The
one rule that shapes everything: **embeddings are symmetric (similarity); a
prerequisite is directional. So cosine only PROPOSES candidate pairs — a separate
orienter DIRECTS them — and the result is constrained to a DAG.**

Edges produced (all SLO->SLO), merged back into graph.json so `explorer.py` renders them:
  SIMILAR_TO {cosine}          symmetric   mutual-kNN + threshold (candidate generation)
  EQUIVALENT_TO {cosine,xling} symmetric   reciprocal-best-match, high threshold
  PREREQUISITE_OF {method,cosine} DIRECTED oriented by an ensemble of weak voters,
                                           precision-favoured, then DAG-constrained
  PREREQ_CANDIDATE {cosine}     UNORIENTED same-grade/same-complexity pairs the offline
                                           voters can't direct — for a later LLM pass

Offline / credential-free: encoding (multilingual-e5-large), SIMILAR_TO, EQUIVALENT_TO,
the grade + Bloom voters, and the DAG/eval mechanics. An LLM is needed ONLY to orient
the PREREQ_CANDIDATE tier (same-grade cross-strand) — candidate-gated, never free-form —
and that step, if you build it, reads an `OPENROUTER_API_KEY` from the environment. This
module never hardcodes a key and never calls an LLM on its own.

Dependencies:
  pip install fastembed        # credential-free ONNX embeddings (no torch, no API key)
  pip install neo4j            # only if you use --neo4j (env credentials only)

Run AFTER `build_graph.py --export <dir>` — it reads + augments that graph.json:
  python3 semantic_slos.py <graph.json | dir-with-graph.json | project_root> --embed
  python3 semantic_slos.py <graph.json> --embed --neo4j

If given a project_root (no graph.json yet), it rebuilds the graph via build_graph first.
"""
import json, os, sys, argparse
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
# Resolve sibling modules the same way build_graph.py does: build_graph is in THIS dir,
# slo_registry.py is in ../tools (build_graph pulls it in transitively when we rebuild).
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

# Credentials come from the environment — NEVER hardcode.
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = (os.environ.get("NEO4J_USER", "neo4j"), os.environ.get("NEO4J_PASSWORD", ""))

# ---------- pure, testable logic (the parts that must be right) ----------
BLOOM_ORDER = ["remember", "understand", "apply", "analyze", "evaluate", "create"]

def bloom_rank(bloom):
    """Bloom's-taxonomy complexity rank (0..5), or None if unrecognised."""
    if not bloom:
        return None
    b = str(bloom).strip().lower()
    return BLOOM_ORDER.index(b) if b in BLOOM_ORDER else None

def orient_prereq(a, b):
    """Orient ONE candidate prerequisite pair with the offline voter ensemble.
    Returns (src_id, dst_id, method) low->high, or None if no offline signal directs it
    (same grade AND same/again-unknown Bloom → a candidate for LLM adjudication).
    Voters, precision-first: (1) GRADE ordering — strong; (2) BLOOM complexity — secondary.
    Cosine/similarity deliberately plays NO role in direction."""
    ga, gb = a.get("grade"), b.get("grade")
    try:
        ia, ib = int(ga), int(gb)
    except (TypeError, ValueError):
        ia = ib = None
    if ia is not None and ib is not None and ia != ib:
        return (a["id"], b["id"], "grade") if ia < ib else (b["id"], a["id"], "grade")
    ra, rb = bloom_rank(a.get("bloom")), bloom_rank(b.get("bloom"))
    if ra is not None and rb is not None and ra != rb:
        return (a["id"], b["id"], "bloom") if ra < rb else (b["id"], a["id"], "bloom")
    return None

def mutual_knn(sim, ids, k, thr):
    """SIMILAR_TO candidate pairs: {i,j} where each is in the other's top-k neighbours
    (mutual) AND cosine >= thr. Rank-based (mutual) → robust to E5's high cosine offset."""
    import numpy as np
    n = len(ids)
    topk = []
    for i in range(n):
        order = np.argsort(-sim[i])
        nb = [j for j in order if j != i][:k]
        topk.append(set(nb))
    pairs = set()
    for i in range(n):
        for j in topk[i]:
            if i in topk[j] and sim[i][j] >= thr:
                pairs.add(frozenset((ids[i], ids[j])))
    return pairs

def break_cycles(edges):
    """Enforce a DAG by greedily keeping the HEAVIEST edges (drop the weakest edge that
    would close a cycle). edges = [(src,dst,weight)]. Returns (kept, removed)."""
    kept, removed = [], []
    succ = defaultdict(set)
    def reachable(s, t):                       # is t reachable from s along kept edges?
        seen, stack = set(), [s]
        while stack:
            x = stack.pop()
            if x == t:
                return True
            if x in seen:
                continue
            seen.add(x)
            stack.extend(succ[x])
        return False
    for src, dst, w in sorted(edges, key=lambda e: -e[2]):
        if src == dst or reachable(dst, src):  # would close a cycle → drop (it's the weakest such)
            removed.append((src, dst, w))
        else:
            kept.append((src, dst, w))
            succ[src].add(dst)
    return kept, removed

# ---------- SLO text + script derivation (offline, from graph.json) ----------
def detect_script(text):
    """Which writing system a description is in, so EQUIVALENT_TO can flag cross-lingual
    pairs. graph.json stores no explicit script, so derive it: any codepoint in the
    Arabic/Urdu Unicode ranges → 'arabic' (Nastaliq/Naskh), else 'latin'. Deliberately
    coarse — it only needs to separate the two scripts a bilingual corpus mixes, never to
    pre-translate anything (research §"What NOT to do": encode each SLO in its OWN language)."""
    for ch in text or "":
        o = ord(ch)
        if (0x0600 <= o <= 0x06FF or 0x0750 <= o <= 0x077F or
                0x08A0 <= o <= 0x08FF or 0xFB50 <= o <= 0xFDFF or 0xFE70 <= o <= 0xFEFF):
            return "arabic"
    return "latin"

def slo_text_rows(g):
    """The per-SLO rows the encoder needs, derived straight from graph.json's SLO nodes:
    id, description (encoded natively), and detected script. Replaces any pre-computed
    corpus file — the graph build_graph.py produces is the single source of truth."""
    rows = []
    for n in g["nodes"]:
        if n["label"] != "SLO":
            continue
        p = n["props"]
        desc = p.get("description") or p["id"]
        rows.append({"id": p["id"], "desc": desc, "script": detect_script(desc)})
    return rows

# ---------- graph metadata (offline, from graph.json) ----------
def load_slo_meta(g):
    """From an already-loaded graph.json: per-SLO grade, strand, suspect flag, and Bloom
    (majority Bloom of the lessons that teach it), plus the adjacent PRECEDES_SLO pairs
    (teaching-order prior)."""
    byid = {n["id"]: n for n in g["nodes"]}
    lesson_bloom = {}
    for e in g["edges"]:
        if e["rel"] == "AT_BLOOM":
            lesson_bloom[e["s"]] = byid[e["t"]]["props"]["id"]
    slo_blooms = defaultdict(list)
    for e in g["edges"]:
        if e["rel"] == "TEACHES":
            bl = lesson_bloom.get(e["s"])
            if bl:
                slo_blooms[byid[e["t"]]["props"]["id"]].append(bl)
    meta = {}
    for n in g["nodes"]:
        if n["label"] != "SLO":
            continue
        p = n["props"]
        blooms = slo_blooms.get(p["id"], [])
        meta[p["id"]] = {"id": p["id"], "grade": p.get("code_grade"),
                         "strand": p.get("strand", "?"),
                         "suspect": bool(p.get("suspect_grade_mismatch")),
                         "bloom": Counter(blooms).most_common(1)[0][0] if blooms else None}
    adj = set()
    for e in g["edges"]:
        if e["rel"] == "PRECEDES_SLO":
            adj.add(frozenset((byid[e["s"]]["props"]["id"], byid[e["t"]]["props"]["id"])))
    return meta, adj

# ---------- embedding (offline, multilingual) ----------
def embed_texts(texts, model_name="intfloat/multilingual-e5-large"):
    from fastembed import TextEmbedding
    import numpy as np
    m = TextEmbedding(model_name)
    # E5 convention: symmetric-similarity use → "query: " prefix on every text; encode
    # each SLO in its OWN language (never pre-translate — research §"What NOT to do").
    vecs = np.array(list(m.embed(["query: " + t for t in texts])))
    vecs = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
    return vecs

# ---------- graph.json resolution ----------
def resolve_graph(path):
    """Accept a graph.json, a directory that contains one, or a project_root to rebuild
    from. Returns (graph_dict, graph_json_path). Rebuilds via build_graph.py only when no
    graph.json is found under the given project_root."""
    # explicit file
    if os.path.isfile(path) and path.endswith(".json"):
        return json.load(open(path)), path
    # directory holding graph.json
    if os.path.isdir(path):
        cand = os.path.join(path, "graph.json")
        if os.path.isfile(cand):
            return json.load(open(cand)), cand
        # treat as a project_root → build + export into <path>/graph/
        import build_graph
        nodes, edges = build_graph.build(path)
        out_dir = os.path.join(path, "graph")
        p = build_graph.export(nodes, edges, out_dir,
                               corpus=os.path.basename(os.path.normpath(path)) or "curriculum")
        gj = p["json"]
        print(f"rebuilt graph via build_graph → {gj} {p['counts']}")
        return json.load(open(gj)), gj
    sys.exit(f"no graph.json found at {path!r} (pass a graph.json, a dir with one, or a project_root)")

# ---------- main build ----------
def build(graph_json, k=15, sim_thr=0.86, eq_thr=0.92, max_grade_gap=2,
          do_neo4j=False, corpus="curriculum"):
    import numpy as np
    g, gj_path = resolve_graph(graph_json)
    outdir = os.path.dirname(os.path.abspath(gj_path))

    rows = slo_text_rows(g)
    ids = [r["id"] for r in rows]
    idx = {v: i for i, v in enumerate(ids)}
    script = {r["id"]: r["script"] for r in rows}
    cache = os.path.join(outdir, "slo_vecs.npy")
    if os.path.exists(cache) and np.load(cache).shape[0] == len(rows):
        print(f"loading cached embeddings ({len(rows)} SLOs)")
        vecs = np.load(cache)
    else:
        print(f"encoding {len(rows)} SLOs with multilingual-e5-large …")
        vecs = embed_texts([r["desc"] for r in rows])
        np.save(cache, vecs)
    sim = vecs @ vecs.T
    # cosine distribution (for honest threshold calibration)
    off = sim[np.triu_indices(len(ids), 1)]
    print(f"cosine: min {off.min():.3f}  median {np.median(off):.3f}  p95 {np.percentile(off,95):.3f}  max {off.max():.3f}")

    meta, adj = load_slo_meta(g)

    # 2. SIMILAR_TO (symmetric, mutual-kNN)
    similar = mutual_knn(sim, ids, k=k, thr=sim_thr)
    # 3. EQUIVALENT_TO (reciprocal best match, high threshold)
    best = {}                                                          # nearest neighbour, self excluded
    for i in range(len(ids)):
        order = [j for j in np.argsort(-sim[i]) if j != i]
        best[i] = int(order[0]) if order else i
    equivalent = set()
    for i in range(len(ids)):
        j = best[i]
        if j != i and best.get(j) == i and sim[i][j] >= eq_thr:
            equivalent.add(frozenset((ids[i], ids[j])))
    equivalent = {p for p in equivalent if len(p) == 2}                # guard exact-duplicate collapse

    # 4+5. PREREQUISITE_OF — candidates from SIMILAR_TO ∪ adjacent PRECEDES_SLO, oriented.
    # EXCLUDE equivalent pairs: a near-identical outcome repeated at another grade is
    # *equivalence/repetition* (belongs in EQUIVALENT_TO / the spiral), NOT a prerequisite —
    # research keeps progression (directional) distinct from equivalence (symmetric).
    # Suspect (grade-unreliable) SLOs are also excluded from orientation — honest.
    cand = (set(similar) | set(adj)) - equivalent
    oriented, unoriented = [], []
    for pair in cand:
        a, b = sorted(pair)
        ma, mb = meta.get(a), meta.get(b)
        if not ma or not mb or ma["suspect"] or mb["suspect"]:
            continue
        # only keep cross-strand OR cross-grade pairs (within-strand same-grade order is
        # already the PRECEDES_SLO backbone; the semantic layer adds what order misses)
        cross = (ma["strand"] != mb["strand"]) or (ma["grade"] != mb["grade"])
        if not cross:
            continue
        try:
            if abs(int(ma["grade"]) - int(mb["grade"])) > max_grade_gap:
                continue
        except (TypeError, ValueError):
            pass
        w = float(sim[idx[a]][idx[b]])
        r = orient_prereq(ma, mb)
        if r:
            oriented.append((r[0], r[1], w, r[2]))
        else:
            unoriented.append((a, b, w))
    # 6. DAG constraint
    kept, removed = break_cycles([(s, d, w) for s, d, w, _ in oriented])
    keptset = {(s, d) for s, d, w in kept}
    method_of = {(s, d): m for s, d, w, m in oriented}
    prereq = [(s, d, w, method_of[(s, d)]) for s, d, w in kept]

    report = {"n_slos": len(ids), "similar": len(similar), "equivalent": len(equivalent),
              "prereq_oriented": len(prereq), "prereq_by_method": dict(Counter(m for *_, m in prereq)),
              "prereq_candidates_for_llm": len(unoriented), "cycles_broken": len(removed),
              "params": {"k": k, "sim_thr": sim_thr, "eq_thr": eq_thr, "max_grade_gap": max_grade_gap}}
    json.dump(report, open(os.path.join(outdir, "semantic_report.json"), "w"), indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2))

    _merge_into_graph(g, gj_path, ids, idx, sim, script, similar, equivalent, prereq, unoriented)
    if do_neo4j:
        _to_neo4j(similar, equivalent, prereq, unoriented, sim, idx, corpus)
    return report

def _merge_into_graph(g, gj_path, ids, idx, sim, script, similar, equivalent, prereq, unoriented):
    """Append the SLO->SLO semantic edges into graph.json so the explorer can render them."""
    node_i = {n["props"]["id"]: n["id"] for n in g["nodes"] if n["label"] == "SLO"}
    g["edges"] = [e for e in g["edges"] if e["rel"] not in
                  ("SIMILAR_TO", "EQUIVALENT_TO", "PREREQUISITE_OF", "PREREQ_CANDIDATE")]
    def add(a, b, rel, props):
        if a in node_i and b in node_i:
            g["edges"].append({"s": node_i[a], "t": node_i[b], "rel": rel, "props": props})
    for pr in similar:
        a, b = sorted(pr); add(a, b, "SIMILAR_TO", {"cosine": round(float(sim[idx[a]][idx[b]]), 3)})
    for pr in equivalent:
        a, b = sorted(pr)
        add(a, b, "EQUIVALENT_TO", {"cosine": round(float(sim[idx[a]][idx[b]]), 3),
                                    "cross_lingual": script[a] != script[b]})
    for s, d, w, m in prereq:
        add(s, d, "PREREQUISITE_OF", {"method": m, "cosine": round(w, 3)})
    for a, b, w in unoriented:
        add(a, b, "PREREQ_CANDIDATE", {"cosine": round(w, 3), "needs": "llm_adjudication"})
    json.dump(g, open(gj_path, "w"), ensure_ascii=False)
    print(f"merged semantic edges into {gj_path} ({len(g['edges'])} edges total)")

def _to_neo4j(similar, equivalent, prereq, unoriented, sim, idx, corpus="curriculum"):
    from neo4j import GraphDatabase
    d = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH, connection_timeout=20)
    with d.session() as s:
        for rel in ("SIMILAR_TO", "EQUIVALENT_TO", "PREREQUISITE_OF", "PREREQ_CANDIDATE"):
            s.run(f"MATCH (:SLO {{corpus:$c}})-[r:{rel}]->(:SLO) DELETE r", c=corpus)
        def push(rows, rel, directed):
            s.run(f"UNWIND $rows AS r MATCH (a:SLO {{id:r.a, corpus:$c}}) MATCH (b:SLO {{id:r.b, corpus:$c}}) "
                  f"MERGE (a)-[e:{rel}]->(b) SET e += r.props", rows=rows, c=corpus)
            print(f"  merged {len(rows):5d} :{rel}")
        push([{"a": sorted(p)[0], "b": sorted(p)[1],
               "props": {"cosine": round(float(sim[idx[sorted(p)[0]]][idx[sorted(p)[1]]]), 3)}}
              for p in similar], "SIMILAR_TO", False)
        push([{"a": sorted(p)[0], "b": sorted(p)[1],
               "props": {"cosine": round(float(sim[idx[sorted(p)[0]]][idx[sorted(p)[1]]]), 3)}}
              for p in equivalent], "EQUIVALENT_TO", False)
        push([{"a": s_, "b": d_, "props": {"method": m, "cosine": round(w, 3)}}
              for s_, d_, w, m in prereq], "PREREQUISITE_OF", True)
        push([{"a": a, "b": b, "props": {"needs": "llm"}} for a, b, w in unoriented], "PREREQ_CANDIDATE", False)
    d.close()

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Optional semantic + prerequisite layer for the curriculum KG.")
    ap.add_argument("graph", help="graph.json, a directory containing one, or a project_root to rebuild from")
    ap.add_argument("--embed", action="store_true", help="encode + build the semantic layer")
    ap.add_argument("--neo4j", action="store_true", help="also push edges into Neo4j (env credentials only)")
    ap.add_argument("--corpus", default="curriculum", help="corpus tag used to scope the Neo4j match")
    ap.add_argument("--k", type=int, default=15)
    ap.add_argument("--sim-thr", type=float, default=0.86)
    ap.add_argument("--eq-thr", type=float, default=0.92)
    a = ap.parse_args()
    if a.embed:
        build(a.graph, k=a.k, sim_thr=a.sim_thr, eq_thr=a.eq_thr, do_neo4j=a.neo4j, corpus=a.corpus)
    else:
        print("nothing to do — pass --embed (see --help)")
