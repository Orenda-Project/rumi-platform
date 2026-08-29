"""Tests for qa_checks — the deterministic lesson-body QA gate.

Run: python3 test_qa_checks.py

Covers the hard/soft split and, in particular, that the S6 SLO-code check resolves the
canonical validator from ../tools (a good lesson must never be HARD-failed by a soft
metadata check — the SLO drift is flagged, not blocking).
"""
import unittest
from qa_checks import run_checks

BODY = {"warmUp": "x" * 40,
        "steps": [{"cfu": {"question": "what is 2+2 exactly, tell me"}}],
        "exitTicket": {"q": "y" * 40}, "problems": [], "keyWords": ["a"]}


class TestGate(unittest.TestCase):
    def test_clean_body_passes_hard(self):
        out = run_checks({"generated": BODY})
        self.assertTrue(out["hard_pass"])

    def test_placeholder_fails_hard(self):
        bad = dict(BODY, warmUp="TODO write this")
        out = run_checks({"generated": bad})
        self.assertFalse(out["hard_pass"])

    def test_s6_flags_fused_slo_but_stays_soft(self):
        seg = {"pages_printed": [1], "slo_codes": ["U-05-VO-01 [DERIVED]"]}
        out = run_checks({"generated": BODY}, segment=seg)
        s6 = [c for c in out["checks"] if c["id"] == "S6"]
        self.assertTrue(s6, "S6 must exist when the validator is importable from ../tools")
        self.assertFalse(s6[0]["pass"])       # fused code flagged
        self.assertFalse(s6[0]["hard"])        # but soft
        self.assertTrue(out["hard_pass"])      # so it does NOT block a good body

    def test_s6_passes_clean_slo(self):
        seg = {"pages_printed": [1], "slo_codes": ["U-05-VO-01"]}
        out = run_checks({"generated": BODY}, segment=seg)
        s6 = [c for c in out["checks"] if c["id"] == "S6"]
        self.assertTrue(s6[0]["pass"])


if __name__ == "__main__":
    unittest.main()
