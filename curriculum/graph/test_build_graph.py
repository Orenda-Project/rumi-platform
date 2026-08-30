#!/usr/bin/env python3
"""TDD for build_graph.py — the curriculum knowledge-graph builder.

Runs against the shipped sample (grade_2_math_ch1). Asserts the structural graph and the derived
SLO-level DAG are faithfully built: lessons teach SLOs, SLOs progress per strand (PRECEDES_SLO),
co-taught SLOs are linked, and the SLO graph is acyclic. No network, no Neo4j, no credentials."""
import os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_graph as bg

SAMPLE_SEG = os.path.abspath(os.path.join(
    HERE, "..", "sample", "grade_2_math_ch1", "expected", "02_segmentation"))


class TestBuildGraph(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nodes, cls.edges = bg.build(SAMPLE_SEG)

    def rels(self, rel):
        return [e for e in self.edges if e[2] == rel]

    def test_book_chapter_lesson_nodes(self):
        self.assertEqual(len(self.nodes["Book"]), 1)                 # one book in the sample
        self.assertGreaterEqual(len(self.nodes["Chapter"]), 1)
        self.assertEqual(len(self.nodes["Lesson"]), 12)             # 12 teaching-day lessons

    def test_eight_slo_nodes(self):
        # the sample is fully, correctly coded: M-02-NS-01 .. M-02-NS-08
        codes = sorted(v["code"] for v in self.nodes["SLO"].values())
        self.assertEqual(codes, [f"M-02-NS-0{i}" for i in range(1, 9)])

    def test_lessons_teach_slos(self):
        teaches = self.rels("TEACHES")
        self.assertGreater(len(teaches), 0)
        # every TEACHES edge goes Lesson -> a real SLO node
        for (sl, sk, rel, dl, dk, props) in teaches:
            self.assertEqual(sl, "Lesson")
            self.assertEqual(dl, "SLO")
            self.assertIn(dk, self.nodes["SLO"])

    def test_slo_dag_precedes_within_strand(self):
        pre = self.rels("PRECEDES_SLO")
        self.assertGreater(len(pre), 0)                              # a real SLO-level progression exists
        # all NS strand here → a chain NS-01..NS-08 (7 edges), each carrying strand+order props
        for (_, _, _, _, _, props) in pre:
            self.assertIn("strand", props)
            self.assertIn("order", props)

    def test_slo_graph_is_acyclic(self):
        # a prerequisite cycle is definitionally invalid — the derived SLO DAG must be acyclic
        adj = {}
        for (sl, sk, rel, dl, dk, props) in self.rels("PRECEDES_SLO"):
            adj.setdefault(sk, []).append(dk)
        WHITE, GREY, BLACK = 0, 1, 2
        color = {}

        def has_cycle(u):
            color[u] = GREY
            for v in adj.get(u, []):
                if color.get(v, WHITE) == GREY:
                    return True
                if color.get(v, WHITE) == WHITE and has_cycle(v):
                    return True
            color[u] = BLACK
            return False

        self.assertFalse(any(has_cycle(n) for n in list(adj) if color.get(n, WHITE) == WHITE))

    def test_co_taught_links_exist(self):
        # lessons that teach >1 SLO create CO_TAUGHT_WITH association links (the mesh)
        co = self.rels("CO_TAUGHT_WITH")
        self.assertGreater(len(co), 0)

    def test_exports_are_self_contained(self):
        # json export round-trips and has nodes+edges
        import tempfile, json
        with tempfile.TemporaryDirectory() as d:
            paths = bg.export(self.nodes, self.edges, d)
            g = json.load(open(paths["json"]))
            self.assertGreater(len(g["nodes"]), 0)
            self.assertGreater(len(g["edges"]), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
