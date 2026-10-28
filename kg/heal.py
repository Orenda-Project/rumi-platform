# heal.py v1.0.0 sha256=be31ae4068ed4eef627d3f9417a5c429f72a137e8d62a8ed30c264c1ada7212d — source: rumi-agent-home ops/kg/heal.py
"""heal — keep a repo's map true: rebuild the graph and re-render every door that already exists.

The one implementation behind all four self-healing loops (DESIGN §2.4), so they can never disagree:

    python3 heal.py heal      [--repo-root R] [--quiet]      # session Stop hook + nightly keeper
    python3 heal.py precommit [--repo-root R]                # git pre-commit step: heal, stage the result, warn only
    python3 heal.py check     [--repo-root R] [--base REF] [--strict] [--report FILE]   # CI gate (kg-check.yml)

It drives the repo-local `kg/kg.py` (+ `kg/doors.py`), or `ops/kg/kg.py` in the workspace that is their source.
`heal` never creates a door that does not exist yet and never adopts a hand-written CLAUDE.md: new doors are a
reader's job (they carry human blocks); this file only keeps the generated blocks of existing doors current.
Stdlib only, vendored as `kg/heal.py` next to the pair; repo-specific settings come from `kg/config.json`.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

VERSION = "1.0.0"
DOOR, INDEX = "CLAUDE.md", "CLAUDE.index.md"
META = "<!-- kg:meta "
MAP_HEAD = "## Map (generated)"
MAX_PASSES = 5   # a new door or index adds nodes to its own dir; seen needing 4 passes on a new file
# the common brief's rule 4 pattern (COS RULING 2), the same one kg.py skips files on
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|xox[abp]-|ntn_[A-Za-z0-9]{20,}|gh[pous]_[A-Za-z0-9]{20,}|sbp_[A-Za-z0-9]{20,}"
    r"|cfat_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9]{20,}|postgres(ql)?://[^ ]*:[^ ]*@|-----BEGIN [A-Z ]*PRIVATE KEY)")


def header_verifies(path):
    """Line 1 carries `sha256=<hex>` of the file. Two stamp conventions exist today and both are accepted until the
    lead rules: kg.py's (sha256 of the whole file with that hex zeroed — `kg vendor --stamp`) and doors.py's
    (sha256 of everything after line 1 — ops/kg/tests/stamp_doors_header.py). Any other edit fails both."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except (OSError, UnicodeDecodeError):
        return False
    first, _, rest = text.partition("\n")
    m = re.search(r"sha256=([0-9a-f]{64})", first)
    if not m:
        return False
    whole = hashlib.sha256(text.replace(m.group(1), "0" * 64, 1).encode("utf-8")).hexdigest()
    tail = hashlib.sha256(rest.encode("utf-8")).hexdigest()
    return m.group(1) in (whole, tail)


def log(quiet, *a):
    if not quiet:
        print(*a)


def find_tool(root):
    """The kg.py this repo carries: vendored kg/kg.py, else the workspace source ops/kg/kg.py."""
    for rel in (os.path.join("kg", "kg.py"), os.path.join("ops", "kg", "kg.py")):
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            return p
    return None


def load_kg_module(path):
    spec = importlib.util.spec_from_file_location("kg_tool_%d" % abs(hash(path)), path)
    mod = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True       # never leave __pycache__ next to a vendored file
    spec.loader.exec_module(mod)         # kg.py puts its own dir on sys.path and imports doors itself
    return mod


