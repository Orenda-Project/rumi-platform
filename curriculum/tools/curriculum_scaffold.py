#!/usr/bin/env python3
"""Create or CHECK a curriculum project against the A-F pipeline's folder contract.

The spine only pays off if every project puts its artifacts in the same place. When the layout
lives in someone's head or in a hardcoded path, another operator's curriculum is un-resumable by
anyone else. This script makes the layout a contract you can create, validate, and diff.

    THE LAYOUT (stage letters match the skill's spine)
    <project>/
      curriculum.json                                  manifest: name, universe, stage overrides
      01_page_truth/<book>/pg_###.json                 A  page-truth, one file per printed page
      01_page_truth/<book>/_book.json  _toc.json       A  offset + TOC (never scattered)
      02_segmentation/<book>_full_segments.json        B  lesson stubs
      03_enrichment/<book>/<lesson_id>.json            C  executable lesson bodies
      04_lesson_plans/<lesson_id>/_slide_script.json   D0 authored
      04_lesson_plans/<lesson_id>.pdf                  D  rendered
      04_lesson_plans/<lesson_id>/_pedagogy_review.json  D gate
      04_lesson_plans/<lesson_id>/_design_review.json    D gate
      05_voicenotes/<lesson_id>.mp3                    E  audio
      _fleet/*.events                                  run logs (optional)

Lesson ids are `grade_<n>_<subject>_ch<n>_seg<n>` — downstream tools parse that shape to attribute
a finished artifact to its lesson.

    python3 curriculum_scaffold.py <dir> --name "My Curriculum" [--universe 500]
    python3 curriculum_scaffold.py <dir> --check          # validate, exit 1 on problems
    python3 curriculum_scaffold.py <dir> --check --json   # machine-readable
"""
import argparse, glob, json, os, re, sys

DIRS = ["01_page_truth", "02_segmentation", "03_enrichment", "04_lesson_plans",
        "05_voicenotes", "_fleet"]
MANIFEST = "curriculum.json"
LESSON_RE = re.compile(r"^grade_\d+_[a-z0-9_]+_ch\d+_seg\d+$")
BOOK_RE = re.compile(r"^grade_\d+_[a-z0-9_]+$")


def create(root, name, universe, sheet_url):
    os.makedirs(root, exist_ok=True)
    for d in DIRS:
        os.makedirs(os.path.join(root, d), exist_ok=True)
    mpath = os.path.join(root, MANIFEST)
    if os.path.exists(mpath):
        print(f"manifest already exists: {mpath}"); return mpath
    man = {"name": name, "universe": universe,
           "_layout": "standard A-F (see curriculum_scaffold.py); omit `stages` to inherit it",
           "events_globs": ["_fleet/*.events"]}
    if sheet_url:
        man["sheet_url"] = sheet_url
    json.dump(man, open(mpath, "w"), indent=2)
    lpath = os.path.join(root, "_ledger.jsonl")
    if not os.path.exists(lpath):
        open(lpath, "a").close()
    print(f"created {root}")
    for d in DIRS:
        print(f"  {d}/")
    print(f"  {MANIFEST}   (name={name!r}, universe={universe})")
    print(f"  _ledger.jsonl   — STAMP EVERY COMPLETED UNIT HERE. "
          f"Without stamps, completion times and worker credit are guessed from file mtimes.")
    return mpath


