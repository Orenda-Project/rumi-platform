# doors.py v0.2.0 sha256=c0b0c337ccc24e577c60e28520136e64c277d637b3ed0cc0f983ce7df3277c9c — source: rumi-agent-home ops/kg/doors.py
"""Doors (directory CLAUDE.md files) and edit-time guard cards, rendered from the knowledge graph.

Contract C (door) is ops/kg/DOOR_FORMAT.md; contract E (card) is ops/kg/CARD_FORMAT.md. kg.py imports this module and
calls register()/build_cards()/overflow_rows(); it also runs standalone on a repo's committed `kg/` + generated `.kg/`:

    python3 kg/doors.py [--repo-root DIR] door render <dir>|--all [--adopt]
    python3 kg/doors.py [--repo-root DIR] door check  <dir>|--all [--lenient] [--no-kg]
    python3 kg/doors.py [--repo-root DIR] card <path>

Stdlib only. Nothing in this file names a workspace path, a repo, an env var or a table (it is vendored into public
repos).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

VERSION = "0.2.0"

DOOR = "CLAUDE.md"
INDEX = "CLAUDE.index.md"
DOOR_BUDGET = 2500
CARD_LINES = 15
CARD_BYTES = 1200
LOW_C = 0.8
BIG_DIR = 40          # every subdirectory of a directory with more children than this gets a door (D-9)
MIN_FILES = 3         # a directory with at least this many files gets a door (D-9)
PREFIX_MIN, PREFIX_MAX = 3, 15
COMPACT_SUBDIRS = 8   # more sub-directories than this → one row of links (each sub-door's title is one hop away)
COMPACT_NAMES = 5     # names shown in the "sub-dirs without a door" row; the index lists every one
TRIM_ORDER = [("Related (generated)", 2), ("Tests (generated)", 2), ("Who reads this (generated)", 4),
              ("Children (generated)", 1)]   # sibling files sharing a leading token are grouped only in this size range

SECTIONS = [
    ("Entry points", "human"),
    ("Children (generated)", "gen"),
    ("Who reads this (generated)", "gen"),
    ("Never (human)", "human"),
    ("Tests (generated)", "gen"),
    ("Related (generated)", "gen"),
]
GEN = [s for s, k in SECTIONS if k == "gen"]
HUMAN = [s for s, k in SECTIONS if k == "human"]
MAP_HEAD = "## Map (generated)"

PLACEHOLDER = "<!-- human: unwritten -->"
TITLE_PLACEHOLDER = "(unwritten: what this directory is)"
READ_RE = re.compile(r"<!-- read: \S+ \d{4}-\d{2}-\d{2} -->")
META_RE = re.compile(r"<!-- kg:meta ([^>]*?) -->")
MAP_META_RE = re.compile(r"<!-- kg:map ([^>]*?) -->")
EV_RE = re.compile(r"`([^`\n]+?):(\d+):([0-9a-f]{8})`")
TICK_RE = re.compile(r"`([^`\n]+)`")
INDEX_LINE = "Full index: `%s`" % INDEX
VERSION_RE = re.compile(r"^(.*?)[._-]?v(\d+)((?:\.[A-Za-z0-9]+)+)$")
FILE_KINDS = ("file", "doc", "flow", "hook", "report", "skill")
RELATED_KINDS = [("skill", "skills"), ("bead", "beads"), ("doc", "docs"), ("report", "reports"),
                 ("service", "service"), ("feature", "features"), ("flow", "flows")]
SKIP_DIRS = {".git", "node_modules", ".kg", "dist", "build", ".next", "coverage", "__pycache__", ".venv", "venv"}


# --------------------------------------------------------------------------------------------- small helpers

def line_hash(line):
    """sha1[:8] of the line with every whitespace character removed (same as kg.py line_hash)."""
    return hashlib.sha1("".join(line.split()).encode()).hexdigest()[:8]


def sha12(text):
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def parent(path):
    return os.path.dirname(path) if path else None


def rel_to(path, d):
    return path[len(d) + 1:] if d and path.startswith(d + "/") else path


def nbytes(text):
    return len(text.encode())


def q(c):
    return "?" if c is not None and c < LOW_C else ""


def read_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None


def write_if_changed(path, text):
    if read_text(path) == text:
        return False
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def ev_line(ev):
    path, line, _ = ev.rsplit(":", 2)
    return path, int(line)


def ev_display(ev):
    """`path:line` for cards (the hash is for machines; the card is for a reader)."""
    path, line = ev_line(ev)
    return "%s:%d" % (path, line)


def find_root(start):
    d = os.path.abspath(start if os.path.isdir(start) else os.path.dirname(start) or ".")
    while True:
        if os.path.isdir(os.path.join(d, ".kg")) or os.path.isdir(os.path.join(d, "kg")):
            return d
        up = os.path.dirname(d)
        if up == d:
            return os.path.abspath(start if os.path.isdir(start) else ".")
        d = up


# --------------------------------------------------------------------------------------------- the graph

class MiniKG:
    """Read-only loader of `.kg/nodes.jsonl`, `.kg/edges.jsonl`, `kg/summaries/*.jsonl`, `kg/manifest.json`.

    Used when doors.py runs standalone; inside kg.py its own KG object is used, and any method it lacks falls back
    to this one (see Facade)."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.manifest = {}
        m = read_text(os.path.join(self.root, "kg", "manifest.json"))
        if m:
            try:
                self.manifest = json.loads(m)
            except ValueError:
                pass
        self.repo = self.manifest.get("repo") or os.path.basename(self.root)
        self.nodes, self.edges = {}, []
        for name, sink in (("nodes.jsonl", None), ("edges.jsonl", self.edges)):
            text = read_text(os.path.join(self.root, ".kg", name)) or ""
            for line in text.splitlines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                if sink is None:
                    self.nodes[obj["id"]] = obj
                else:
                    sink.append(obj)
        self.summaries = {}
        sdir = os.path.join(self.root, "kg", "summaries")
        if os.path.isdir(sdir):
            for fn in sorted(os.listdir(sdir)):
                if fn.endswith(".jsonl"):
                    for line in (read_text(os.path.join(sdir, fn)) or "").splitlines():
                        if line.strip():
                            s = json.loads(line)
                            self.summaries[s["id"]] = s
        self._out, self._in = {}, {}
        for e in self.edges:
            self._out.setdefault(e["s"], []).append(e)
            self._in.setdefault(e["o"], []).append(e)
        self._by_path = {}
        self._dirs = set()
        for n in self.nodes.values():
            p = n.get("path")
            if p is None:
                continue
            if n.get("kind") == "dir":
                self._dirs.add(p)
            elif n.get("kind") in FILE_KINDS:
                cur = self._by_path.get(p)
                if cur is None or n["kind"] == "file":
                    self._by_path[p] = n["id"]
        for p in list(self._by_path):
            d = parent(p)
            while d is not None:
                self._dirs.add(d)
                d = parent(d)
        self._kids = {}
        for p in self._by_path:
            self._kids.setdefault(parent(p), []).append(p)
        for d in self._dirs:
            if d:
                self._kids.setdefault(parent(d), []).append(d + "/")

    def node(self, nid):
        return self.nodes.get(nid)

    def file_id(self, path):
        return self._by_path.get(path)

    def out_edges(self, nid, p=None):
        return [e for e in self._out.get(nid, []) if p is None or e["p"] == p]

    def in_edges(self, nid, p=None):
        return [e for e in self._in.get(nid, []) if p is None or e["p"] == p]

    def children(self, d):
        """Sorted child paths of dir d: files as `path`, dirs as `path/`."""
        return sorted(self._kids.get(d, []))

    def is_dir(self, d):
        return d in self._dirs

    def purpose(self, path):
        nid = self._by_path.get(path) or "%s:dir:%s" % (self.repo, path)
        s = self.summaries.get(nid)
        return s.get("purpose") if s else None

    def check_ev(self, ev, token=None):
        return check_ev_file(self.root, ev, token)

    def consumers(self, nid):
        """Who reads what this node produces: importers, and readers of the tables/columns it writes."""
        out = []
        for e in self.in_edges(nid, "imports"):
            out.append({"via": "import", "consumer": e["s"], "ev": e.get("ev"), "c": e.get("c", 1.0)})
        for e in self.out_edges(nid):
            if e["p"] not in ("writes_table", "writes_column"):
                continue
            targets = [e["o"]]
            if e["p"] == "writes_column":
                tname = e["o"].split(":", 2)[2].split(".")[0]
                targets.append("%s:table:%s" % (e["o"].split(":", 1)[0], tname))
            for t in targets:
                for r in self.in_edges(t):
                    if r["p"] in ("reads_table", "reads_column") and r["s"] != nid:
                        kind = self.nodes.get(t, {}).get("kind") or t.split(":")[1]
                        out.append({"via": "%s:%s" % (kind, t.split(":", 2)[2]), "consumer": r["s"],
                                    "ev": r.get("ev"), "c": min(e.get("c", 1.0), r.get("c", 1.0))})
        seen, uniq = set(), []
        for c in out:
            k = (c["via"], c["consumer"], c["ev"])
            if k not in seen:
                seen.add(k)
                uniq.append(c)
        return uniq

    def slice_hash(self, d):
        ids = set()
        for p in self.children(d):
            if p.endswith("/"):
                ids.add("%s:dir:%s" % (self.repo, p[:-1]))
            else:
                ids.add(self._by_path[p])
        lines = [json.dumps(self.nodes.get(i, {"id": i}), sort_keys=True) for i in sorted(ids)]
        lines += sorted(json.dumps(e, sort_keys=True) for e in self.edges
                        if e["p"] != "contains" and (e["s"] in ids or e["o"] in ids))
        lines += sorted(json.dumps(self.summaries[i], sort_keys=True) for i in ids if i in self.summaries)
        return sha12("\n".join(lines))

    def dirs_needing_door(self):
        files = {d: 0 for d in self._dirs}
        for p in self._by_path:
            files[parent(p)] = files.get(parent(p), 0) + 1
        need = set()
        for d in self._dirs:
            if not d or excluded_dir(d):
                continue
            kids = self.children(d)
            if files.get(d, 0) >= MIN_FILES:
                need.add(d)
            if len(kids) > BIG_DIR:
                need.update(k[:-1] for k in kids if k.endswith("/") and not excluded_dir(k[:-1]))
            for p in kids:
                if p.endswith("/"):
                    continue
                nid = self._by_path[p]
                if self.nodes[nid].get("kind") == "flow" or self.out_edges(nid, "deployed_as"):
                    need.add(d)
        for d in list(need):
            a = parent(d)
            while a:
                if not excluded_dir(a):
                    need.add(a)
                a = parent(a)
        return sorted(need)