def git(root, *args, check=False):
    r = subprocess.run(["git", "-C", root] + list(args), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError("git %s: %s" % (" ".join(args), r.stderr.strip()))
    return r


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None


def generated_doors(root, doors_mod):
    """Every door the renderer owns (a CLAUDE.md carrying kg:meta), deepest first so parents see fresh titles."""
    out = []
    for p in doors_mod.door_files(root):
        d = os.path.dirname(p)
        if d and META in (read(os.path.join(root, p)) or "")[:4000]:
            out.append(d)
    return sorted(out, key=lambda x: (-x.count("/"), x))


def root_has_map(root):
    return MAP_HEAD in (read(os.path.join(root, DOOR)) or "")


def snapshot(root, dirs):
    """Contents of every file a render may touch, to tell what changed."""
    snap = {}
    for d in list(dirs) + [""]:
        for name in (DOOR, INDEX):
            p = os.path.join(d, name) if d else name
            snap[p] = read(os.path.join(root, p))
    for p in ("kg/manifest.json",):
        snap[p] = read(os.path.join(root, p))
    return snap


def build(mod, root, quiet=True, repo_name=None):
    argv = ["build", "--repo-root", root, "--quiet"] + (["--repo-name", repo_name] if repo_name else [])
    rc = mod.main(argv)
    if rc:
        raise RuntimeError("kg build exited %s" % rc)


def heal(root, quiet=False, tool=None, repo_name=None):
    """build → re-render existing generated doors (+ the root Map section) → repeat until nothing moves.
    Returns (changed paths, passes). A new CLAUDE.index.md adds a node to its dir, so a second pass may be needed."""
    root = os.path.abspath(root)
    tool = tool or find_tool(root)
    if not tool:
        raise RuntimeError("no kg/kg.py (or ops/kg/kg.py) under %s — the repo is not vendored" % root)
    mod = load_kg_module(tool)
    if getattr(mod, "doors", None) is None:
        raise RuntimeError("doors.py is not next to %s" % tool)
    dm = mod.doors
    changed, passes = set(), 0
    for passes in range(1, MAX_PASSES + 1):
        build(mod, root, repo_name=repo_name)
        dirs = generated_doors(root, dm)
        before = snapshot(root, dirs)
        g = mod.KG.load(root, None)
        need = set(g.dirs_needing_door())
        for d in dirs:
            try:
                dm.render_dir(g, d, need=need)
            except Exception as exc:  # a legacy file that lost its marker, a read error: report, never stop
                print("heal: %s: %s" % (d, exc), file=sys.stderr)
        if root_has_map(root):
            dm.render_root_map(g)
        after = snapshot(root, dirs)
        moved = {p for p in after if after[p] != before.get(p)} - {"kg/manifest.json"}
        changed |= {p for p in after if after[p] != before.get(p)}
        if not moved:
            break
    else:
        print("heal: still moving after %d passes (%s) — run it again" % (MAX_PASSES, ", ".join(sorted(moved))[:200]),
              file=sys.stderr)
    log(quiet, "heal %s: %d door(s), %d file(s) changed, %d pass(es)" % (
        os.path.basename(root), len(generated_doors(root, dm)), len(changed), passes))
    return sorted(changed), passes


# ------------------------------------------------------------------------------------------- precommit

def cmd_precommit(args):
    """Warn-only: heal, then stage what heal changed — but never a file that also has the author's unstaged edits."""
    root = os.path.abspath(args.repo_root)
    staged = [p for p in git(root, "diff", "--cached", "--name-only", "--diff-filter=ACMRD").stdout.splitlines() if p]
    if not staged:
        return 0
    dirty_before = set(git(root, "diff", "--name-only").stdout.splitlines())
    try:
        changed, _ = heal(root, quiet=True)
    except Exception as exc:
        print("kg pre-commit (warn only): map not refreshed — %s" % exc, file=sys.stderr)
        return 0
    stage, skipped = [], []
    for p in changed:
        full = os.path.join(root, p)
        tracked = git(root, "ls-files", "--error-unmatch", p).returncode == 0
        if p in dirty_before:
            skipped.append(p)
        elif os.path.exists(full) or tracked:
            stage.append(p)
    if stage:
        git(root, "add", "-A", "--", *stage)
        print("kg pre-commit: refreshed and staged %d map file(s): %s" % (len(stage), ", ".join(stage[:6]) +
                                                                          (" …" if len(stage) > 6 else "")))
    if skipped:
        print("kg pre-commit (warn): %d map file(s) re-rendered but NOT staged because they also hold your unstaged "
              "edits — review and `git add` them: %s" % (len(skipped), ", ".join(skipped)), file=sys.stderr)
    return 0


# ------------------------------------------------------------------------------------------- check (CI)

def secret_hits(root):
    files = [p for p in git(root, "ls-files", "-co", "--exclude-standard").stdout.splitlines()
             if p.startswith("kg/") or os.path.basename(p) in (DOOR, INDEX)]
    hits = []
    for p in files:
        txt = read(os.path.join(root, p)) or ""
        for i, ln in enumerate(txt.split("\n"), 1):
            if SECRET_RE.search(ln):
                hits.append("%s:%d" % (p, i))      # the location only — never the matched text
    return hits


def config(root):
    try:
        with open(os.path.join(root, "kg", "config.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def stats(mod, root, kg_dir=None):
    g = mod.KG.load(root, kg_dir)
    c = dict(g.manifest.get("counts", {}))
    c.update({k: v for k, v in g.coverage().items()})
    return c


DELTA_KEYS = ["files", "mappable_files", "purposes", "purposes_pct", "stale", "doors", "dirs_needing_door",
              "doors_pct", "edges", "edges_with_ev_pct", "unparsed_sql", "broken_links", "overflow_rows", "misses"]


def cmd_check(args):
    root = os.path.abspath(args.repo_root)
    tool = find_tool(root)
    fails, notes = [], []
    if not tool:
        print("kg check: no kg/kg.py in %s — nothing to check" % root)
        return 0
    mod = load_kg_module(tool)
    dm = mod.doors
    strict = args.strict or bool(config(root).get("ci_strict"))
    fix = "python3 %s heal --repo-root . && git add -A '*CLAUDE.md' '*CLAUDE.index.md' kg/ && git commit" % (
        os.path.relpath(os.path.abspath(__file__), root) if os.path.abspath(__file__).startswith(root + os.sep)
        else "kg/heal.py")

    # 1. the committed doors, judged as committed (after a fresh build of this commit)
    build(mod, root)
    g = mod.KG.load(root, None)
    for d in generated_doors(root, dm):
        probs = dm.check_dir(g, d, lenient=not strict)
        probs = [p for p in probs if not p.startswith("stale: the graph moved")]   # step 2 decides staleness
        if probs:
            fails.append("door %s: %s" % (d, " | ".join(probs)))
    if root_has_map(root):
        for p in dm.check_root(g):
            fails.append(p)

    # 2. regenerate: nothing committed may differ from what this commit's graph renders
    changed, _ = heal(root, quiet=True, tool=tool)
    drift = [p for p in changed if p != "kg/manifest.json"]
    drift += [p for p in git(root, "diff", "--name-only", "--", "kg/summaries").stdout.splitlines() if p]
    if drift:
        fails.append("map drift: %d committed map file(s) differ from what this commit renders: %s\n  fix: %s" % (
            len(drift), ", ".join(sorted(set(drift))[:20]), fix))

    # 3. vendored copies untouched (header self-hash), workspace source excluded
    for name in ("kg.py", "doors.py", "heal.py"):
        p = os.path.join(root, "kg", name)
        if os.path.isfile(p):
            if not header_verifies(p):
                fails.append("kg/%s edited after vendoring (header sha256 mismatch) — change it in rumi-agent-home "
                             "ops/kg/%s and re-vendor" % (name, name))

    # 4. secrets in anything the map commits
    hits = secret_hits(root)
    if hits:
        fails.append("secret pattern in map files at: %s (values not shown)" % ", ".join(hits[:20]))

    # 5. stats + delta against the base ref
    head = stats(mod, root)
    base = None
    if args.base:
        with tempfile.TemporaryDirectory() as td:
            rc = mod.main(["build", "--repo-root", root, "--ref", args.base, "--out", td, "--quiet"])
            if rc == 0:
                base = stats(mod, root, td)
            else:
                notes.append("base %s could not be built" % args.base)
    doors_changed = [p for p in git(root, "diff", "--name-only", "%s...HEAD" % args.base).stdout.splitlines()
                     if os.path.basename(p) in (DOOR, INDEX)] if args.base else []

    lines = ["### kg check — %s" % ("FAIL" if fails else "PASS"), ""]
    lines += ["- " + f.replace("\n", "\n  ") for f in fails] or ["- map is in step with the code"]
    lines += ["", "| metric | %shead |" % ("base | " if base else ""), "|---|%s---|" % ("---|" if base else "")]
    for k in DELTA_KEYS:
        hv = head.get(k)
        if base:
            bv = base.get(k)
            d = ""
            if isinstance(hv, (int, float)) and isinstance(bv, (int, float)) and hv != bv:
                d = " (%+g)" % round(hv - bv, 1)
            lines.append("| %s | %s | %s%s |" % (k, bv, hv, d))
        else:
            lines.append("| %s | %s |" % (k, hv))
    if doors_changed:
        lines += ["", "Doors changed in this PR (%d): %s" % (len(doors_changed), ", ".join(
            "`%s`" % p for p in doors_changed[:30]) + (" …" if len(doors_changed) > 30 else ""))]
    lines += ["", "Mode: %s. %s" % ("strict" if strict else "lenient (unsigned human blocks allowed)",
                                    " ".join(notes))]
    report = "\n".join(lines) + "\n"
    if args.report:
        with open(args.report, "w") as f:
            f.write(report)
    print(report)
    return 1 if fails else 0


def cmd_heal(args):
    try:
        heal(args.repo_root, quiet=args.quiet, repo_name=args.repo_name)
    except Exception as exc:
        print("kg heal: %s" % exc, file=sys.stderr)
        return 1
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="heal", description="keep doors + graph in step with the code")
    ap.add_argument("--version", action="version", version="heal.py " + VERSION)
    sub = ap.add_subparsers(dest="cmd")
    for name, fn in (("heal", cmd_heal), ("precommit", cmd_precommit), ("check", cmd_check)):
        p = sub.add_parser(name)
        p.add_argument("--repo-root", default=".")
        p.add_argument("--quiet", action="store_true")
        p.add_argument("--repo-name", help="GitHub repo name for node ids (default: kg/config.json, else origin)")
        p.set_defaults(func=fn)
        if name == "check":
            p.add_argument("--base", help="git ref to diff stats against (CI: origin/<base branch>)")
            p.add_argument("--strict", action="store_true", help="unsigned human blocks fail too (kg/config.json "
                                                                 "ci_strict: true does the same)")
            p.add_argument("--report", help="write the markdown report here (PR comment / step summary)")
    args = ap.parse_args(argv)
    if not getattr(args, "func", None):
        ap.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
