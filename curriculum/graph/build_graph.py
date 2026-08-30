#!/usr/bin/env python3
"""
build_graph.py — turn a curriculum project's segmentation into a knowledge graph.

Reads every `02_segmentation/*_full_segments.json` (Stage B output) and builds an in-memory graph of
Book / Chapter / Lesson / SLO / SkillType / Bloom nodes, plus a *derived* SLO-level DAG so you can
see how outcomes progress and trace any SLO back to its strand's first outcome.

    python3 build_graph.py <project_root>              # print node/edge counts
    python3 build_graph.py <project_root> --export .   # write graph.json / .graphml / .cypher
    python3 build_graph.py <project_root> --neo4j      # optional: load into Neo4j (env creds)

Structural edges
    Book-CONTAINS->Chapter-CONTAINS->Lesson
    Lesson-TEACHES->SLO   Lesson-HAS_SKILL->SkillType   Lesson-AT_BLOOM->Bloom
    Lesson-PRECEDES->Lesson            (teaching order)
Derived SLO-level DAG (the useful part)
    SLO-PRECEDES_SLO->SLO   per skill STRAND, by first-introduction order (parallel acyclic threads)
    SLO-CO_TAUGHT_WITH->SLO where one lesson teaches SLOs from >1 strand (weaves threads into a mesh)

The credential-free, zero-dependency core. The optional semantic prerequisite layer (embeddings)
lives in `semantic_slos.py`; the interactive viewer in `explorer.py`.

No credentials in the code. Neo4j connection details come only from the environment:
    export NEO4J_URI=bolt://…  NEO4J_USER=neo4j  NEO4J_PASSWORD=…
"""
import json, glob, os, sys, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
# The ONE canonical SLO-code pattern + drift validator — import it so the graph and the build
# pipeline can never diverge on what a valid code is.
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from slo_registry import parse_slo_code, validate_code


def _book_id(fn):
    return re.sub(r"_(full_)?segments?$", "", os.path.splitext(os.path.basename(fn))[0])


def _parse_book_id(bid):
    m = re.match(r"grade_(\w+?)_(.+)", bid)
    if m:
        return m.group(1), m.group(2).replace("_", " ")
    return "?", bid


def _seg_dir(project_root):
    """Accept either a project root (…/expected) or the 02_segmentation dir itself."""
    if os.path.basename(os.path.normpath(project_root)) == "02_segmentation":
        return project_root
    cand = os.path.join(project_root, "02_segmentation")
    if os.path.isdir(cand):
        return cand
    cand2 = os.path.join(project_root, "expected", "02_segmentation")
    return cand2 if os.path.isdir(cand2) else project_root