def excluded_dir(d):
    parts = d.split("/")
    if any(p in SKIP_DIRS for p in parts):
        return True
    # D-10: a skill folder's SKILL.md is already its entry; Harness V2 owns that surface.
    for i in range(len(parts) - 2):
        if parts[i] == ".claude" and parts[i + 1] == "skills":
            return True
    return False


class Facade:
    """The one graph view the renderer uses. Over MiniKG it is a pass-through; over kg.py's KG it adapts the four
    methods whose shapes differ (children, is_dir, consumers, dirs_needing_door stays kg.py's own so `kg stats` and
    the doors count the same directories) and falls back to MiniKG only for a method kg.py does not have."""

    def __init__(self, kg):
        self._kg = kg
        self._native = isinstance(kg, MiniKG)
        self._mini = kg if self._native else None

    def _fallback(self):
        if self._mini is None:
            self._mini = MiniKG(self._kg.root)
        return self._mini

    def __getattr__(self, name):
        v = getattr(self._kg, name, None)
        if v is None:
            v = getattr(self._fallback(), name)
        return v

    def _dirs(self):
        if not hasattr(self, "_dirset"):
            self._dirset = {n["path"] for n in self._kg.nodes.values() if n.get("kind") == "dir" and n.get("path")}
            self._dirset.add("")
        return self._dirset

    def is_dir(self, d):
        return self._kg.is_dir(d) if self._native else d in self._dirs()

    def children(self, d):
        """Sorted child paths of d: files as `path`, dirs as `path/` (node ids from kg.py are mapped to paths)."""
        if self._native:
            return self._kg.children(d)
        out = set()
        for cid in self._kg.children(d):
            n = self._kg.nodes.get(cid) or {}
            p = n.get("path")
            if not p:
                continue
            if n.get("kind") == "dir":
                out.add(p.rstrip("/") + "/")
            elif n.get("kind") in FILE_KINDS:
                out.add(p)
        return sorted(out)

    def consumers(self, nid):
        """[{via: 'import' | 'table:<t>' | 'column:<t.c>', consumer: <node id>, ev, c, live}] — tests and deploy
        targets are left to the Tests and Related sections."""
        if self._native:
            return self._kg.consumers(nid)
        out = []
        for c in self._kg.consumers(nid):
            via = c.get("via", "")
            m = re.match(r"reads (table )?(\S+?)(\.\*)? .*\(written here\)$", via)
            if via == "imports it":
                v = "import"
            elif m:
                obj = m.group(2) + (m.group(3) or "")
                v = ("table:%s" if m.group(1) or "." not in obj else "column:%s") % obj
                star = [e for e in self._kg.out_edges(c.get("id") or "", "reads_column")
                        if e.get("ev") == c.get("ev") and e["o"].endswith(".*")]
                if star:   # a whole-row read (`select *`): its line names `*`, not the column
                    v = "rowstar:%s" % star[0]["o"].split(":", 2)[2][:-2]
            else:
                continue
            out.append({"via": v, "consumer": c.get("id") or c.get("consumer"), "ev": c.get("ev"),
                        "c": c.get("c", 1.0), "live": c.get("live")})
        return out


def load_kg(root):
    return Facade(MiniKG(root))


def facade(kg):
    return kg if isinstance(kg, Facade) else Facade(kg)


def check_ev_file(root, ev, token=None, _cache={}):
    """ok | moved | changed | missing | token — content-anchored evidence check."""
    path, line = ev_line(ev)
    h = ev.rsplit(":", 1)[1]
    full = os.path.join(root, path)
    key = (full, os.path.getmtime(full) if os.path.exists(full) else None)
    if key not in _cache:
        _cache[key] = (read_text(full) or "").split("\n") if key[1] is not None else None
    lines = _cache[key]
    if lines is None:
        return "missing"
    if 1 <= line <= len(lines) and line_hash(lines[line - 1]) == h:
        toks = (token,) if isinstance(token, str) else tuple(token or ())
        if toks and not any(t in lines[line - 1] for t in toks):
            return "token"
        return "ok"
    for ln in lines:
        if line_hash(ln) == h:
            return "moved"
    return "changed"


# --------------------------------------------------------------------------------------------- parsing doors