def check(root):
    """Report every way this project would confuse the pipeline."""
    problems, notes, stats = [], [], {}
    if not os.path.isdir(root):
        return [f"{root} does not exist"], [], {}
    mpath = os.path.join(root, MANIFEST)
    if not os.path.exists(mpath):
        problems.append(f"no {MANIFEST} — downstream tools cannot discover this project "
                        f"(run without --check to create one)")
    else:
        try:
            man = json.load(open(mpath))
            if not man.get("name"):
                problems.append(f"{MANIFEST} has no `name`")
            if not man.get("universe"):
                notes.append(f"{MANIFEST} has no `universe`; stage totals will fall back to "
                             f"whatever has been produced so far, so progress reads 100% early")
        except Exception as e:
            problems.append(f"{MANIFEST} is not valid JSON: {e}")

    for d in DIRS:
        if not os.path.isdir(os.path.join(root, d)):
            problems.append(f"missing directory {d}/")

    # the completion ledger — the project's own record of WHEN each unit was finished, and by
    # whom. Without it every reader falls back to file mtime, which is when the BYTES last
    # changed (a re-run, a copy, an rsync all move it), not when the work was done.
    lpath = os.path.join(root, "_ledger.jsonl")
    if not os.path.exists(lpath):
        notes.append("no _ledger.jsonl — stages are not stamping completions, so completion "
                     "times and worker credit are INFERRED from file mtimes. Have each stage "
                     "append a stamp when it finishes a unit.")
    else:
        n = bad = 0
        for ln in open(lpath, errors="ignore"):
            ln = ln.strip()
            if not ln:
                continue
            try:
                r = json.loads(ln)
                if all(k in r for k in ("ts", "stage", "unit", "artifact")):
                    n += 1
                else:
                    bad += 1
            except Exception:
                bad += 1
        stats["stamped"] = n
        if bad:
            problems.append(f"_ledger.jsonl has {bad} malformed line(s) — each must be one JSON "
                            f"object with ts/stage/unit/artifact")

    # A — page truth
    books = [os.path.basename(p.rstrip("/")) for p in glob.glob(os.path.join(root, "01_page_truth", "*/"))]
    stats["books"] = len(books)
    for b in books:
        if not BOOK_RE.match(b):
            problems.append(f"01_page_truth/{b}: book dir must be grade_<n>_<subject>")
        bd = os.path.join(root, "01_page_truth", b)
        pages = glob.glob(os.path.join(bd, "pg_*.json"))
        stats["pages"] = stats.get("pages", 0) + len(pages)
        if not pages:
            problems.append(f"01_page_truth/{b}: no pg_###.json pages")
        for p in pages:
            if not re.match(r"^pg_\d{3}\.json$", os.path.basename(p)):
                problems.append(f"{os.path.relpath(p, root)}: pages must be pg_###.json "
                                f"(zero-padded, named by the PRINTED footer)")
                break
        if not os.path.exists(os.path.join(bd, "_book.json")):
            notes.append(f"01_page_truth/{b}: no _book.json (records the pdf/printed offset "
                         f"and any mid-book offset shift)")

    # B — segmentation
    segs = glob.glob(os.path.join(root, "02_segmentation", "*_full_segments.json"))
    stats["segmented_books"] = len(segs)
    for s in segs:
        stem = os.path.basename(s).replace("_full_segments.json", "")
        if books and stem not in books:
            problems.append(f"02_segmentation/{os.path.basename(s)}: no matching "
                            f"01_page_truth/{stem}/ — segmentation must name the same book")

    # C — enrichment lesson bodies (03_enrichment/<book>/<lesson_id>.json). This is where the
    # LESSONS live; leaving it unchecked let a misnamed body sprawl silently. Each book dir must
    # match a real book, and every *.json must be a clean <lesson_id>.json.
    for ebd in glob.glob(os.path.join(root, "03_enrichment", "*/")):
        b = os.path.basename(ebd.rstrip("/"))
        if books and b not in books:
            problems.append(f"03_enrichment/{b}/: no matching 01_page_truth/{b}/ — "
                            f"enrichment must name the same book")
        for f in glob.glob(os.path.join(ebd, "*.json")):
            stem = os.path.basename(f)[:-5]
            if not LESSON_RE.match(stem):
                problems.append(f"03_enrichment/{b}/{os.path.basename(f)}: lesson bodies must be "
                                f"<lesson_id>.json (grade_<n>_<subject>_ch<n>_seg<n>)")
                break
    stats["enriched"] = len(glob.glob(os.path.join(root, "03_enrichment", "*", "*.json")))

    # C/D/E — per-lesson artifacts
    lessons = {os.path.basename(p.rstrip("/"))
               for p in glob.glob(os.path.join(root, "04_lesson_plans", "*/"))}
    stats["lessons"] = len(lessons)
    bad = [l for l in lessons if not LESSON_RE.match(l)]
    if bad:
        problems.append(f"04_lesson_plans: {len(bad)} id(s) are not "
                        f"grade_<n>_<subject>_ch<n>_seg<n>, e.g. {sorted(bad)[:3]} — artifacts "
                        f"cannot be attributed to their lesson")
    stats["authored"] = len(glob.glob(os.path.join(root, "04_lesson_plans", "*", "_slide_script.json")))
    stats["rendered"] = len(glob.glob(os.path.join(root, "04_lesson_plans", "*.pdf")))
    stats["ped"] = len(glob.glob(os.path.join(root, "04_lesson_plans", "*", "_pedagogy_review.json")))
    stats["des"] = len(glob.glob(os.path.join(root, "04_lesson_plans", "*", "_design_review.json")))
    stats["voicenotes"] = len(glob.glob(os.path.join(root, "05_voicenotes", "*.mp3")))

    vn = {re.sub(r"\.mp3$", "", os.path.basename(p))
          for p in glob.glob(os.path.join(root, "05_voicenotes", "*.mp3"))}
    orphan = vn - lessons if lessons else set()
    if orphan:
        notes.append(f"05_voicenotes: {len(orphan)} audio file(s) with no matching lesson dir, "
                     f"e.g. {sorted(orphan)[:2]}")
    dupes = [p for p in glob.glob(os.path.join(root, "05_voicenotes", "*"))
             if re.sub(r"\.(mp3|ogg)$", "", p) != p and
             os.path.exists(re.sub(r"\.ogg$", ".mp3", p)) and p.endswith(".ogg")]
    if dupes:
        notes.append(f"05_voicenotes: {len(dupes)} lesson(s) have BOTH .mp3 and .ogg — "
                     f"one artifact per lesson is expected, but other tools may double-count")

    # STAMP COVERAGE — the point of the ledger. Producing artifacts without stamping them is the
    # state we are trying to leave behind: it forces every reader to infer completion times from
    # mtimes and to guess which seat did the work.
    produced = (stats.get("pages", 0) + stats.get("authored", 0) + stats.get("rendered", 0)
                + stats.get("ped", 0) + stats.get("des", 0) + stats.get("voicenotes", 0))
    stamped = stats.get("stamped", 0)
    stats["stamp_coverage"] = round(100 * stamped / produced) if produced else None
    if produced and stamped < produced * 0.9:
        (problems if stamped == 0 else notes).append(
            f"stamp coverage {stamped}/{produced} ({stats['stamp_coverage']}%) — "
            f"{'no' if not stamped else 'most'} artifacts carry a completion record, so their "
            f"times and their worker credit are inferred from mtime. Append a stamp to "
            f"_ledger.jsonl the moment each unit finishes.")
    return problems, notes, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir")
    ap.add_argument("--name"); ap.add_argument("--universe", type=int, default=0)
    ap.add_argument("--sheet-url", default="")
    ap.add_argument("--check", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    root = os.path.abspath(os.path.expanduser(a.dir))

    if not a.check:
        create(root, a.name or os.path.basename(root), a.universe, a.sheet_url)
        return 0

    problems, notes, stats = check(root)
    if a.json:
        print(json.dumps({"ok": not problems, "problems": problems,
                          "notes": notes, "stats": stats}, indent=2))
        return 1 if problems else 0
    print(f"curriculum: {root}")
    print("  " + " · ".join(f"{k}={v}" for k, v in stats.items()) or "  (empty)")
    for p in problems:
        print(f"  ✗ {p}")
    for n in notes:
        print(f"  · {n}")
    print("\n" + ("PASS — the layout is portable and readable"
                  if not problems else f"FAIL — {len(problems)} problem(s)"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
