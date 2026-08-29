#!/usr/bin/env python3
"""curriculum — the thin, plug-and-play CLI over the build pipeline.

The PRIMARY interface is an agent (the `curriculum-baked-lesson-plans` skill); this CLI is the
CI / non-agent front door. It ties the tools together so a human or a script can scaffold a
project and run the gates without knowing the internals.

    python3 curriculum/cli.py init  <dir> [--name "My Curriculum"]   # scaffold the A-F layout
    python3 curriculum/cli.py check <dir>                            # run BOTH gates, one verdict
    python3 curriculum/cli.py status <dir>                           # stage-by-stage progress

`check` is HANDS-OFF: it reports (folder-contract problems + SLO-code drift) and never raises —
matching the pipeline's hands-off gates. It exits non-zero only so CI can choose to fail on it;
pass `--soft` to always exit 0.
"""
import os, sys, json, argparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
import curriculum_scaffold          # noqa: E402
import segment_validate             # noqa: E402


def cmd_init(root, name):
    return curriculum_scaffold.create(root, name or os.path.basename(os.path.abspath(root)), 0, "")


def combined_check(root):
    """Run the folder-contract gate AND the SLO-code gate; return one combined verdict."""
    problems, notes, stats = curriculum_scaffold.check(root)
    folder = {"problems": problems, "notes": notes, "stats": stats}
    slo = segment_validate.validate_segmentation(os.path.join(root, "02_segmentation"))
    ok = (not problems) and slo["status"] == "clean"
    return {"folder": folder, "slo": slo, "ok": ok}


def cmd_status(root):
    _, _, stats = curriculum_scaffold.check(root)
    order = ["books", "pages", "segmented_books", "enriched", "lessons",
             "authored", "rendered", "voicenotes", "stamped"]
    print(f"curriculum: {root}")
    for k in order:
        if k in stats:
            print(f"  {k:16s} {stats[k]}")
    return stats


def _print_check(v):
    f, s = v["folder"], v["slo"]
    print(f"folder contract: {'PASS' if not f['problems'] else 'FAIL (%d)' % len(f['problems'])}")
    for p in f["problems"]:
        print(f"  ✗ {p}")
    print(f"SLO gate: {s['status'].upper()}  "
          f"({s['registry_size']} clean codes, {s['drift_occurrences']} drift)")
    if s["quarantine"]:
        print(f"  quarantine (re-code): {len(s['quarantine'])}")
    if s["auto_fixable"]:
        print(f"  auto-fixable (fused): {len(s['auto_fixable'])}")
    print("\n" + ("OK — clean" if v["ok"] else "ISSUES — see above (hands-off: nothing was blocked)"))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="curriculum", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("init"); pi.add_argument("dir"); pi.add_argument("--name", default=None)
    pc = sub.add_parser("check"); pc.add_argument("dir"); pc.add_argument("--soft", action="store_true")
    pc.add_argument("--json", action="store_true")
    ps = sub.add_parser("status"); ps.add_argument("dir")
    a = ap.parse_args(argv)
    root = os.path.abspath(os.path.expanduser(a.dir))

    if a.cmd == "init":
        cmd_init(root, a.name); return 0
    if a.cmd == "status":
        cmd_status(root); return 0
    if a.cmd == "check":
        v = combined_check(root)
        segment_validate.write_sidecar(os.path.join(root, "02_segmentation"), v["slo"])
        print(json.dumps(v, ensure_ascii=False, indent=2) if a.json else "", end="")
        if not a.json:
            _print_check(v)
        return 0 if (a.soft or v["ok"]) else 1


if __name__ == "__main__":
    sys.exit(main())