def parse_door(text):
    """-> dict(title, has_index_line, meta, sections{name: body}, order[list], legacy: bool)."""
    lines = text.split("\n")
    out = {"title": lines[0] if lines else "", "meta": {}, "sections": {}, "order": [], "index_line": False}
    m = META_RE.search(text)
    if not m:
        out["legacy"] = True
        out["body"] = "\n".join(lines[1:]).strip("\n")
        return out
    out["legacy"] = False
    out["meta"] = dict(kv.split("=", 1) for kv in m.group(1).split() if "=" in kv)
    out["index_line"] = len(lines) > 1 and lines[1] == INDEX_LINE
    cur = None
    buf = []
    for ln in lines[1:]:
        if ln.startswith("## "):
            if cur is not None:
                out["sections"][cur] = "\n".join(buf).strip("\n")
            cur = ln[3:].strip()
            out["order"].append(cur)
            buf = []
        elif cur is not None:
            buf.append(ln)
    if cur is not None:
        out["sections"][cur] = "\n".join(buf).strip("\n")
    return out


def never_lines(dir_abs):
    """The `- ` lines of a door's `## Never (human)` block, without comments; [] when there is none."""
    text = read_text(os.path.join(dir_abs, DOOR))
    if not text or not META_RE.search(text):
        return []
    body = parse_door(text)["sections"].get("Never (human)", "")
    res = []
    for ln in body.split("\n"):
        ln = re.sub(r"<!--.*?-->", "", ln).strip()
        if ln.startswith("- ") and len(ln) > 2:
            res.append(ln[2:].strip())
    return res


def door_title_text(dir_abs):
    """The human one-liner from a door's title, or None."""
    text = read_text(os.path.join(dir_abs, DOOR))
    if not text:
        return None
    first = text.split("\n", 1)[0]
    if " — " in first and TITLE_PLACEHOLDER not in first:
        return first.split(" — ", 1)[1].strip()
    return None


# --------------------------------------------------------------------------------------------- generated rows

class Rows:
    """One generated section: a ranked list of rows plus an optional fixed header (table head)."""

    def __init__(self, name, head=None, more_fmt="- … %d more → `" + INDEX + "`"):
        self.name, self.head, self.more_fmt = name, head or [], more_fmt
        self.rows = []        # (rank, text) — higher rank kept first when trimming
        self.full = []        # every row, ungrouped, for the index
        self.cut = 0

    def add(self, rank, text, full=None):
        self.rows.append((rank, text))
        if full is not None:
            self.full.extend(full if isinstance(full, list) else [full])

    def sort(self):
        self.rows.sort(key=lambda r: (-r[0], r[1]))

    def hidden(self):
        """Rows of the index an agent does not see in the door (F-2): index rows minus door rows. Rows trimmed,
        grouped or folded into a compact row all count; `cut` alone under-counted 49 of 81 doors."""
        return max(len(self.full) - len(self.rows), self.cut) if self.full else self.cut

    def body(self, door=True):
        if door:
            rows = [t for _, t in self.rows]
            if not rows and not self.cut:
                return "- (none)"
            more = [self.more_fmt % self.hidden()] if self.cut else []
            return "\n".join(self.head + rows + more)
        rows = self.full or [t for _, t in self.rows]
        return "\n".join(self.head + rows) if rows else "- (none)"


def file_kids(kg, d):
    """Files directly in d, minus the door and its index: they are this page, not something on it (LR-13)."""
    return [p for p in kg.children(d) if not p.endswith("/") and os.path.basename(p) not in (DOOR, INDEX)]


def dir_kids(kg, d):
    return [p[:-1] for p in kg.children(d) if p.endswith("/")]


def edge_rank(kg, path):
    nid = kg.file_id(path)
    return len(kg.in_edges(nid)) if nid else 0


def only_tests(kg, d):
    """True when every file under d is a test (so its parent's Tests section already covers it)."""
    files, stack = [], [d]
    while stack:
        cur = stack.pop()
        for p in kg.children(cur):
            (stack.append(p[:-1]) if p.endswith("/") else files.append(p))
    return bool(files) and all(is_test_path(p) for p in files)


def file_count(kg, d):
    n = 0
    stack = [d]
    while stack:
        cur = stack.pop()
        for p in kg.children(cur):
            if p.endswith("/"):
                stack.append(p[:-1])
            else:
                n += 1
    return n


def children_rows(kg, d, need, group):
    sec = Rows("Children (generated)", ["| path | purpose |", "|---|---|"],
               "| … | %d more → `" + INDEX + "` |")
    subs = dir_kids(kg, d)
    if len(subs) > COMPACT_SUBDIRS:
        with_door = [x for x in subs if x in need or os.path.exists(os.path.join(kg.root, x, DOOR))]
        no_door = [x for x in subs if x not in with_door]
        if with_door:
            row = "| %d sub-dirs, each with `%s` | %s |" % (
                len(with_door), DOOR, " · ".join("`%s/`" % rel_to(x, d) for x in with_door))
            sec.add(10 ** 7, row)
        if no_door:
            names = ["`%s/` (%d%s)" % (rel_to(x, d), file_count(kg, x), " tests" if only_tests(kg, x) else "")
                     for x in no_door[:COMPACT_NAMES]]
            if len(no_door) > COMPACT_NAMES:
                names.append("+%d more → `%s`" % (len(no_door) - COMPACT_NAMES, INDEX))
            sec.add(10 ** 7 - 1, "| %d sub-dirs without a door | %s |" % (len(no_door), " · ".join(names)))
        subs_rows_only_in_index = True
    else:
        subs_rows_only_in_index = False
    for sub in subs:
        name = rel_to(sub, d) + "/"
        door_here = os.path.exists(os.path.join(kg.root, sub, DOOR))
        if sub in need or door_here:
            what = door_title_text(os.path.join(kg.root, sub)) or kg.purpose(sub) or "(no description yet)"
            row = "| `%s` | %s → `%s%s` |" % (name, what, name, DOOR)
        else:
            n = file_count(kg, sub)
            row = "| `%s` | → (no door; %s) |" % (name, no_door_count(kg, sub, n))
        if subs_rows_only_in_index:
            sec.full.append(row)
        else:
            sec.add(10 ** 6, row, row)   # sub-directories are hops: keep them before any file
    # tracked directories the graph excludes (dist/, vendor/ …) still get a row: nothing is silently absent (B7)
    for x, n in sorted(((kg.manifest or {}).get("excluded_dirs") or {}).items()):
        if parent(x) == d:
            row = "| `%s/` | → (not mapped: excluded; %d files) |" % (rel_to(x, d), n)
            sec.add(10 ** 6 - 1, row, row)
    files = file_kids(kg, d)
    full = {p: "| `%s` | %s |" % (rel_to(p, d), kg.purpose(p) or "(unmapped)") for p in files}
    sec.full.extend(full[p] for p in files)
    if not group:
        for p in files:
            sec.add(edge_rank(kg, p), full[p])
        return sec
    for fam in families(kg, d, files):
        if len(fam["members"]) == 1:
            p = fam["members"][0]
            sec.add(edge_rank(kg, p), full[p])
        else:
            sec.add(max(edge_rank(kg, p) for p in fam["members"]), fam["row"])
    return sec


TEST_FILE = re.compile(r"^(test_.*\.py|.*_test\.(py|go)|.*\.(test|spec)\.[a-z]+)$")


