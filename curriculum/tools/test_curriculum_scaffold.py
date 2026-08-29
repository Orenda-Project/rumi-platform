"""Tests for curriculum_scaffold — the FOLDER CONTRACT (create + check).

Run: python3 test_curriculum_scaffold.py

Locks the "lessons live in clean, predictable folders" guarantee: the canonical A–F
layout, the lesson_id grammar, and — added here — validation of the 03_enrichment/
stage where the lesson bodies actually live (previously unchecked, so a misnamed lesson
body could sprawl silently).
"""
import unittest, tempfile, os, json
from curriculum_scaffold import create, check


def _touch(path, content="{}"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(content)


class TestCreate(unittest.TestCase):
    def test_create_makes_the_full_clean_layout(self):
        with tempfile.TemporaryDirectory() as d:
            create(d, "demo", 10, "")
            for sub in ("01_page_truth", "02_segmentation", "03_enrichment",
                        "04_lesson_plans", "05_voicenotes"):
                self.assertTrue(os.path.isdir(os.path.join(d, sub)), f"missing {sub}")
            self.assertTrue(os.path.exists(os.path.join(d, "curriculum.json")))
            self.assertTrue(os.path.exists(os.path.join(d, "_ledger.jsonl")))


class TestCheck(unittest.TestCase):
    def _valid_project(self, d):
        create(d, "demo", 1, "")
        _touch(os.path.join(d, "01_page_truth", "grade_2_math", "pg_001.json"))
        _touch(os.path.join(d, "01_page_truth", "grade_2_math", "_book.json"))
        _touch(os.path.join(d, "02_segmentation", "grade_2_math_full_segments.json"),
               '{"segments":[]}')
        _touch(os.path.join(d, "03_enrichment", "grade_2_math", "grade_2_math_ch1_seg1.json"))
        # stamp the one produced artifact so stamp-coverage doesn't flag an otherwise-clean tree
        _touch(os.path.join(d, "_ledger.jsonl"),
               json.dumps({"ts": "2026-01-01T00:00:00Z", "stage": "A",
                           "unit": "grade_2_math/pg_001",
                           "artifact": "01_page_truth/grade_2_math/pg_001.json"}) + "\n")

    def test_clean_layout_passes(self):
        with tempfile.TemporaryDirectory() as d:
            self._valid_project(d)
            problems, notes, stats = check(d)
            self.assertEqual(problems, [], f"clean layout should pass, got: {problems}")

    def test_missing_manifest_is_a_problem(self):
        with tempfile.TemporaryDirectory() as d:
            self._valid_project(d)
            os.remove(os.path.join(d, "curriculum.json"))
            problems, _, _ = check(d)
            self.assertTrue(any("curriculum.json" in p for p in problems))

    def test_bad_lesson_id_in_lesson_plans_flagged(self):
        with tempfile.TemporaryDirectory() as d:
            self._valid_project(d)
            os.makedirs(os.path.join(d, "04_lesson_plans", "not-a-lesson-id"))
            problems, _, _ = check(d)
            self.assertTrue(any("04_lesson_plans" in p for p in problems))

    def test_stray_enrichment_file_flagged(self):
        # a lesson body that does NOT follow <lesson_id>.json must be caught (was unchecked)
        with tempfile.TemporaryDirectory() as d:
            self._valid_project(d)
            _touch(os.path.join(d, "03_enrichment", "grade_2_math", "random_notes.json"))
            problems, _, _ = check(d)
            self.assertTrue(any("03_enrichment" in p for p in problems),
                            "a misnamed enrichment lesson body must be flagged")

    def test_enrichment_book_must_match_a_real_book(self):
        with tempfile.TemporaryDirectory() as d:
            self._valid_project(d)
            _touch(os.path.join(d, "03_enrichment", "grade_9_ghost", "grade_9_ghost_ch1_seg1.json"))
            problems, _, _ = check(d)
            self.assertTrue(any("03_enrichment" in p and "grade_9_ghost" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
