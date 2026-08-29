#!/usr/bin/env python3
"""slo_registry.py — the CANONICAL SLO-code pattern + a deterministic drift validator.

WHY THIS EXISTS
---------------
Running this pipeline on a real K-5 corpus surfaced two classes of SLO-code drift that
are invisible in flat segmentation JSON but corrupt anything built on top of the codes:

  1. FUSED_ANNOTATION — an enricher welds a derivation note INTO the code field,
     e.g.  "U-05-VO-01 [DERIVED]"  or  "U-05-PH-01 [DERIVED — no explicit … SLO …]".
     The bare code is recoverable; the note belongs in `notes`.
  2. GRADE_MISMATCH — a code whose grade digits differ from the book's grade,
     e.g.  U-05-CO-01 (a grade-5 code) living in a grade-1 book. Such a code is a
     DIFFERENT outcome that merely shares a string, and it COLLIDES with the real
     grade-5 outcome — so anything that keys on the bare code FALSE-MERGES them.
     A well-formed corpus has grade-digits == book grade in every book.

THE CANONICAL PATTERN
---------------------
    <SUBJ>-<GG>-<STRAND>-<NN>[<suffix letter>]
      SUBJ   1–4 letters   subject family (U urdu, M math, E english, S science…)
      GG     2 digits      the SCHOOL GRADE — MUST equal the book's grade
      STRAND 2–4 letters   skill strand (NS number-sense, GE geometry, CO comprehension…)
      NN     2 digits      outcome number within (grade, strand)
      suffix optional a–z  sub-outcome

INVARIANTS (enforce upstream; this module only DETECTS violations):
  * one SUBJ prefix per book;  * GG == book grade;  * the code field holds ONLY the
    code — any note goes in `notes`, never fused into the code.

CONTRACT: this validator FLAGS drift with issue LABELS. It NEVER invents a corrected
code — re-coding a miscoded outcome is a curriculum-authoring decision, not a mechanical
one (forcing grade_1_urdu's codes to grade 01 would collapse distinct outcomes).

Usage:
  python3 slo_registry.py --seg-dir <02_segmentation> [--report drift.json]
"""
import re, os, sys, json, glob, argparse
from collections import defaultdict

# bare canonical code (no trailing annotation)
CANONICAL_RE = re.compile(r"^([A-Za-z]{1,4})-(\d{2})-([A-Za-z]{2,4})-(\d{2})([a-z]?)$")
# a code that STARTS with a canonical code but has trailing junk (a fused note)
_LEADING_CODE_RE = re.compile(r"^([A-Za-z]{1,4}-\d{2}-[A-Za-z]{2,4}-\d{2}[a-z]?)(.*)$", re.S)

GRADE_WORD = {"1": "01", "2": "02", "3": "03", "4": "04", "5": "05",
              "one": "01", "two": "02", "three": "03", "four": "04", "five": "05"}


def parse_slo_code(raw):
    """Parse a raw slo_codes entry. Returns a dict describing it, always (never None):
      code        the bare canonical code (or the raw string if not code-shaped)
      subject/grade/strand/num/suffix   canonical parts ("" if malformed)
      fused_note  any text welded after the code ("" if none)
      malformed   True iff no canonical code could be recovered at all
    """
    s = "" if raw is None else str(raw).strip()
    m = CANONICAL_RE.match(s)
    if m:
        subj, gg, strand, nn, sfx = m.groups()
        return {"code": s, "subject": subj, "grade": gg, "strand": strand,
                "num": nn, "suffix": sfx, "fused_note": "", "malformed": False}
    lead = _LEADING_CODE_RE.match(s)
    if lead:
        bare, rest = lead.group(1), lead.group(2)
        bm = CANONICAL_RE.match(bare)
        subj, gg, strand, nn, sfx = bm.groups()
        return {"code": bare, "subject": subj, "grade": gg, "strand": strand,
                "num": nn, "suffix": sfx,
                "fused_note": rest.strip(" []—-\t\n"), "malformed": False}
    return {"code": s, "subject": "", "grade": "", "strand": "", "num": "",
            "suffix": "", "fused_note": "", "malformed": True}