def no_door_count(kg, d, n):
    """LR-2 row text: 'N tests' when every file under d is a test by name; a tests/ dir that also holds __init__.py
    or fixtures says 'N files: T test + S support' (VERDICT #349, ported from its branch); otherwise 'N files'."""
    if not only_tests(kg, d):
        return "%d files" % n
    files, stack = [], [d]
    while stack:
        cur = stack.pop()
        for p in kg.children(cur):
            (stack.append(p[:-1]) if p.endswith("/") else files.append(p))
    t = sum(1 for p in files if TEST_FILE.match(os.path.basename(p)))
    return "%d tests" % n if t == n else "%d files: %d test + %d support" % (n, t, n - t)


def families(kg, d, files):
    """Group sibling files: versioned families (x.v1.js … x.v9.js), then shared-prefix families (`<token>-*`)."""
    left, fams = list(files), []
    ver = {}
    for p in left:
        m = VERSION_RE.match(rel_to(p, d))
        if m:
            ver.setdefault((m.group(1), m.group(3)), []).append((int(m.group(2)), p))
    used = set()
    for (stem, ext), mem in sorted(ver.items()):
        if len(mem) < 2:
            continue
        mem.sort()
        imported = [v for v, p in mem if kg.file_id(p) and kg.in_edges(kg.file_id(p), "imports")]
        live = (" — v%d imported" % max(imported)) if imported else ""
        top = mem[-1][1]
        purpose = kg.purpose(top) or "(unmapped)"
        row = "| `%s.v*%s` | %d versions%s; v%d: %s |" % (stem, ext, len(mem), live, mem[-1][0], purpose)
        fams.append({"members": [p for _, p in mem], "row": row})
        used.update(p for _, p in mem)
    left = [p for p in left if p not in used]
    pre = {}
    for p in left:
        tok = re.split(r"[-_.]", rel_to(p, d), maxsplit=1)[0]
        if len(tok) >= 2 and tok != rel_to(p, d):
            pre.setdefault(tok, []).append(p)
    for tok, mem in sorted(pre.items()):
        if not PREFIX_MIN <= len(mem) <= PREFIX_MAX:   # a 60-file "family" is not a family, it is the directory
            continue
        best = max(mem, key=lambda p: (edge_rank(kg, p), p))
        row = "| `%s*` | %d files; most used `%s`: %s |" % (tok, len(mem), rel_to(best, d),
                                                          kg.purpose(best) or "(unmapped)")
        fams.append({"members": mem, "row": row})
        used.update(mem)
    fams.extend({"members": [p]} for p in left if p not in used)
    return fams


TEST_PATH = re.compile(r"(^|/)(__tests__|__mocks__|tests?|spec|e2e)/|\.(test|spec)\.[a-z]+$")


def is_test_path(path):
    return bool(TEST_PATH.search(path))


def index_list(items, subject, cap=4):
    """The index keeps every row but not every edge: past `cap` items it points at the query that lists them all."""
    if len(items) <= cap:
        return " · ".join(items)
    return " · ".join(items[:cap]) + " (+%d: `python3 kg/kg.py who-reads %s`)" % (len(items) - cap, subject)


def who_reads_rows(kg, d):
    """Importers per file (tests excluded: they are in Tests), then data consumers per table/column across the
    directory's writers, then the env names read here. One `ev` per consumer file; outside consumers first."""
    sec = Rows("Who reads this (generated)")
    envs, data = {}, {}
    inside = "%s:file:%s/" % (kg.repo, d)

    def pick(cs):
        best = {}
        for c in cs:
            path = c["consumer"].split(":", 2)[-1]
            if not c.get("ev") or is_test_path(path):
                continue
            if path not in best or c["ev"] < best[path]["ev"]:
                best[path] = c
        # production code first: a consumer that is itself imported or deployed outranks a one-off leaf script
        def live(c):
            if c.get("live") is not None:
                return c["live"]
            return bool(kg.in_edges(c["consumer"], "imports") or kg.out_edges(c["consumer"], "deployed_as"))
        return sorted(best.values(), key=lambda c: (c["consumer"].startswith(inside), not live(c), c["consumer"]))

    for p in file_kids(kg, d):
        nid = kg.file_id(p)
        if not nid:
            continue
        name = rel_to(p, d)
        imps = []
        for c in kg.consumers(nid):
            if c["via"] == "import":
                imps.append(c)
            else:
                ent = data.setdefault(c["via"], {"writers": set(), "cs": []})
                ent["writers"].add(name)
                ent["cs"].append(c)
        cs = pick(imps)
        if cs:
            evs = ["`%s`%s" % (c["ev"], q(c.get("c"))) for c in cs]
            lead = "- `%s` ← imported by " % name
            more = " (+%d)" % (len(evs) - 2) if len(evs) > 2 else ""
            sec.add(len(evs), lead + " · ".join(evs[:2]) + more, lead + index_list(evs, name))
        for e in kg.out_edges(nid, "reads_env"):
            if e.get("k") == "test" or is_test_path(p):   # a test setting up env is not a reader (F-4)
                continue
            envs.setdefault(e["o"].split(":", 2)[2], []).append(e)
    for via, ent in sorted(data.items()):
        cs = pick(ent["cs"])
        if not cs:
            continue
        kind, obj = via.split(":", 1)
        w = sorted(ent["writers"])
        wtxt = "`%s`" % w[0] + (" (+%d)" % (len(w) - 1) if len(w) > 1 else "")
        evs = ["`%s`%s" % (c["ev"], q(c.get("c"))) for c in cs]
        what = "table `%s` whole row (`*`)" % obj if kind == "rowstar" else "%s `%s`" % (kind, obj)
        lead = "- %s (written by %s) ← read by " % (what, wtxt)
        more = " (+%d)" % (len(evs) - 2) if len(evs) > 2 else ""
        full = "- %s (written by %s) ← read by " % (what, ", ".join("`%s`" % x for x in w))
        sec.add(len(evs), lead + " · ".join(evs[:2]) + more, full + index_list(evs, obj))
    if envs:
        names = sorted(envs)
        shown = names[:12]
        row = "- env read here: " + " · ".join("`%s`" % n for n in shown) + \
            (" (+%d)" % (len(names) - 12) if len(names) > 12 else "")
        full = ["- env `%s` read at %s" % (n, " · ".join("`%s`" % e["ev"] for e in envs[n] if e.get("ev")))
                for n in names]
        sec.add(-1, row, full)
    return sec


def tests_rows(kg, d, cfg):
    """Door: test files ranked by how many files here they cover. Index: one row per source file, its tests capped."""
    sec = Rows("Tests (generated)")
    tests, per_src = {}, {}
    for p in file_kids(kg, d):
        nid = kg.file_id(p)
        if not nid:
            continue
        for e in kg.out_edges(nid, "tested_by"):
            t = (kg.node(e["o"]) or {}).get("path") or e["o"].split(":", 2)[2]
            tests.setdefault(t, []).append((rel_to(p, d), e.get("c", 1.0)))
            per_src.setdefault(rel_to(p, d), {})[t] = min(per_src.get(rel_to(p, d), {}).get(t, 1.0), e.get("c", 1.0))
    for t, subs in sorted(tests.items()):
        c = min(x[1] for x in subs)
        sec.add(len(subs), "- `%s`%s (%s)" % (t, q(c), ", ".join(sorted({s_ for s_, _ in subs}))))
    for src, ts in sorted(per_src.items()):
        items = ["`%s`%s" % (t, q(c)) for t, c in sorted(ts.items())]
        sec.full.append("- `%s` ← %s" % (src, index_list(items, os.path.join(d, src), cap=6)))
    cmd = test_command(cfg, sorted(tests))
    if cmd:
        sec.add(10 ** 6, "- run: `%s`" % cmd, "- run: `%s`" % cmd)
    return sec