def build(project_root):
    """Read a curriculum project's segmentation into (nodes, edges). Pure, offline, no credentials."""
    seg_dir = _seg_dir(project_root)
    nodes = {"Book": {}, "Chapter": {}, "Lesson": {}, "SLO": {}, "SkillType": {}, "Bloom": {}}
    edges = []  # (src_label, src_key, REL, dst_label, dst_key, props_dict)
    # The authoritative set is the *_full_segments.json files (per-chapter partials duplicate a book
    # and reset segment_index, so the full files are the one clean source).
    for fn in sorted(glob.glob(os.path.join(seg_dir, "*_full_segments.json"))):
        try:
            j = json.load(open(fn))
        except Exception:
            continue
        segs = j.get("segments") if isinstance(j, dict) else j
        if not isinstance(segs, list):
            continue
        bid = _book_id(fn)
        grade, subject = _parse_book_id(bid)
        nodes["Book"][bid] = {"id": bid, "grade": grade, "subject": subject, "n_lessons": len(segs)}
        prev_lesson_key = None
        book_slo_seq, book_slo_seen, book_cotaught = [], set(), set()
        for s in segs:
            ch_no = s.get("chapter_number")
            ch_key = f"{bid}::ch{ch_no}"
            if ch_key not in nodes["Chapter"]:
                nodes["Chapter"][ch_key] = {"id": ch_key, "book": bid, "number": ch_no,
                                            "title": s.get("chapter_title", "")}
                edges.append(("Book", bid, "CONTAINS", "Chapter", ch_key, {}))
            li = s.get("segment_index")
            lkey = f"{bid}::ch{ch_no}::L{li}"   # segment_index resets per chapter → qualify by chapter
            kind = ("assessment" if li == 995 else "revision" if li == 990
                    else ("revision" if s.get("new_or_revision") == "revision" else "content"))
            nodes["Lesson"][lkey] = {
                "id": lkey, "book": bid, "grade": grade, "subject": subject,
                "chapter": ch_no, "index": li, "day_label": s.get("day_label", ""),
                "topic": s.get("topic", ""), "skill_type": s.get("skill_type", ""),
                "cpa_phase": s.get("cpa_phase", ""), "blooms": s.get("blooms", ""),
                "pages": ",".join(map(str, s.get("pages_printed") or [])),
                "kind": kind, "new_or_revision": s.get("new_or_revision", ""),
            }
            edges.append(("Chapter", ch_key, "CONTAINS", "Lesson", lkey, {}))
            # SLOs — parse + validate against the canonical registry. Two drift classes are handled
            # so the graph tells the truth: FUSED_ANNOTATION merges to the bare code (note kept as a
            # property); GRADE_MISMATCH is QUARANTINED under a book-namespaced id so a grade-N code
            # living in the wrong book cannot false-merge with the real grade-N outcome.
            codes = s.get("slo_codes") or []
            descs = s.get("slo_descriptions") or []
            seg_slo_ids = []
            for i, raw in enumerate(codes):
                if not raw or not str(raw).strip():
                    continue
                p = parse_slo_code(raw)
                issues = validate_code(raw, grade)
                suspect = "GRADE_MISMATCH" in issues
                node_id = f"{p['code']}@{bid}" if suspect else p["code"]
                if node_id not in nodes["SLO"]:
                    nodes["SLO"][node_id] = {"id": node_id, "code": p["code"],
                                             "code_grade": p["grade"] or "?",
                                             "strand": p["strand"] or "?",
                                             "malformed": p["malformed"],
                                             "description": descs[i] if i < len(descs) else ""}
                if suspect:
                    nodes["SLO"][node_id]["suspect_grade_mismatch"] = True
                    nodes["SLO"][node_id]["book"] = bid
                if p["fused_note"]:
                    nodes["SLO"][node_id]["derived_somewhere"] = True
                    nodes["SLO"][node_id]["derivation_note"] = p["fused_note"][:200]
                edges.append(("Lesson", lkey, "TEACHES", "SLO", node_id, {}))
                if node_id not in book_slo_seen:
                    book_slo_seen.add(node_id)
                    book_slo_seq.append(node_id)
                if node_id not in seg_slo_ids:
                    seg_slo_ids.append(node_id)
            for a_i in range(len(seg_slo_ids)):
                for b_i in range(a_i + 1, len(seg_slo_ids)):
                    book_cotaught.add(frozenset((seg_slo_ids[a_i], seg_slo_ids[b_i])))
            st = s.get("skill_type")
            if st:
                nodes["SkillType"].setdefault(st, {"id": st})
                edges.append(("Lesson", lkey, "HAS_SKILL", "SkillType", st, {}))
            bl = s.get("blooms")
            if bl:
                nodes["Bloom"].setdefault(bl, {"id": bl})
                edges.append(("Lesson", lkey, "AT_BLOOM", "Bloom", bl, {}))
            if prev_lesson_key is not None:
                edges.append(("Lesson", prev_lesson_key, "PRECEDES", "Lesson", lkey, {}))
            prev_lesson_key = lkey
        # ---- derived SLO-level DAG (per book) ----
        # SLOs carry no native SLO->SLO link. A single book-wide chain would be a straight LINE (a
        # total order), which a curriculum is not. So build a DAG: a directed PRECEDES_SLO sequence
        # WITHIN each skill strand (parallel acyclic threads), woven by CO_TAUGHT_WITH association
        # links where a lesson teaches across strands.
        by_strand = {}
        for nid in book_slo_seq:
            st = nodes["SLO"][nid].get("strand", "?")
            by_strand.setdefault(st, []).append(nid)
        for st, seq in by_strand.items():
            for i in range(len(seq) - 1):
                edges.append(("SLO", seq[i], "PRECEDES_SLO", "SLO", seq[i + 1],
                              {"book": bid, "grade": grade, "subject": subject, "strand": st, "order": i}))
        for pair in book_cotaught:
            a, b = sorted(pair)
            if a != b:
                edges.append(("SLO", a, "CO_TAUGHT_WITH", "SLO", b,
                              {"book": bid, "grade": grade, "subject": subject}))
    return nodes, edges


