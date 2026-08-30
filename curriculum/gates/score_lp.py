#!/usr/bin/env python3
"""Score one enriched LP against the migrated v3 rubric via OpenRouter — the local,
score-only batch path (D-017). Never generates; only judges.

Usage:
  export OPENROUTER_API_KEY=...   # your OpenRouter key
  python3 score_lp.py --lp <lp.json|lp.html> --subject English --grade 3 \
      [--judge anthropic/claude-opus-5] [--book-content <pagetruth_excerpt.txt>] [--out <report.json>]

Output JSON: {"score_pct", "total", "max", "criteria":[{id,name,points,max,checks:[...]}],
              "flags":[...], "judge_model", "usage":{prompt_tokens,completion_tokens,cost_usd_est}}

Judge is PINNED per batch (pass --judge); comparability requires one judge across a batch.
The composite gate = this score + the deterministic QA checks + research indicators
(see RUBRIC_DELTAS.md once the research clash-pass lands).
"""
import argparse, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from reviewer_rubric_v3 import get_active_rubric, grand_total_max  # noqa: E402
from reviewer_prompt_v3 import build_reviewer_prompt  # noqa: E402

OR_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_JUDGE = "anthropic/claude-opus-5"

def call_judge(judge, system, user, key):
    body = {
        "model": judge,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "usage": {"include": True},
    }
    req = urllib.request.Request(OR_URL, data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        d = json.load(resp)
    msg = d["choices"][0]["message"]["content"]
    usage = d.get("usage", {})
    return msg, usage

def tally(review, subject):
    """Sum points from the judge's per-check ratings; nulls (notAssessable) shrink the denominator."""
    rubric = get_active_rubric(subject)
    max_by_id = {}
    for c in rubric:
        for chk in c.get("checks", []):
            max_by_id[chk.get("id") or chk.get("name")] = 4
    total = 0; denom = 0; flags = []
    for crit in review.get("criteria", review.get("scores", [])):
        for chk in crit.get("checks", crit.get("subCriteria", [])):
            r = chk.get("rating", chk.get("score"))
            if r is None or chk.get("notAssessable"):
                flags.append(f"not-assessable: {chk.get('id') or chk.get('name')} ({chk.get('contextMissing','')})")
                continue
            total += int(r); denom += 4
            if int(r) == 1:
                flags.append(f"SCORE-1: {chk.get('id') or chk.get('name')}")
    return total, denom, flags

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lp", required=True)
    ap.add_argument("--subject", required=True)
    ap.add_argument("--grade", type=int, required=True)
    ap.add_argument("--judge", default=DEFAULT_JUDGE)
    ap.add_argument("--book-content", default=None, help="page-truth excerpt for textbook-alignment checks")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set")
    lp = open(a.lp).read()
    ctx = {"book_content"} if a.book_content else None
    system = build_reviewer_prompt(a.subject, available_context=ctx)
    user = f"GRADE: {a.grade}\nSUBJECT: {a.subject}\n\nLESSON PLAN TO REVIEW:\n{lp}"
    if a.book_content:
        user += f"\n\nBOOK CONTENT (page-truth excerpt, for alignment checks):\n{open(a.book_content).read()}"

    raw, usage = call_judge(a.judge, system, user, key)
    try:
        review = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{"); end = raw.rfind("}") + 1
        review = json.loads(raw[start:end])

    total, denom, flags = tally(review, a.subject)
    pct = round(100 * total / denom, 1) if denom else 0.0
    out = {"score_pct": pct, "total": total, "max": denom,
           "rubric_max": grand_total_max(a.subject), "flags": flags,
           "judge_model": a.judge, "usage": usage, "review": review}
    dst = a.out or (os.path.splitext(a.lp)[0] + ".score.json")
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=2)
    print(f"{pct}%  ({total}/{denom})  flags={len(flags)}  -> {dst}")

if __name__ == "__main__":
    main()