def test_command(cfg, paths):
    """A run line only when the repo's kg/config.json says how its tests run (a door claims nothing it cannot cite)."""
    tc = (cfg or {}).get("test_cmd") or {}
    if not paths or not tc:
        return None
    by_ext = {}
    for p in paths:
        by_ext.setdefault(os.path.splitext(p)[1].lstrip("."), []).append(p)
    cmds = []
    for ext, ps in sorted(by_ext.items()):
        fmt = tc.get(ext) or tc.get("*")
        if fmt:
            cmds.append(fmt.replace("{paths}", " ".join(ps[:3])))
    return " ; ".join(cmds) if cmds else None


def related_items(kg, ids, skip_dir=None):
    found = {}
    for nid in ids:
        for e in kg.in_edges(nid) + kg.out_edges(nid):
            if e["p"] not in ("documented_in", "mentions", "implements", "deployed_as"):
                continue
            other = e["o"] if e["s"] == nid else e["s"]
            n = kg.node(other) or {}
            op = n.get("path") or ""
            if os.path.basename(op) == INDEX or op == os.path.join(skip_dir or "", DOOR):
                continue   # a generated index (anywhere) or this door itself is not a related doc
            kind = "bead" if other.startswith("bead:") else (n.get("kind") or other.split(":")[1])
            label = n.get("name") or other.split(":", 2)[-1]
            if kind in ("doc", "report"):
                path = n.get("path") or other.split(":", 2)[2]
                repo = other.split(":", 1)[0]
                label = path if repo == kg.repo else "%s:%s" % (repo, path)
            if kind == "service":
                label = n.get("name") or other.split(":", 2)[2]
            cur = found.setdefault(kind, {})
            cur[label] = max(cur.get(label, 0), e.get("c", 1.0))
    return found


def related_rows(kg, d):
    sec = Rows("Related (generated)")
    ids = [kg.file_id(p) for p in file_kids(kg, d)]
    ids = [i for i in ids if i] + ["%s:dir:%s" % (kg.repo, d)]
    found = related_items(kg, ids, skip_dir=d)
    for i, (kind, label) in enumerate(RELATED_KINDS):
        items = found.get(kind)
        if not items:
            continue
        names = sorted(items, key=lambda k: (-items[k], k))
        fmt = (lambda n: "%s%s" % (n, q(items[n]))) if kind == "bead" else (lambda n: "`%s`%s" % (n, q(items[n])))
        shown = [fmt(n) for n in names[:6]]
        more = " (+%d)" % (len(names) - 6) if len(names) > 6 else ""
        sec.add(len(RELATED_KINDS) - i, "- %s: %s%s" % (label, " · ".join(shown), more),
                "- %s: %s" % (label, " · ".join(fmt(n) for n in names)))
    return sec


def repo_config(kg):
    cfg = getattr(kg, "config", None)
    if isinstance(cfg, dict):
        return cfg
    text = read_text(os.path.join(kg.root, "kg", "config.json"))
    try:
        return json.loads(text) if text else {}
    except ValueError:
        return {}


# --------------------------------------------------------------------------------------------- rendering

class LegacyDoor(Exception):
    """The directory already has a hand-written CLAUDE.md that is not a door (pass adopt=True to convert it)."""


def kg_version(kg):
    return (getattr(kg, "manifest", None) or {}).get("kg_py") or "standalone"


def compose(title, index_line, meta, human, gen):
    parts = [title]
    if index_line:
        parts.append(INDEX_LINE)
    parts += ["", meta, ""]
    for name, kind in SECTIONS:
        body = human[name] if kind == "human" else gen[name]
        parts += ["## " + name, body, ""]
    return "\n".join(parts).rstrip("\n") + "\n"


def meta_line(kg, d, kgh, gen_hash, rendered, overflow):
    return "<!-- kg:meta repo=%s dir=%s kg=%s gen=%s overflow=%d rendered=%s kg.py=%s -->" % (
        kg.repo, d or ".", kgh, gen_hash, overflow, rendered, kg_version(kg))


def gen_hash_of(gen_bodies):
    return sha12("\n\n".join(gen_bodies[n] for n in GEN))


def build_sections(kg, d, need, group):
    cfg = repo_config(kg)
    secs = [children_rows(kg, d, need, group), who_reads_rows(kg, d), tests_rows(kg, d, cfg), related_rows(kg, d)]
    for s in secs:
        s.sort()
    return {s.name: s for s in secs}


def fit(kg, d, title, human, secs, today, old_meta, force_index):
    """Trim the ranked rows until the door fits DOOR_BUDGET; return (text, overflow, gen_bodies)."""
    kgh = kg.slice_hash(d)

    def render():
        gen = {n: secs[n].body() for n in GEN}
        gh = gen_hash_of(gen)
        overflow = sum(s.cut for s in secs.values())
        # F-6: when the generated text is unchanged the door is unchanged — kg= and rendered= stay as they were, so
        # a graph change elsewhere (a sibling's edge) never re-stamps this file
        keep = old_meta.get("gen") == gh and old_meta.get("rendered") and old_meta.get("kg")
        meta = meta_line(kg, d, old_meta["kg"] if keep else kgh, gh, old_meta["rendered"] if keep else today,
                         overflow)
        return compose(title, force_index or overflow > 0, meta, human, gen), overflow, gen

    text, overflow, gen = render()
    # Trim the least useful rows first: Related and Tests down to TRIM_FLOOR rows, then Who-reads, then Children;
    # once every section is at its floor, take from whichever is largest.
    for name, floor in TRIM_ORDER + [(n, 1 if n == "Children (generated)" else 0) for n in GEN]:
        while nbytes(text) > DOOR_BUDGET and len(secs[name].rows) > floor:
            if name == "Children (generated)" or floor == 0:
                cands = [x for x in secs.values() if len(x.rows) > (1 if x.name == "Children (generated)" else 0)]
                if not cands:
                    break
                victim = max(cands, key=lambda x: nbytes(x.body()))
            else:
                victim = secs[name]
            victim.rows.pop()
            victim.cut += 1
            text, overflow, gen = render()
    return text, overflow, gen


def index_text(kg, d, secs):
    parts = ["# %s — full index (generated)" % (os.path.basename(d) or kg.repo), "",
             "<!-- kg:index repo=%s dir=%s -->" % (kg.repo, d or "."),
             "Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `%s`." % DOOR, ""]
    for n in GEN:
        parts += ["## %s" % n.replace("(generated)", "(all, generated)"), secs[n].body(door=False), ""]
    return "\n".join(parts).rstrip("\n") + "\n"


