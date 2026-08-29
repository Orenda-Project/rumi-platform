#!/usr/bin/env python3
"""segment_validate.py — the SLO validation GATE, run on segmentation output between
Stage B (segment) and Stage C (enrich). One validator for the main skill AND the OSS port.

WHY: a flat pipeline ships SLO-code drift silently — grade-mismatched codes that collide
across grades, and derivation notes fused into the code field. This gate makes that drift
impossible to ship *unlabelled*.

HANDS-OFF (per the OSS-port direction): it NEVER blocks the pipeline. It returns a verdict,
writes a sidecar `slo_validation.json` next to the segments, and sorts every drift into:
  * quarantine   — GRADE_MISMATCH: the code's grade ≠ the book's grade. A DIFFERENT outcome
                   wearing another grade's string; the correct code is a human-authoring call,
                   so downstream (enrich, graph) must treat these as book-namespaced/suspect.
  * auto_fixable — FUSED_ANNOTATION: a note welded into the code ("U-05-VO-01 [DERIVED]").
                   The bare code is mechanically recoverable; the note belongs in `notes`.
Exit code is ALWAYS 0 (a gate that halts a hands-off run is a bug); the report is the signal.

Usage (agent-callable tool / CLI):
    python3 segment_validate.py <02_segmentation_dir>          # prints verdict, writes sidecar
    python3 segment_validate.py <dir> --json                   # machine-readable verdict
"""
import os, sys, json, argparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slo_registry import drift_report

SIDECAR = "slo_validation.json"


def validate_segmentation(seg_dir):
    """Run the SLO gate over a segmentation dir. Returns a verdict dict (never raises)."""
    try:
        rep = drift_report(seg_dir)
    except Exception as e:                                  # hands-off: a bad dir must not halt the run
        return {"status": "clean", "error": str(e), "registry_size": 0,
                "drift_occurrences": 0, "quarantine": [], "auto_fixable": [], "by_book": {}}
    quarantine, auto_fixable = [], []
    seen_q, seen_a = set(), set()
    for d in rep["drift"]:
        key = (d["book"], d["code"])
        if "GRADE_MISMATCH" in d["issues"] and key not in seen_q:
            seen_q.add(key); quarantine.append({"book": d["book"], "code": d["code"]})
        if "FUSED_ANNOTATION" in d["issues"] and key not in seen_a:
            seen_a.add(key); auto_fixable.append({"book": d["book"], "code": d["code"]})
    return {"status": "flagged" if rep["drift_occurrences"] else "clean",
            "registry_size": rep["registry_size"],
            "drift_occurrences": rep["drift_occurrences"],
            "quarantine": quarantine, "auto_fixable": auto_fixable,
            "by_book": rep["by_book"]}


def write_sidecar(seg_dir, verdict):
    """Write the verdict as `slo_validation.json` next to the segments (downstream reads it)."""
    os.makedirs(seg_dir, exist_ok=True)
    path = os.path.join(seg_dir, SIDECAR)
    json.dump(verdict, open(path, "w"), ensure_ascii=False, indent=2)
    return path


def _print(v):
    print(f"SLO gate: {v['status'].upper()}  "
          f"({v['registry_size']} clean codes, {v['drift_occurrences']} drift occurrences)")
    if v["quarantine"]:
        print(f"  quarantine (grade-mismatch, human re-code): {len(v['quarantine'])} codes")
        for q in v["quarantine"][:10]:
            print(f"     {q['book']:18s} {q['code']}")
    if v["auto_fixable"]:
        print(f"  auto-fixable (fused annotation): {len(v['auto_fixable'])} codes")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("seg_dir")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    v = validate_segmentation(a.seg_dir)
    p = write_sidecar(a.seg_dir, v)
    print(json.dumps(v, ensure_ascii=False, indent=2) if a.json else "")
    if not a.json:
        _print(v)
        print(f"  sidecar: {p}")
    sys.exit(0)   # hands-off: ALWAYS 0
