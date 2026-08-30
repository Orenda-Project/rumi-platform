"""Tests for slo_registry — the canonical SLO-code pattern + drift validator.

Run: `python3 test_slo_registry.py` (or `python3 -m unittest test_slo_registry`).

Encodes the two drift classes a real K-5 corpus surfaces:
  - the canonical code shape  <SUBJ>-<GG>-<STRAND>-<NN>[a]  where GG == book grade;
  - "fused annotation" drift   "U-05-VO-01 [DERIVED]"  (a note welded into the code);
  - "grade mismatch" drift      a code whose GG != the book's grade (all in grade_1_urdu).
The validator must FLAG these deterministically and NEVER invent a correction.
"""
import unittest
from slo_registry import parse_slo_code, validate_code, CANONICAL_RE


class TestParse(unittest.TestCase):
    def test_canonical_parses(self):
        p = parse_slo_code("M-02-NS-03")
        self.assertIsNotNone(p)
        self.assertEqual(p["subject"], "M")
        self.assertEqual(p["grade"], "02")
        self.assertEqual(p["strand"], "NS")
        self.assertEqual(p["num"], "03")
        self.assertFalse(p["malformed"])
        self.assertEqual(p["fused_note"], "")

    def test_suffix_letter_allowed(self):
        p = parse_slo_code("U-05-WR-02a")
        self.assertIsNotNone(p)
        self.assertEqual(p["suffix"], "a")
        self.assertFalse(p["malformed"])

    def test_fused_annotation_recovers_bare_code_and_note(self):
        p = parse_slo_code("U-05-VO-01 [DERIVED]")
        self.assertEqual(p["code"], "U-05-VO-01")   # bare code recovered
        self.assertTrue(p["fused_note"])            # note preserved, not lost
        self.assertFalse(p["malformed"])            # the code portion is well-formed

    def test_fused_long_note(self):
        p = parse_slo_code("U-05-PH-01 [DERIVED — no explicit arkaan_saazi SLO in Ch2]")
        self.assertEqual(p["code"], "U-05-PH-01")
        self.assertIn("arkaan", p["fused_note"])

    def test_truly_malformed(self):
        p = parse_slo_code("just some prose, no code")
        self.assertTrue(p["malformed"])


class TestValidate(unittest.TestCase):
    def test_clean_code_in_matching_grade_has_no_issues(self):
        self.assertEqual(validate_code("U-05-CO-01", book_grade="05"), [])

    def test_fused_annotation_flagged(self):
        issues = validate_code("U-05-VO-01 [DERIVED]", book_grade="05")
        self.assertIn("FUSED_ANNOTATION", issues)

    def test_grade_mismatch_flagged(self):
        # grade_1_urdu carrying a grade-5-coded outcome
        issues = validate_code("U-05-CO-01", book_grade="01")
        self.assertIn("GRADE_MISMATCH", issues)

    def test_malformed_flagged(self):
        issues = validate_code("nonsense", book_grade="01")
        self.assertIn("MALFORMED", issues)

    def test_validator_never_invents_a_correction(self):
        # contract: validate_code returns issue LABELS only, never a rewritten code
        issues = validate_code("U-05-CO-01", book_grade="01")
        self.assertTrue(all(isinstance(i, str) for i in issues))
        self.assertNotIn("U-01-CO-01", issues)


if __name__ == "__main__":
    unittest.main()