def render_dir(kg, d, today=None, adopt=False, need=None, dry=False):
    """Render <d>/CLAUDE.md (+ CLAUDE.index.md when rows overflow or files were grouped). Returns a result dict.
    dry=True writes nothing and returns {"text": <the door it would write>} (door check compares the two)."""
    kg = facade(kg)
    d = d.strip("/") if d not in (".", "") else ""
    if not d:
        return render_root_map(kg)
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    need = set(kg.dirs_needing_door()) if need is None else need
    dabs = os.path.join(kg.root, d)
    door_path = os.path.join(dabs, DOOR)
    old = read_text(door_path)
    legacy_body = None
    human = {n: PLACEHOLDER for n in HUMAN}
    title = "# %s — %s" % (os.path.basename(d), TITLE_PLACEHOLDER)
    old_meta = {}
    if old is not None:
        p = parse_door(old)
        if p["legacy"]:
            if not adopt:
                raise LegacyDoor(os.path.join(d, DOOR))
            t = p["title"][2:].strip() if p["title"].startswith("# ") else os.path.basename(d)
            title = "# %s — %s" % (t, TITLE_PLACEHOLDER)
            legacy_body = p["body"]
        else:
            title = p["title"] or title
            old_meta = p["meta"]
            for n in HUMAN:
                if n in p["sections"]:
                    human[n] = p["sections"][n] or PLACEHOLDER
    secs = build_sections(kg, d, need, group=False)
    # a compact sub-dirs row folds many rows into one: the index then holds them, and the door says so
    grouped = len(secs["Children (generated)"].rows) < len(secs["Children (generated)"].full)
    text, overflow, _ = fit(kg, d, title, human, secs, today, old_meta, grouped)
    if nbytes(text) > DOOR_BUDGET or overflow:
        secs = build_sections(kg, d, need, group=True)
        grouped = len(secs["Children (generated)"].rows) < len(secs["Children (generated)"].full)
        text, overflow, _ = fit(kg, d, title, human, secs, today, old_meta, grouped)
    if dry:
        return {"dir": d, "text": text}
    write_if_changed(door_path, text)
    idx_path = os.path.join(dabs, INDEX)
    if overflow or grouped or legacy_body:
        itext = index_text(kg, d, secs)
        if legacy_body:
            itext += "\n## Previous notes (human, unverified — moved here from the old %s)\n%s\n" % (DOOR, legacy_body)
        elif old_meta:
            prev = read_text(idx_path) or ""
            mark = "\n## Previous notes (human, unverified"
            if mark in prev:
                itext += prev[prev.index(mark):]
        write_if_changed(idx_path, itext)
    else:
        prev = read_text(idx_path)
        if prev is not None and "<!-- kg:index " in prev and "## Previous notes" not in prev:
            os.remove(idx_path)
    return {"dir": d, "bytes": nbytes(text), "overflow": overflow, "grouped": grouped,
            "over_budget": nbytes(text) > DOOR_BUDGET}


def render_root_map(kg):
    """Maintain only the `## Map (generated)` section of the repo-root router; every other byte is left alone."""
    kg = facade(kg)
    path = os.path.join(kg.root, DOOR)
    old = read_text(path) or "# %s\n" % kg.repo
    rows = ["| dir | what it is |", "|---|---|"]
    for sub in dir_kids(kg, ""):
        if excluded_dir(sub):
            continue
        what = door_title_text(os.path.join(kg.root, sub)) or kg.purpose(sub)
        if os.path.exists(os.path.join(kg.root, sub, DOOR)):
            rows.append("| `%s/` | %s → `%s/%s` |" % (sub, what or "(no description yet)", sub, DOOR))
        else:
            rows.append("| `%s/` | %s(no door; %d files) |" % (sub, (what + " ") if what else "",
                                                              file_count(kg, sub)))
    body = "\n".join(rows) + "\n\nDeeper: `python3 kg/kg.py find <words>` · `python3 kg/kg.py file <path>`"
    section = "%s\n<!-- kg:map repo=%s gen=%s -->\n%s\n" % (MAP_HEAD, kg.repo, sha12(body), body)
    if MAP_HEAD in old:
        start = old.index(MAP_HEAD)
        nxt = old.find("\n## ", start + len(MAP_HEAD))
        new = old[:start] + section + ("\n" + old[nxt + 1:] if nxt != -1 else "")
    else:
        new = old.rstrip("\n") + "\n\n" + section
    write_if_changed(path, new)
    return {"dir": "", "bytes": nbytes(new), "overflow": 0, "grouped": False, "over_budget": False}


def render_all(kg, adopt=False, today=None):
    kg = facade(kg)
    need = set(kg.dirs_needing_door())
    results, legacy = [], []
    # deepest first, so a parent's Children rows pick up the child's fresh title
    for d in sorted(need, key=lambda x: (-x.count("/"), x)):
        try:
            results.append(render_dir(kg, d, today=today, adopt=adopt, need=need))
        except LegacyDoor as e:
            legacy.append(str(e))
    results.append(render_root_map(kg))
    return results, legacy


# --------------------------------------------------------------------------------------------- checking

def row_token(row, d=""):
    """The token an `ev` on this Who-reads row must contain: a file's stem (an `index.*` file is imported by its
    directory's name), a table, a column, an env name."""
    m = re.match(r"- `([^`]+)` ← imported by", row)
    if m:
        path = os.path.join(d, m.group(1))
        stem = os.path.basename(path).split(".")[0]
        if stem == "index":
            return (stem, os.path.basename(os.path.dirname(path)) or stem)
        return stem
    if re.match(r"- table `[^`]+` whole row", row):
        return "*"
    m = re.match(r"- (table|column) `([^`]+)`", row)
    if m:
        return m.group(2).split(".")[-1] if m.group(1) == "column" else m.group(2)
    return None


def table_rows(section):
    return [ln for ln in section.split("\n") if ln.startswith("| ") and not ln.startswith("| path |")
            and not ln.startswith("|---")]


def check_dir(kg, d, use_kg=True, lenient=False, need=None):
    """Problems with <d>/CLAUDE.md as a list of strings ([] = clean). `lenient` drops `unsigned` problems."""
    kg = facade(kg) if kg is not None else None
    root = kg.root if kg is not None else None
    d = d.strip("/")
    dabs = os.path.join(root, d)
    text = read_text(os.path.join(dabs, DOOR))
    if text is None:
        return ["missing door"]
    p = parse_door(text)
    if p["legacy"]:
        return ["legacy (hand-written %s, not a door; render --adopt converts it)" % DOOR]
    probs = []
    size = nbytes(text)
    if size > DOOR_BUDGET:
        probs.append("over budget: %d > %d bytes" % (size, DOOR_BUDGET))
    want = [s for s, _ in SECTIONS]
    if p["order"] != want:
        probs.append("sections: %s (want %s)" % (" / ".join(p["order"]), " / ".join(want)))
    if not re.match(r"^# \S.* — \S", p["title"]):
        probs.append("title: want `# <dir> — <one line>`")
    unsigned = []
    if TITLE_PLACEHOLDER in p["title"]:
        unsigned.append("title")
    for n in HUMAN:
        body = p["sections"].get(n, "")
        if PLACEHOLDER in body or not READ_RE.search(body):
            unsigned.append(n)
    if unsigned and not lenient:
        probs.append("unsigned human block(s): %s (needs `<!-- read: <lane> <date> -->`)" % ", ".join(unsigned))
    gen = {n: p["sections"].get(n, "") for n in GEN}
    if p["meta"].get("gen") != gen_hash_of(gen):
        probs.append("hand-edited generated block (gen= hash differs; edit the human blocks or re-render)")
    # links: Children paths, door/index pointers
    for ln in gen.get("Children (generated)", "").split("\n"):
        cells = [c.strip() for c in ln.strip("|").split(" | ")]
        if not ln.startswith("| ") or len(cells) < 2 or cells[0] in ("path", "…") or set(cells[0]) <= {"-", "|"}:
            continue
        links = TICK_RE.findall(cells[0]) if cells[0].startswith("`") else []
        if "sub-dirs" in cells[0]:
            links = [t for t in TICK_RE.findall(cells[1]) if t.endswith("/")]
        links += re.findall(r"→ `([^`]+/%s)`" % re.escape(DOOR), cells[-1])   # purpose text is not a link
        for tok in links:
            if "*" not in tok and not os.path.exists(os.path.join(dabs, tok)):
                probs.append("broken link: `%s`" % tok)
    if p["index_line"] and not os.path.exists(os.path.join(dabs, INDEX)):
        probs.append("broken link: `%s`" % INDEX)
    # F-2: `| … | N more` must equal the index's Children rows minus the door's
    m = re.search(r"^\| … \| (\d+) more", gen.get("Children (generated)", ""), re.M)
    itext = read_text(os.path.join(dabs, INDEX)) if m else None
    if m and itext is not None and "## Children (all, generated)" in itext:
        isec = itext.split("## Children (all, generated)", 1)[1].split("\n## ", 1)[0]
        shown = [r for r in table_rows(gen["Children (generated)"]) if not r.startswith("| … |")]
        want = len(table_rows(isec)) - len(shown)
        if int(m.group(1)) != want:
            probs.append("Children `… %s more` count is wrong: the index holds %d rows the door does not show"
                         % (m.group(1), want))
    # evidence: hash + claimed token
    for ln in gen.get("Who reads this (generated)", "").split("\n"):
        tok = row_token(ln, d)
        for ev in ("%s:%s:%s" % m for m in EV_RE.findall(ln)):
            res = check_ev_file(root, ev, tok)
            if res == "token":
                want = tok if isinstance(tok, str) else "` or `".join(tok)
                probs.append("stale ev (line does not contain token `%s`): `%s`" % (want, ev))
            elif res != "ok":
                probs.append("stale ev (%s): `%s`" % (res, ev))
    if use_kg and kg is not None and not probs:
        # F-6: stale = a fresh render would write different bytes (kg= alone moves with unrelated sibling edges)
        try:
            want = render_dir(kg, d, need=need, dry=True)["text"]
        except LegacyDoor:
            want = text
        if want != text:
            probs.append("stale: the graph moved since this door was rendered (run `door render %s`)" % d)
    return probs


