"""Tests for the thin curriculum CLI — the plug-and-play entry that ties the tools together.

Run: python3 curriculum/test_cli.py  (or from curriculum/: python3 test_cli.py)

The CLI is the CI / non-agent front door; the agent skill is the primary interface. It must:
  * `init`  scaffold the clean A-F layout;
  * `check` run BOTH gates (folder contract + SLO validation) and return one combined verdict;
  * be hands-off — `check` reports, it does not raise on drift.
"""
import unittest, tempfile, os, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cli import cmd_init, combined_check


def _touch(path, content="{}"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(content)


class TestCLI(unittest.TestCase):
    def test_init_scaffolds_layout(self):
        with tempfile.TemporaryDirectory() as d:
            cmd_init(d, "demo")
            for sub in ("01_page_truth", "02_segmentation", "03_enrichment"):
                self.assertTrue(os.path.isdir(os.path.join(d, sub)))
            self.assertTrue(os.path.exists(os.path.join(d, "curriculum.json")))

    def test_check_reports_both_folder_and_slo(self):
        with tempfile.TemporaryDirectory() as d:
            cmd_init(d, "demo")
            # a real page-truth book (enrichment always follows page-truth)
            _touch(os.path.join(d, "01_page_truth", "grade_1_urdu", "pg_001.json"))
            # a segmentation with an SLO grade-mismatch (grade-5 code in a grade-1 book)
            _touch(os.path.join(d, "02_segmentation", "grade_1_urdu_full_segments.json"),
                   json.dumps({"segments": [{"chapter_number": 1, "segment_index": 1,
                                             "slo_codes": ["U-05-CO-01"], "slo_descriptions": ["x"]}]}))
            # a folder-contract violation: an enrichment book that matches no page-truth book
            _touch(os.path.join(d, "03_enrichment", "grade_9_ghost", "grade_9_ghost_ch1_seg1.json"))
            v = combined_check(d)
            self.assertIn("folder", v)
            self.assertIn("slo", v)
            self.assertEqual(v["slo"]["status"], "flagged")               # SLO gate saw the drift
            self.assertIn({"book": "grade_1_urdu", "code": "U-05-CO-01"}, v["slo"]["quarantine"])
            self.assertTrue(any("grade_9_ghost" in p for p in v["folder"]["problems"]))  # folder gate too
            self.assertFalse(v["ok"])

    def test_check_clean_project_ok(self):
        with tempfile.TemporaryDirectory() as d:
            cmd_init(d, "demo")
            _touch(os.path.join(d, "01_page_truth", "grade_2_math", "pg_001.json"))
            _touch(os.path.join(d, "01_page_truth", "grade_2_math", "_book.json"))
            _touch(os.path.join(d, "02_segmentation", "grade_2_math_full_segments.json"),
                   json.dumps({"segments": [{"chapter_number": 1, "segment_index": 1,
                                             "slo_codes": ["M-02-NS-01"], "slo_descriptions": ["x"]}]}))
            _touch(os.path.join(d, "_ledger.jsonl"),
                   json.dumps({"ts": "2026-01-01", "stage": "A", "unit": "u",
                               "artifact": "01_page_truth/grade_2_math/pg_001.json"}) + "\n")
            v = combined_check(d)
            self.assertEqual(v["slo"]["status"], "clean")
            self.assertEqual(v["folder"]["problems"], [])
            self.assertTrue(v["ok"])


if __name__ == "__main__":
    unittest.main()
