"""Tests for segment_validate — the SLO validation GATE that runs on segmentation output
between Stage B (segment) and Stage C (enrich).

Run: python3 test_segment_validate.py

Contract (hands-off, per the OSS-port direction):
  * NEVER blocks (no raise / always usable) — it FLAGS and writes a sidecar report;
  * GRADE_MISMATCH codes (a human-authoring call) go to `quarantine`;
  * FUSED_ANNOTATION codes (mechanically recoverable) go to `auto_fixable`;
  * a clean corpus yields status == "clean".
Built on slo_registry so the whole pipeline inherits ONE validator.
"""
import unittest, tempfile, os, json
from segment_validate import validate_segmentation, write_sidecar


def _seg(dirpath, name, segments):
    json.dump({"segments": segments}, open(os.path.join(dirpath, name), "w"), ensure_ascii=False)


class TestGate(unittest.TestCase):
    def test_clean_corpus_is_clean(self):
        with tempfile.TemporaryDirectory() as d:
            _seg(d, "grade_2_math_full_segments.json",
                 [{"chapter_number": 1, "segment_index": 1, "slo_codes": ["M-02-NS-01"],
                   "slo_descriptions": ["count to 999"]}])
            v = validate_segmentation(d)
            self.assertEqual(v["status"], "clean")
            self.assertEqual(v["quarantine"], [])
            self.assertEqual(v["auto_fixable"], [])

    def test_grade_mismatch_goes_to_quarantine(self):
        with tempfile.TemporaryDirectory() as d:
            # grade-1 book carrying a grade-5-coded outcome (the grade_1_urdu class of drift)
            _seg(d, "grade_1_urdu_full_segments.json",
                 [{"chapter_number": 1, "segment_index": 1, "slo_codes": ["U-05-CO-01"],
                   "slo_descriptions": ["listen to a story"]}])
            v = validate_segmentation(d)
            self.assertEqual(v["status"], "flagged")
            self.assertIn({"book": "grade_1_urdu", "code": "U-05-CO-01"}, v["quarantine"])

    def test_fused_annotation_is_auto_fixable_not_quarantined(self):
        with tempfile.TemporaryDirectory() as d:
            _seg(d, "grade_5_urdu_full_segments.json",
                 [{"chapter_number": 1, "segment_index": 1, "slo_codes": ["U-05-VO-01 [DERIVED]"],
                   "slo_descriptions": ["new words"]}])
            v = validate_segmentation(d)
            self.assertEqual(v["status"], "flagged")
            self.assertIn({"book": "grade_5_urdu", "code": "U-05-VO-01"}, v["auto_fixable"])
            self.assertNotIn({"book": "grade_5_urdu", "code": "U-05-VO-01"}, v["quarantine"])

    def test_hands_off_never_raises_on_bad_dir(self):
        # a non-existent dir must not blow up the pipeline — returns a usable verdict
        v = validate_segmentation("/no/such/dir/xyz")
        self.assertIn(v["status"], ("clean", "flagged"))

    def test_sidecar_is_written_next_to_segments(self):
        with tempfile.TemporaryDirectory() as d:
            _seg(d, "grade_1_urdu_full_segments.json",
                 [{"chapter_number": 1, "segment_index": 1, "slo_codes": ["U-05-CO-01"],
                   "slo_descriptions": ["x"]}])
            v = validate_segmentation(d)
            path = write_sidecar(d, v)
            self.assertTrue(os.path.exists(path))
            back = json.load(open(path))
            self.assertEqual(back["status"], "flagged")


if __name__ == "__main__":
    unittest.main()