def validate_code(raw, book_grade=None):
    """Return a list of issue LABELS for one code. Empty list == clean.
    Labels: MALFORMED, FUSED_ANNOTATION, GRADE_MISMATCH. Never returns a correction."""
    p = parse_slo_code(raw)
    issues = []
    if p["malformed"]:
        issues.append("MALFORMED")
        return issues
    if p["fused_note"]:
        issues.append("FUSED_ANNOTATION")
    if book_grade is not None:
        bg = GRADE_WORD.get(str(book_grade), str(book_grade))
        if p["grade"] != bg:
            issues.append("GRADE_MISMATCH")
    return issues


# ---------- corpus-level registry + drift report ----------
def _book_id(fn):
    return re.sub(r"_(full_)?segments?$", "", os.path.splitext(os.path.basename(fn))[0])


def _book_grade(bid):
    m = re.match(r"grade_(\w+?)_", bid)
    return GRADE_WORD.get(m.group(1), m.group(1)) if m else "?"


def build_registry(seg_dir):
    """Build the canonical registry {code: {grade, subject, strand, books:[...] }} from
    the CLEAN (non-drifting) codes, and collect every drift occurrence. Returns
    (registry, drift) where drift is a list of {book, book_grade, raw, code, issues}."""
    registry = {}
    drift = []
    for fn in sorted(glob.glob(os.path.join(seg_dir, "*_full_segments.json"))):
        try:
            j = json.load(open(fn))
        except Exception:
            continue
        segs = j.get("segments") if isinstance(j, dict) else j
        if not isinstance(segs, list):
            continue
        bid = _book_id(fn)
        bg = _book_grade(bid)
        for s in segs:
            for raw in (s.get("slo_codes") or []):
                if not str(raw).strip():
                    continue
                p = parse_slo_code(raw)
                issues = validate_code(raw, bg)
                if issues:
                    drift.append({"book": bid, "book_grade": bg, "raw": str(raw).strip(),
                                  "code": p["code"], "issues": issues,
                                  "fused_note": p["fused_note"]})
                if not issues and not p["malformed"]:   # only CLEAN codes seed the registry
                    r = registry.setdefault(p["code"], {"grade": p["grade"], "subject": p["subject"],
                                                        "strand": p["strand"], "books": set()})
                    r["books"].add(bid)
    for r in registry.values():
        r["books"] = sorted(r["books"])
    return registry, drift


def drift_report(seg_dir):
    registry, drift = build_registry(seg_dir)
    by_book = defaultdict(lambda: defaultdict(list))
    for d in drift:
        for i in d["issues"]:
            by_book[d["book"]][i].append(d["code"])
    summary = {}
    for book, kinds in by_book.items():
        summary[book] = {k: {"occurrences": len(v), "distinct": len(set(v))} for k, v in kinds.items()}
    return {"registry_size": len(registry), "drift_occurrences": len(drift),
            "by_book": summary, "drift": drift}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seg-dir", required=True, help="path to a 02_segmentation dir")
    ap.add_argument("--report", default=None, help="write the full JSON report here")
    a = ap.parse_args()
    rep = drift_report(a.seg_dir)
    print(f"canonical registry: {rep['registry_size']} clean codes")
    print(f"drift occurrences : {rep['drift_occurrences']}")
    for book, kinds in sorted(rep["by_book"].items()):
        parts = ", ".join(f"{k} x{v['occurrences']} ({v['distinct']} distinct)" for k, v in kinds.items())
        print(f"  {book:20s} {parts}")
    if a.report:
        json.dump(rep, open(a.report, "w"), ensure_ascii=False, indent=2)
        print(f"wrote {a.report}")