# ---------- exports (self-contained; no external service) ----------
LABCOL = {"Book": "#F5B301", "Chapter": "#5b8cff", "Lesson": "#2ecc71",
          "SLO": "#e056fd", "SkillType": "#ff7979", "Bloom": "#7ed6df"}


def _to_json(nodes, edges, path):
    jn, idx, i = [], {}, 0
    for lab, items in nodes.items():
        for v in items.values():
            idx[f"{lab}:{v['id']}"] = i
            name = v.get("title") or v.get("topic") or v.get("description") or v["id"]
            jn.append({"id": i, "label": lab, "name": str(name)[:70], "color": LABCOL[lab], "props": v})
            i += 1
    je = []
    for sl, sk, rel, dl, dk, props in edges:
        a, b = f"{sl}:{sk}", f"{dl}:{dk}"
        if a in idx and b in idx:
            e = {"s": idx[a], "t": idx[b], "rel": rel}
            if props:
                e["props"] = props
            je.append(e)
    json.dump({"nodes": jn, "edges": je}, open(path, "w"), ensure_ascii=False)
    return len(jn), len(je)


def _to_graphml(nodes, edges, path):
    def esc(x):
        return html.escape(str(x), quote=True)
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
           '<key id="label" for="node" attr.name="label" attr.type="string"/>',
           '<key id="name" for="node" attr.name="name" attr.type="string"/>',
           '<key id="rel" for="edge" attr.name="rel" attr.type="string"/>',
           '<graph edgedefault="directed">']
    nid, i = {}, 0
    for lab, items in nodes.items():
        for v in items.values():
            nid[f"{lab}:{v['id']}"] = f"n{i}"
            name = v.get("title") or v.get("topic") or v.get("description") or v["id"]
            out.append(f'<node id="n{i}"><data key="label">{esc(lab)}</data>'
                       f'<data key="name">{esc(str(name)[:80])}</data></node>')
            i += 1
    for sl, sk, rel, dl, dk, props in edges:
        a, b = nid.get(f"{sl}:{sk}"), nid.get(f"{dl}:{dk}")
        if a and b:
            out.append(f'<edge source="{a}" target="{b}"><data key="rel">{esc(rel)}</data></edge>')
    out += ['</graph>', '</graphml>']
    open(path, "w").write("\n".join(out))


def _to_cypher(nodes, edges, path, corpus):
    def val(v):
        return json.dumps(v, ensure_ascii=False)
    lines = [f"// Curriculum knowledge graph — corpus {corpus}"]
    for lab in nodes:
        lines.append(f"CREATE CONSTRAINT {lab.lower()}_id IF NOT EXISTS FOR (n:{lab}) REQUIRE n.id IS UNIQUE;")
    for lab, items in nodes.items():
        for v in items.values():
            props = ", ".join(f"{k}:{val(x)}" for k, x in dict(v, corpus=corpus).items())
            lines.append(f"MERGE (n:{lab} {{id:{val(v['id'])}}}) SET n += {{{props}}};")
    for sl, sk, rel, dl, dk, props in edges:
        if rel in ("PRECEDES_SLO", "CO_TAUGHT_WITH"):
            pr = ", ".join(f"{k}:{val(x)}" for k, x in props.items())
            lines.append(f"MATCH (a:{sl} {{id:{val(sk)}}}),(b:{dl} {{id:{val(dk)}}}) "
                         f"MERGE (a)-[e:{rel} {{book:{val(props['book'])}}}]->(b) SET e += {{{pr}}};")
        else:
            lines.append(f"MATCH (a:{sl} {{id:{val(sk)}}}),(b:{dl} {{id:{val(dk)}}}) MERGE (a)-[:{rel}]->(b);")
    open(path, "w").write("\n".join(lines))


