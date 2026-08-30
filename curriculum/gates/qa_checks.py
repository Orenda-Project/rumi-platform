#!/usr/bin/env python3
"""Deterministic QA checks on an ENRICHED lesson body (Stage-C JSON) — the mechanizable
subset of the team's Master QA Checklist (qa_checklist_source.md) + the enrichment
contract's zero-tolerance rules. No LLM. Part 3 of the composite gate (D-017).

Usage: python3 qa_checks.py <enriched_lp.json> [--segment <segment.json>] [--json]
Returns exit 0 if all HARD checks pass; the report lists every check with pass/fail.

Check classes:
  HARD (fail => composite auto-fail): placeholders, empty required fields, unsolved
        closed problems, missing exit ticket, missing pages/SLO linkage.
  SOFT (count toward the QA %): times sum to band, CFU per phase, vocabulary present
        where expected, differentiation both directions, materials listed.
"""
import json, re, sys, os, argparse

# canonical SLO-code validator (curriculum/tools/); optional so qa_checks runs standalone.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
try:
    from slo_registry import validate_code as _slo_validate
except Exception:
    _slo_validate = None

# NOTE (2026-08-03 trial lesson): underscore-runs are NOT a placeholder violation — "my hand
# moved ______ (fast/slow)" is a legitimate student fill-in-the-blank item, and unsolved
# blanks are already caught by H3 (every closed problem needs a solution). The original
# r"_{3,}" hard check false-failed 10/11 correct Opus lessons in the model trial.
PLACEHOLDER_PATTERNS = [
    r"\bTBD\b|\bTODO\b|\bXXX\b",
    r"\[insert[^\]]*\]|\[add[^\]]*\]|\[fill[^\]]*\]",
    # deferral phrases fail ONLY as authoring deferrals — "(to be decided together)" describing
    # class elicitation is legitimate pedagogy (2026-08-03 production edge: the phrase-match
    # zeroed a 94-composite lesson whose board answers were deliberately elicited in class).
    r"fill in with students|will be added later|to be decided(?!\s+(together|as a class|by the class|with the class|by students))",
    r"\bOption A\b(?!.*\bOption B\b)",   # a lone "Option A" with no B = template residue
]
REQUIRED_FIELDS = ["warmUp", "steps", "exitTicket"]          # hard-required in every lesson body
EXPECTED_FIELDS = ["hookStory", "keyWords", "boardWork", "problems",
                   "weakLearnerSupport", "challengeExtension", "homework"]  # soft

def _txt(x):
    if x is None: return ""
    if isinstance(x, str): return x
    if isinstance(x, (int, float)): return str(x)
    if isinstance(x, list): return " ".join(_txt(i) for i in x)
    if isinstance(x, dict): return " ".join(_txt(v) for v in x.values())
    return str(x)