def check_root(kg):
    kg = facade(kg)
    text = read_text(os.path.join(kg.root, DOOR))
    if text is None or MAP_HEAD not in text:
        return ["root: no `%s` section (run `door render --all`)" % MAP_HEAD]
    sec = text[text.index(MAP_HEAD):]
    nxt = sec.find("\n## ", len(MAP_HEAD))
    sec = sec[:nxt] if nxt != -1 else sec
    m = MAP_META_RE.search(sec)
    body = sec.split("-->\n", 1)[1].rstrip("\n") if m else ""
    probs = []
    if not m or dict(kv.split("=", 1) for kv in m.group(1).split()).get("gen") != sha12(body):
        probs.append("root: hand-edited `%s` section" % MAP_HEAD)
    for tok in re.findall(r"→ `([^`]+)`", body):
        if not os.path.exists(os.path.join(kg.root, tok)):
            probs.append("root: broken link `%s`" % tok)
    return probs


def door_files(root):
    try:
        top = subprocess.run(["git", "-C", root, "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                             timeout=10).stdout.strip()
        if not top or os.path.realpath(top) != os.path.realpath(root):
            raise OSError("not a git top level")   # git ls-files paths are only right at the top level
        out = subprocess.run(["git", "-C", root, "ls-files", "-co", "--exclude-standard", "--", "*" + DOOR, DOOR],
                             capture_output=True, text=True, timeout=30)
        if out.returncode == 0:
            return sorted({p for p in out.stdout.splitlines() if os.path.basename(p) == DOOR})
    except (OSError, subprocess.SubprocessError):
        pass
    found = []
    for cur, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not os.path.islink(os.path.join(cur, x))]
        if DOOR in files:
            found.append(os.path.relpath(os.path.join(cur, DOOR), root))
    return sorted(found)


def check_all(kg, lenient=False, use_kg=True):
    """-> (lines to print, failed: bool)."""
    kg = facade(kg)
    need = set(kg.dirs_needing_door())
    have = {os.path.dirname(p) for p in door_files(kg.root)} - {""}
    out, failed = [], False
    for d in sorted(need | have):
        if excluded_dir(d):
            continue
        text = read_text(os.path.join(kg.root, d, DOOR))
        probs = check_dir(kg, d, use_kg=use_kg, lenient=lenient, need=need)
        if lenient:
            probs = [x for x in probs if x != "missing door" and not x.startswith("legacy")]
        meta = parse_door(text)["meta"] if text else {}
        size = nbytes(text) if text else 0
        state = "FAIL" if probs else "OK"
        failed |= bool(probs)
        out.append("%s %s bytes=%d overflow=%s%s" % (state, d, size, meta.get("overflow", "-"),
                                                     ("  " + " | ".join(probs)) if probs else ""))
    rp = check_root(kg)
    failed |= bool(rp)
    out.append(("FAIL root  " + " | ".join(rp)) if rp else "OK root")
    return out, failed


# --------------------------------------------------------------------------------------------- stats

def overflow_rows(kg):
    kg = facade(kg)
    total = 0
    for p in door_files(kg.root):
        m = META_RE.search(read_text(os.path.join(kg.root, p)) or "")
        if m:
            meta = dict(kv.split("=", 1) for kv in m.group(1).split() if "=" in kv)
            total += int(meta.get("overflow", "0") or 0)
    return total


def door_stats(kg):
    kg = facade(kg)
    doors_, stale = 0, 0
    for p in door_files(kg.root):
        d = os.path.dirname(p)
        if not d:
            continue
        text = read_text(os.path.join(kg.root, p)) or ""
        if not META_RE.search(text):
            continue
        doors_ += 1
        if any(not x.startswith("unsigned") for x in check_dir(kg, d)):
            stale += 1
    return {"doors": doors_, "stale_doors": stale, "overflow_rows": overflow_rows(kg),
            "dirs_needing_door": len(kg.dirs_needing_door())}


def dirs_needing_door(kg):
    return facade(kg).dirs_needing_door()


# --------------------------------------------------------------------------------------------- cards

def nearest_door(root, path):
    d = os.path.dirname(path)
    while True:
        if os.path.exists(os.path.join(root, d, DOOR)) and META_RE.search(read_text(os.path.join(root, d, DOOR)) or ""):
            return d
        if not d:
            return None
        d = os.path.dirname(d)


def card_for(kg, path, cfg, never_cache):
    nid = kg.file_id(path)
    lines = ["KG · %s — %s" % (path, kg.purpose(path) or "(no purpose yet)")]
    def live(i):
        return bool(kg.in_edges(i, "imports") or kg.out_edges(i, "deployed_as"))
    imps = [e for e in kg.in_edges(nid, "imports") if not is_test_path(e["s"].split(":", 2)[-1])]
    imps.sort(key=lambda e: (not live(e["s"]), e["s"]))   # production code before leaf scripts; tests are below
    if imps:
        items = ["%s%s" % (ev_display(e["ev"]) if e.get("ev") else e["s"].split(":", 2)[2], q(e.get("c")))
                 for e in imps]
        lines.append(("imported by (%d): " % len(items), items))
    groups = {}
    for c in kg.consumers(nid):
        if c["via"] != "import" and c.get("ev"):
            kind, obj = c["via"].split(":", 1)
            label = obj + " (whole row)" if kind == "rowstar" else obj
            groups.setdefault(label, []).append("%s%s" % (ev_display(c["ev"]), q(c.get("c"))))
    for obj, items in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:3]:
        lines.append(("reads output (data): %s ← " % obj, sorted(items)))
    writes = sorted({e["o"].split(":", 2)[2] for e in kg.out_edges(nid) if e["p"] in ("writes_table", "writes_column")})
    if writes:
        lines.append(("writes: ", writes))
    envs = sorted({e["o"].split(":", 2)[2] for e in kg.out_edges(nid, "reads_env")})
    if envs:
        lines.append(("env: ", envs))
    tests = sorted({((kg.node(e["o"]) or {}).get("path") or e["o"].split(":", 2)[2]) + q(e.get("c"))
                    for e in kg.out_edges(nid, "tested_by")})
    if tests:
        cmd = test_command(cfg, [t.rstrip("?") for t in tests])
        lines.append(("tests: ", tests, ("   → " + cmd) if cmd else ""))
    rel = related_items(kg, [nid])
    rl = []
    for kind, label in RELATED_KINDS:
        if kind in rel and kind != "doc":
            for n in sorted(rel[kind], key=lambda k: (-rel[kind][k], k)):
                rl.append("%s%s" % (n, q(rel[kind][n])))
    if rl:
        lines.append(("related: ", rl))
    dd = nearest_door(kg.root, path)
    if dd is not None:
        if dd not in never_cache:
            never_cache[dd] = never_lines(os.path.join(kg.root, dd))
        if never_cache[dd]:
            lines.append(("never: ", never_cache[dd], "", " · "))
    tail = ("door: %s · " % os.path.join(dd, DOOR) if dd is not None else "") + \
        "more: python3 kg/kg.py file %s" % path
    return fit_card(lines, tail)