def export(nodes, edges, out_dir, corpus="curriculum"):
    """Write graph.json / graph.graphml / graph.cypher into out_dir. Returns their paths."""
    os.makedirs(out_dir, exist_ok=True)
    paths = {"json": os.path.join(out_dir, "graph.json"),
             "graphml": os.path.join(out_dir, "graph.graphml"),
             "cypher": os.path.join(out_dir, "graph.cypher")}
    nn, ne = _to_json(nodes, edges, paths["json"])
    _to_graphml(nodes, edges, paths["graphml"])
    _to_cypher(nodes, edges, paths["cypher"], corpus)
    paths["counts"] = (nn, ne)
    return paths


# ---------- optional Neo4j load (env credentials only) ----------
def to_neo4j(nodes, edges, corpus="curriculum", wipe=False):
    from neo4j import GraphDatabase
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    auth = (os.environ.get("NEO4J_USER", "neo4j"), os.environ.get("NEO4J_PASSWORD", ""))
    d = GraphDatabase.driver(uri, auth=auth, connection_timeout=20)
    from collections import defaultdict
    with d.session() as s:
        if wipe:
            s.run("MATCH (n {corpus:$c}) DETACH DELETE n", c=corpus)
        for lab in nodes:
            s.run(f"CREATE CONSTRAINT {lab.lower()}_id IF NOT EXISTS FOR (n:{lab}) REQUIRE n.id IS UNIQUE")
        for lab, items in nodes.items():
            batch = [dict(v, corpus=corpus) for v in items.values()]
            s.run(f"UNWIND $rows AS r MERGE (n:{lab} {{id:r.id}}) SET n += r", rows=batch)
        groups = defaultdict(list)
        for sl, sk, rel, dl, dk, props in edges:
            groups[(sl, rel, dl)].append({"s": sk, "d": dk, "props": props})
        for (sl, rel, dl), rows in groups.items():
            if rel in ("PRECEDES_SLO", "CO_TAUGHT_WITH"):
                s.run(f"UNWIND $rows AS r MATCH (a:{sl} {{id:r.s}}) MATCH (b:{dl} {{id:r.d}}) "
                      f"MERGE (a)-[e:{rel} {{book:r.props.book}}]->(b) SET e += r.props", rows=rows)
            else:
                s.run(f"UNWIND $rows AS r MATCH (a:{sl} {{id:r.s}}) MATCH (b:{dl} {{id:r.d}}) "
                      f"MERGE (a)-[:{rel}]->(b)", rows=rows)
    d.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("usage: build_graph.py <project_root> [--export DIR] [--neo4j] [--wipe]")
    root = args[0]
    corpus = os.path.basename(os.path.normpath(root)) or "curriculum"
    nodes, edges = build(root)
    print("NODES:", {k: len(v) for k, v in nodes.items()}, "| EDGES:", len(edges))
    if "--export" in sys.argv:
        i = sys.argv.index("--export")
        out_dir = sys.argv[i + 1] if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--") else "."
        p = export(nodes, edges, out_dir, corpus)
        print("wrote", p["json"], p["counts"])
    if "--neo4j" in sys.argv:
        to_neo4j(nodes, edges, corpus, wipe="--wipe" in sys.argv)
        print("loaded into Neo4j")