def run_checks(lp, segment=None):
    body = lp.get("generated", lp)   # accept the envelope or the body itself
    full = _txt(body)
    res = []
    def add(cid, name, ok, hard, detail=""):
        res.append({"id": cid, "name": name, "pass": bool(ok), "hard": hard, "detail": detail})

    # --- HARD ---
    for pat in PLACEHOLDER_PATTERNS:
        m = re.search(pat, full, re.I)
        if m: add("H1", "No placeholders", False, True, f"matched {pat!r}: …{full[max(0,m.start()-30):m.end()+30]}…"); break
    else:
        add("H1", "No placeholders", True, True)
    for f in REQUIRED_FIELDS:
        v = body.get(f)
        add("H2." + f, f"Required field '{f}' present+non-empty", bool(v) and len(_txt(v).strip()) > 20, True)
    probs = body.get("problems") or []
    unsolved = [i for i, p in enumerate(probs)
                if isinstance(p, dict) and p.get("status", "solved") != "open-personal"
                and not (_txt(p.get("solution") or p.get("answer") or p.get("answer_key")).strip())]
    add("H3", "Every closed problem has a solution", not unsolved, True,
        f"unsolved indices: {unsolved}" if unsolved else "")
    et = body.get("exitTicket") or {}
    add("H4", "Exit ticket has real content", len(_txt(et).strip()) > 30, True)
    if segment:
        pages = segment.get("pages_printed") or segment.get("pages") or ""
        add("H5", "Segment carries page linkage", bool(str(pages).strip()), True)
        add("H6", "Segment carries SLO codes", bool(segment.get("slo_codes")), True)

    # --- SOFT ---
    for f in EXPECTED_FIELDS:
        add("S1." + f, f"Expected field '{f}' present", bool(body.get(f)), False)
    # times: steps may carry minutes; sum within 20-55 (region band with slack).
    # 2026-08-04 sweep finding: a lesson stating BOTH its total ("40 min") and its per-stage
    # breakdown (5+10+15+5+5) double-counts to ~80 and false-failed nearly the whole confirmed-
    # fail pool (~3.8 composite pts each). Accept any consistent reading: raw sum in band,
    # sum minus the stated duration_min in band, or sum minus the largest mention (the
    # restated total) in band. Structure-first per D-021.
    mins = [int(m) for m in re.findall(r"(\d{1,2})\s*(?:min|منٹ)", full)][:12]
    tot = sum(mins) if mins else None
    dur = body.get("duration_min")
    plausible = tot is None or 20 <= tot <= 55
    if not plausible and isinstance(dur, (int, float)) and dur in mins:
        plausible = 20 <= tot - dur <= 55
    if not plausible and mins:
        plausible = 20 <= tot - max(mins) <= 55
    add("S2", "Stage times visible and plausible (sum 20-55 min, total-restatement tolerated)",
        plausible, False, f"stated minutes sum={tot}, duration_min={dur}")
    # Count STRUCTURAL CFUs (steps[].cfu objects with a real question) first — the schema's
    # native form; fall back to text mentions. (2026-08-03: the original regex-only check
    # false-failed all lessons that carried proper cfu objects but never wrote the word "CFU".)
    struct_cfu = sum(1 for st in (body.get("steps") or [])
                     if isinstance(st, dict) and isinstance(st.get("cfu"), dict)
                     and len(str(st["cfu"].get("question", "")).strip()) > 5)
    text_cfu = len(re.findall(r"\bCFU\b|check for understanding|سمجھ کی جانچ", full, re.I))
    cfu = max(struct_cfu, text_cfu)
    add("S3", "CFUs present (>=2, structural or textual)", cfu >= 2, False, f"structural {struct_cfu}, textual {text_cfu}")
    add("S4", "Differentiation both directions", bool(body.get("weakLearnerSupport")) and bool(body.get("challengeExtension")), False)
    kw = body.get("keyWords") or []
    add("S5", "Vocabulary/keyWords non-empty", bool(kw), False)
    # S6 (SOFT, non-blocking): SLO codes are WELL-FORMED — no malformed strings, no
    # derivation note fused into the code field. Deliberately soft: a miscoded outcome
    # must never auto-fail an otherwise-good lesson body (that would block a whole book
    # over metadata — the grade_1_urdu / grade_5_urdu drift). Grade-vs-book
    # mismatch is a CORPUS-level check (slo_registry drift report), not per-lesson.
    if segment is not None and _slo_validate is not None:
        codes = segment.get("slo_codes") or []
        bad = [c for c in codes if str(c).strip()
               and ({"MALFORMED", "FUSED_ANNOTATION"} & set(_slo_validate(c)))]
        add("S6", "SLO codes well-formed (no fused notes / malformed)", not bad, False,
            f"malformed/fused: {bad}" if bad else "")

    hard_fail = [r for r in res if r["hard"] and not r["pass"]]
    soft = [r for r in res if not r["hard"]]
    soft_pct = round(100 * sum(1 for r in soft if r["pass"]) / len(soft), 1) if soft else 100.0
    return {"hard_pass": not hard_fail, "hard_failures": hard_fail, "soft_pct": soft_pct, "checks": res}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("lp"); ap.add_argument("--segment", default=None); ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    lp = json.load(open(a.lp)); seg = json.load(open(a.segment)) if a.segment else None
    out = run_checks(lp, seg)
    if a.json: print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"HARD: {'PASS' if out['hard_pass'] else 'FAIL'}  |  soft: {out['soft_pct']}%")
        for r in out["checks"]:
            if not r["pass"]: print(f"  ✗ [{r['id']}] {r['name']}  {r['detail']}")
    sys.exit(0 if out["hard_pass"] else 1)