def fit_card(lines, tail):
    """Render list items with `(+k)` so the card stays within CARD_LINES and CARD_BYTES."""
    lines = lines[:CARD_LINES - 1]
    cap = {i: len(x[1]) for i, x in enumerate(lines) if isinstance(x, tuple)}
    cap = {i: min(n, 4) for i, n in cap.items()}

    def one(i, x):
        if not isinstance(x, tuple):
            return x
        lead, items = x[0], x[1]
        suffix = x[2] if len(x) > 2 else ""
        sep = x[3] if len(x) > 3 else " · "
        k = cap[i]
        shown = sep.join(items[:k])
        more = " (+%d)" % (len(items) - k) if len(items) > k else ""
        return lead + shown + more + suffix

    while True:
        text = "\n".join([one(i, x) for i, x in enumerate(lines)] + [tail])
        if nbytes(text) <= CARD_BYTES:
            return text
        shrink = [i for i, n in cap.items() if n > 1]
        if not shrink:
            break
        i = max(shrink, key=lambda i: nbytes(one(i, lines[i])))
        cap[i] -= 1
    out = []
    for i, x in enumerate(lines):
        s = one(i, x)
        out.append(s if nbytes(s) <= 160 else s.encode()[:157].decode("utf-8", "ignore") + "…")
    text = "\n".join(out + [tail])
    while nbytes(text) > CARD_BYTES and len(out) > 1:
        out.pop()
        text = "\n".join(out + [tail])
    return text


def build_cards(kg):
    kg = facade(kg)
    cfg = repo_config(kg)
    cache = {}
    cards = {}
    paths = set()
    for n in kg.nodes.values():
        if n.get("kind") in FILE_KINDS and n.get("path"):
            paths.add(n["path"])
    for p in sorted(paths):
        if kg.file_id(p):
            cards[p] = card_for(kg, p, cfg, cache)
    return cards


def card_cmd(args, kg=None):
    """Print the card for one path from `.kg/cards.json`. Never fails, never blocks (exit 0 always)."""
    try:
        root = os.path.abspath(args.repo_root) if getattr(args, "repo_root", None) else find_root(args.path)
        path = args.path
        if os.path.isabs(path):
            path = os.path.relpath(path, root)
        path = os.path.normpath(path)
        cards_path = os.path.join(root, ".kg", "cards.json")
        if not os.path.exists(cards_path):
            return 0
        with open(cards_path, encoding="utf-8") as f:
            cards = json.load(f)
        card = cards.get(path)
        if card:
            sys.stdout.write(card + "\n")
        elif not path.startswith(".."):
            with open(os.path.join(root, ".kg", "misses"), "a", encoding="utf-8") as f:
                f.write(path + "\n")
    except Exception:  # noqa: BLE001 — the guard card must never break an edit
        pass
    return 0


# --------------------------------------------------------------------------------------------- CLI

def door_cmd(args, kg=None):
    kg = facade(kg if kg is not None else load_kg(getattr(args, "repo_root", None) or find_root(os.getcwd())))
    if args.action == "render":
        if args.all:
            results, legacy = render_all(kg, adopt=args.adopt)
            for r in results:
                print("%s %s bytes=%d overflow=%d%s" % ("OVER" if r["over_budget"] else "OK", r["dir"] or "root",
                                                        r["bytes"], r["overflow"],
                                                        " grouped" if r["grouped"] else ""))
            for p in legacy:
                print("LEGACY %s (hand-written; re-run with --adopt to convert)" % p)
            return 1 if legacy or any(r["over_budget"] for r in results) else 0
        try:
            r = render_dir(kg, args.dir, adopt=args.adopt)
        except LegacyDoor as e:
            print("LEGACY %s (hand-written; re-run with --adopt to convert)" % e)
            return 1
        print("%s %s bytes=%d overflow=%d%s" % ("OVER" if r["over_budget"] else "OK", r["dir"] or "root", r["bytes"],
                                                r["overflow"], " grouped" if r["grouped"] else ""))
        return 1 if r["over_budget"] else 0
    if args.all:
        lines, failed = check_all(kg, lenient=args.lenient, use_kg=not args.no_kg)
        print("\n".join(lines))
        return 1 if failed else 0
    probs = check_dir(kg, args.dir, use_kg=not args.no_kg, lenient=args.lenient)
    print(("FAIL %s  " % args.dir + " | ".join(probs)) if probs else "OK %s" % args.dir)
    return 1 if probs else 0


def register(subparsers):
    """Add `door` and `card` to kg.py's subparsers. kg.py calls args.func(args, kg); kg=None when needs_kg is False."""
    dp = subparsers.add_parser("door", help="render or check directory doors (contract C)")
    dp.add_argument("action", choices=["render", "check"])
    dp.add_argument("dir", nargs="?", default="")
    dp.add_argument("--all", action="store_true")
    dp.add_argument("--adopt", action="store_true", help="convert a hand-written CLAUDE.md into a door")
    dp.add_argument("--lenient", action="store_true", help="report missing/legacy/unsigned doors without failing")
    dp.add_argument("--no-kg", action="store_true", help="check the committed door text only")
    dp.add_argument("--repo-root", default=".")               # the same two kg.py's own subcommands take
    dp.add_argument("--kg-dir", default=None, help="graph dir (default <repo-root>/.kg)")
    dp.set_defaults(func=door_cmd, needs_kg=True)
    cp = subparsers.add_parser("card", help="print the edit-time guard card for a path (contract E)")
    cp.add_argument("path")
    cp.add_argument("--repo-root", default=None, help="default: the nearest ancestor of <path> holding .kg/ or kg/")
    cp.set_defaults(func=card_cmd, needs_kg=False)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="doors.py", description=__doc__.split("\n")[0])
    ap.add_argument("--repo-root", dest="top_repo_root", default=None)
    ap.add_argument("--version", action="version", version=VERSION)
    sub = ap.add_subparsers(dest="cmd", required=True)
    register(sub)
    args = ap.parse_args(argv)
    if args.top_repo_root and args.repo_root in (None, "."):
        args.repo_root = args.top_repo_root
    if not getattr(args, "needs_kg", True):
        return args.func(args, None)
    if args.cmd == "door" and not args.all and not args.dir and args.action == "render":
        args.dir = ""
    return args.func(args, None)


if __name__ == "__main__":
    sys.exit(main())
