# kg.py v1.1.0 sha256=de7509f77a0d69ee923851b013a5667f56878d7aa74cfc837dfa1ce68b91cfba — source: rumi-agent-home ops/kg/kg.py
"""kg — a deterministic knowledge graph of one repository.

Contract: ops/kg/SCHEMA.md (contract D). Stdlib only, one file, vendored into each repo as kg/kg.py
next to kg/doors.py (contracts C and E). Repo-specific settings live in kg/config.json, never here.

    python3 kg/kg.py build [--ref <git ref>] [--out <dir>] [--changed <path>...]
    python3 kg/kg.py find <query> | file <path> | who-reads <table.col|env:NAME|path> | feature <name>
    python3 kg/kg.py stale | stats [--baseline <file>] | purpose set|import ... | vendor --check|--update|--stamp
    python3 kg/kg.py door ... | card <path>            (provided by doors.py)

Every query takes --json. Exit 0 = ok, 1 = check failed / not found, 2 = usage or missing module.
"""
import argparse
import bisect
import fnmatch
import hashlib
import json
import marshal
import os
import re
import subprocess
import sys
import time
import urllib.parse

VERSION = "1.1.0"
HEADER_RE = re.compile(r"^# (?P<name>[\w.]+) v(?P<ver>[\w.\-]+) sha256=(?P<sha>[0-9a-f]{64}) — source: (?P<src>.+)$")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import doors  # noqa: E402  (contracts C/E live in doors.py, owned by the map-doors lane)
except ImportError:
    doors = None

# ------------------------------------------------------------------------------------------------ constants

KG_DIR = ".kg"
SUMMARY_DIR = os.path.join("kg", "summaries")
CONFIG_PATH = os.path.join("kg", "config.json")
BEADS_PATH = "kg/beads.jsonl"   # committed bead snapshot (ids, status, dates, paths — no ledger text), keeper-written

DEFAULT_EXCLUDE = [
    "node_modules/**", "**/node_modules/**", ".git/**", ".kg/**", "**/dist/**", "**/build/**",
    "**/coverage/**", "**/.next/**", "**/__snapshots__/**", "**/*.min.js", "**/*.map",
    "**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml",
]
# directories that never need a door of their own (D-10: a skill's SKILL.md is already its entry)
DEFAULT_NO_DOOR = [".claude/skills/*", ".claude/skills/*/**", "**/fixtures", "**/fixtures/**",
                   "**/__mocks__", "**/__mocks__/**", "kg", "kg/**"]

CODE_EXT = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".sh", ".bash", ".sql", ".ejs"}
JS_EXT = {".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"}
DOC_EXT = {".md", ".mdx"}
CONF_EXT = {".json", ".yml", ".yaml", ".toml", ".feature", ".html", ".css", ".txt"}
MAPPABLE_EXT = CODE_EXT | DOC_EXT | CONF_EXT
CONF_NAMES = {"Procfile", "Dockerfile", "Makefile", ".env.example"}
RESOLVE_EXT = ["", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".json"]
MAX_TEXT = 1_500_000

# the common brief's rule 4 pattern (COS RULING 2): every prefix needs >= 20 token chars
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|xox[abp]-|ntn_[A-Za-z0-9]{20,}|gh[pous]_[A-Za-z0-9]{20,}|sbp_[A-Za-z0-9]{20,}"
    r"|cfat_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9]{20,}|postgres(ql)?://[^ ]*:[^ ]*@|-----BEGIN [A-Z ]*PRIVATE KEY)")

PREDICATES = ["contains", "imports", "reads_table", "writes_table", "reads_column", "writes_column", "reads_env",
              "deployed_as", "tested_by", "documented_in", "implements", "mentions"]
KINDS = ["repo", "dir", "file", "symbol", "feature", "service", "table", "column", "env", "flow", "skill", "hook",
         "bead", "report", "doc"]

# extractor ids; bump a version when its output changes so caches are invalidated
X = {"js": "js-imports@1", "sym": "js-symbols@1", "env": "env@3", "sb": "supabase-chain@1", "sql": "sql-ddl@1",
     "rpc": "supabase-rpc@1", "q": "sql-literal@1", "test": "tests@1", "dep": "deploy-config@1",
     "deptab": "deploy-table@1", "flow": "flow-json@1", "md": "md-links@1", "ment": "md-mentions@1",
     "bead": "beads@2", "py": "py-imports@1", "pysym": "py-symbols@1", "fs": "fs@1"}
CACHE_KEY = "kgcache-" + VERSION + "-" + ",".join(sorted(X.values()))


def line_hash(line):
    """sha1[:8] of the line with ALL whitespace removed (re-indenting never makes an edge stale)."""
    return hashlib.sha1("".join(line.split()).encode("utf-8", "replace")).hexdigest()[:8]


EMPTY_HASH = line_hash("")


def blob_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def is_test_path(path):
    b = os.path.basename(path)
    return bool(re.search(r"(^|/)(__tests__|tests?|spec|e2e)/", path) or re.search(r"\.(test|spec)\.[a-z]+$", b)
                or re.match(r"test_.*\.py$", b) or re.search(r"_test\.py$", b))


def glob_match(path, patterns):
    return any(fnmatch.fnmatchcase(path, p) for p in patterns)


def ext_of(path):
    return os.path.splitext(path)[1].lower()


def mappable(path):
    return ext_of(path) in MAPPABLE_EXT or os.path.basename(path) in CONF_NAMES


RENDERED_NAMES = {"CLAUDE.md", "CLAUDE.index.md"}


def is_rendered(path):
    """A door, its index or the map's own data (LR-13): read for links, never a source file that needs a purpose."""
    return os.path.basename(path) in RENDERED_NAMES or path == "kg" or path.startswith("kg/")


def is_test_name(path):
    """A test by its file name alone (`a.test.js`, `test_a.py`, `a_test.py`, `a.test.sh`) — not by its directory."""
    b = os.path.basename(path)
    return bool(re.search(r"\.(test|spec)\.[a-z]+$", b) or re.match(r"test_.*\.py$", b) or re.search(r"_test\.py$", b))


def top_of(path):
    return path.split("/", 1)[0] if "/" in path else "_root"


# ------------------------------------------------------------------------------------------------ sources

class Source:
    """The set of files to map: a git ref (`--ref`, reads blobs, never the checkout) or the working tree."""

    def __init__(self, root, ref=None):
        self.root = os.path.abspath(root)
        self.ref = ref
        self.entries = {}  # path -> (blob sha or None, size)
        self._cache = {}
        if ref:
            out = subprocess.run(["git", "-C", self.root, "ls-tree", "-r", "-l", "-z", ref], capture_output=True,
                                 check=True).stdout
            for rec in out.split(b"\0"):
                if not rec:
                    continue
                meta, path = rec.split(b"\t", 1)
                mode, typ, sha, size = meta.split()
                if typ != b"blob" or mode == b"120000":
                    continue
                self.entries[path.decode("utf-8", "replace")] = (sha.decode(), int(size) if size != b"-" else 0)
        else:
            paths = None
            if os.path.isdir(os.path.join(self.root, ".git")) or os.path.isfile(os.path.join(self.root, ".git")):
                r = subprocess.run(["git", "-C", self.root, "ls-files", "-z", "-co", "--exclude-standard"],
                                   capture_output=True)
                if r.returncode == 0:
                    paths = [p.decode("utf-8", "replace") for p in r.stdout.split(b"\0") if p]
            if paths is None:
                paths = []
                for d, dirs, files in os.walk(self.root):
                    dirs[:] = sorted(x for x in dirs if x not in (".git", "node_modules", KG_DIR))
                    for f in files:
                        paths.append(os.path.relpath(os.path.join(d, f), self.root).replace(os.sep, "/"))
            for p in paths:
                full = os.path.join(self.root, p)
                if os.path.islink(full) or not os.path.isfile(full):
                    continue
                self.entries[p] = (None, os.path.getsize(full))

    def preload(self, paths):
        """Read many blobs in one `git cat-file --batch` call (ref mode)."""
        if not self.ref:
            return
        want = [p for p in paths if p not in self._cache]
        if not want:
            return
        shas = [self.entries[p][0] for p in want]
        out = subprocess.run(["git", "-C", self.root, "cat-file", "--batch"], input=("\n".join(shas) + "\n").encode(),
                             capture_output=True, check=True).stdout
        pos = 0
        for p in want:
            nl = out.index(b"\n", pos)
            header = out[pos:nl].split()
            size = int(header[2])
            self._cache[p] = out[nl + 1:nl + 1 + size]
            pos = nl + 1 + size + 1

    def read(self, path):
        if path in self._cache:
            return self._cache.pop(path)
        if self.ref:
            return subprocess.run(["git", "-C", self.root, "cat-file", "blob", self.entries[path][0]],
                                  capture_output=True, check=True).stdout
        with open(os.path.join(self.root, path), "rb") as f:
            return f.read()

    def read_optional(self, path):
        if path not in self.entries:
            if not self.ref:
                full = os.path.join(self.root, path)
                if os.path.isfile(full):
                    with open(full, "rb") as f:
                        return f.read()
            return None
        return self.read(path)


# ------------------------------------------------------------------------------------------------ text helpers

class Text:
    """A file's text with a comment-blanked copy (same offsets, same line numbers) and line lookup."""

    def __init__(self, path, raw):
        self.path = path
        self.raw = raw
        self.lines = raw.split("\n")
        self.starts = [0]
        for ln in self.lines[:-1]:
            self.starts.append(self.starts[-1] + len(ln) + 1)
        e = ext_of(path)
        if e in JS_EXT or e == ".ejs":
            self.code = blank_js_comments(raw)
        elif e == ".py":
            self.code = blank_py_comments(raw)
        elif e == ".sql":
            self.code = blank_sql_comments(raw)
        else:
            self.code = raw

    def lineno(self, offset):
        return bisect.bisect_right(self.starts, offset)

    def ev(self, lineno):
        # a multi-line regex can start on the blank line before its match: anchor on the next line with content
        while lineno < len(self.lines) and not self.lines[lineno - 1].strip():
            lineno += 1
        return "%s:%d:%s" % (self.path, lineno, line_hash(self.lines[lineno - 1]))

    def ev_at(self, offset):
        return self.ev(self.lineno(offset))


def _blank(s):
    return re.sub(r"[^\n]", " ", s)


def blank_js_comments(src):
    """Blank // and /* */ comments; keep strings and template literals. Regex literals are not parsed, so a
    `//` inside one blanks the rest of that line only (a missed edge, never a false one)."""
    out = []
    i, n = 0, len(src)
    state = None  # None | "'" | '"' | '`'
    while i < n:
        ch = src[i]
        if state:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if ch == state or (ch == "\n" and state != "`"):
                state = None
            i += 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(_blank(src[i:j]))
            i = j
            continue
        if ch in "'\"`":
            state = ch
        out.append(ch)
        i += 1
    return "".join(out)


def blank_py_comments(src):
    out = []
    for ln in src.split("\n"):
        s = ln.lstrip()
        out.append(" " * len(ln) if s.startswith("#") else ln)
    text = "\n".join(out)
    # blank triple-quoted blocks (docstrings) so `import x` inside prose is not an edge
    return re.sub(r'("""|\'\'\')(.*?)(\1)', lambda m: _blank(m.group(0)), text, flags=re.S)


def blank_sql_comments(src):
    src = re.sub(r"/\*.*?\*/", lambda m: _blank(m.group(0)), src, flags=re.S)
    return re.sub(r"--[^\n]*", lambda m: " " * len(m.group(0)), src)


def match_paren(s, i):
    """s[i] is '(' or '{' or '['; return index after its match (string-aware), or len(s)."""
    pairs = {"(": ")", "{": "}", "[": "]"}
    stack = [pairs[s[i]]]
    j = i + 1
    state = None
    while j < len(s) and stack:
        c = s[j]
        if state:
            if c == "\\":
                j += 2
                continue
            if c == state:
                state = None
        elif c in "'\"`":
            state = c
        elif c in pairs:
            stack.append(pairs[c])
        elif c == stack[-1]:
            stack.pop()
        j += 1
    return j


def string_arg(s, i):
    """If s[i:] (after whitespace) starts a string literal, return (value, start_offset_of_value)."""
    m = re.compile(r"\s*(['\"`])").match(s, i)
    if not m:
        return None, None
    q = m.group(1)
    j = m.end()
    k = j
    while k < len(s) and s[k] != q:
        k += 2 if s[k] == "\\" else 1
    return s[j:k], j


# ------------------------------------------------------------------------------------------------ extractors

JS_IMPORT_RES = [
    re.compile(r"\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?(['\"])([^'\"\n]+)\1"),
    re.compile(r"\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+(['\"])([^'\"\n]+)\1"),
    re.compile(r"(?<![\w$.])require\(\s*(['\"])([^'\"\n]+)\1\s*\)"),
    re.compile(r"(?<![\w$.])import\(\s*(['\"])([^'\"\n]+)\1\s*\)"),
]


def x_js_imports(t, facts):
    seen = set()
    for rx in JS_IMPORT_RES:
        for m in rx.finditer(t.code):
            off = m.start(2)
            key = (m.group(2), off)
            if key in seen:
                continue
            seen.add(key)
            facts["imports"].append((m.group(2), t.ev_at(off)))


JS_SYM_RES = [
    re.compile(r"^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var|interface|type|enum)"
               r"\s+([A-Za-z_$][\w$]*)", re.M),
    re.compile(r"\bmodule\.exports\.([A-Za-z_$][\w$]*)\s*="),
    re.compile(r"^\s*exports\.([A-Za-z_$][\w$]*)\s*=", re.M),
    re.compile(r"\bmodule\.exports\s*=\s*(?:new\s+)?([A-Za-z_$][\w$]*)\s*[;\n(]"),
]


def _object_keys(body):
    """Top-level keys of an object/brace list body (no outer braces)."""
    keys, depth, cur = [], 0, []
    for c in body + ",":
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if c == "," and depth == 0:
            item = "".join(cur).strip()
            cur = []
            if not item or item.startswith("..."):
                continue
            m = re.match(r"(?:async\s+)?['\"]?([A-Za-z_$][\w$]*)['\"]?\s*(?::|\(|=|$|\s+as\s+([A-Za-z_$][\w$]*))", item)
            if m:
                keys.append(m.group(2) or m.group(1))
            continue
        cur.append(c)
    return keys


def x_js_symbols(t, facts):
    names = []
    for rx in JS_SYM_RES:
        for m in rx.finditer(t.code):
            if m.group(1) in ("function", "class", "async"):
                continue
            names.append((m.group(1), t.lineno(m.start(1))))
    for m in re.finditer(r"\bmodule\.exports\s*=\s*\{", t.code):
        b = m.end() - 1
        e = match_paren(t.code, b)
        for k in _object_keys(t.code[b + 1:e - 1]):
            names.append((k, t.lineno(b)))
    for m in re.finditer(r"^\s*export\s*\{([^}]*)\}(?!\s*from)", t.code, re.M):
        for k in _object_keys(m.group(1)):
            names.append((k, t.lineno(m.start())))
    for m in re.finditer(r"^\s*export\s*\{([^}]*)\}\s*from", t.code, re.M):
        for k in _object_keys(m.group(1)):
            names.append((k, t.lineno(m.start())))
    seen = set()
    for name, ln in names:
        if name in seen:
            continue
        seen.add(name)
        facts["symbols"].append((name, t.ev(ln)))


ENV_JS_RES = [re.compile(r"\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b"),
              re.compile(r"\bprocess\.env\[\s*['\"]([A-Z_][A-Z0-9_]*)['\"]\s*\]"),
              re.compile(r"\bimport\.meta\.env\.([A-Z_][A-Z0-9_]*)\b")]
ENV_PY_RES = [re.compile(r"\bos\.environ\[\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]"),
              re.compile(r"\b(?:os\.)?environ\.get\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]"),
              re.compile(r"\bos\.getenv\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]"),
              re.compile(r"\bos\.environ\.setdefault\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]")]


ENV_ASSIGN = re.compile(r"\s*\]?\s*(?:=(?!=)|\?\?=|\|\|=)")


def x_env(t, facts, py=False):
    for rx in (ENV_PY_RES if py else ENV_JS_RES):
        for m in rx.finditer(t.code):
            if not py:
                # `process.env.X = v` (tests set env) and `delete process.env.X` are writes, not reads
                if ENV_ASSIGN.match(t.code, m.end()) or re.search(r"\bdelete\s+$", t.code[max(0, m.start() - 10):m.start()]):
                    continue
            facts["env"].append((m.group(1), t.ev_at(m.start(1))))
    if not py:
        for m in re.finditer(r"\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*process\.env\b", t.code):
            body_off = m.start(1)
            for km in re.finditer(r"([A-Z_][A-Z0-9_]*)\s*(?=[:=,}]|$)", m.group(1)):
                if km.start() > 0 and m.group(1)[km.start() - 1] not in " ,{\n\t":
                    continue
                facts["env"].append((km.group(1), t.ev_at(body_off + km.start(1))))


# shell: `$NAME`, `${NAME}`, `${NAME:-x}`; a name the file assigns is a local unless it is read with a default
SH_ENV_RE = re.compile(r"\$\{?([A-Z_][A-Z0-9_]*)")
SH_ASSIGN_RE = re.compile(r"(?:^|[\s;&|(])(?:export\s+|local\s+|readonly\s+|declare\s+(?:-\w+\s+)*)?([A-Z_][A-Z0-9_]*)=")
SH_LOOP_RE = re.compile(r"\b(?:for|read(?:\s+-\w+)*)\s+([A-Z_][A-Z0-9_]*)\b")
SH_BUILTIN = {"HOME", "PATH", "PWD", "OLDPWD", "SHELL", "USER", "IFS", "RANDOM", "LINENO", "BASH_SOURCE",
              "BASH_REMATCH", "FUNCNAME", "PIPESTATUS", "SECONDS", "OPTARG", "OPTIND", "REPLY", "TMPDIR", "EUID",
              "UID", "PPID", "HOSTNAME", "TERM", "LANG", "LC_ALL", "BASH_VERSION", "OSTYPE", "COLUMNS", "LINES"}


def x_env_sh(t, facts):
    assigned = set(SH_ASSIGN_RE.findall(t.raw)) | set(SH_LOOP_RE.findall(t.raw))
    defaulted = set(re.findall(r"\$\{([A-Z_][A-Z0-9_]*):?[-=?]", t.raw))
    for i, ln in enumerate(t.lines, 1):
        s = ln.lstrip()
        if s.startswith("#"):
            continue
        quoted = [(m.start(), m.end()) for m in re.finditer(r"'[^']*'", ln)]
        for m in SH_ENV_RE.finditer(ln):
            name = m.group(1)
            if len(name) < 2 or name in SH_BUILTIN or (name in assigned and name not in defaulted):
                continue
            if any(a < m.start() < b for a, b in quoted):
                continue
            facts["env"].append((name, t.ev(i)))


SB_FROM = re.compile(r"\.from\(\s*(['\"`])([A-Za-z_][\w.]*)\1\s*\)")
SB_NOT_RECEIVER = re.compile(r"(?:\b(?:Array|Buffer|Object|Set|Map|Uint8Array|Int\d+Array|Float\d+Array|Readable|"
                             r"Observable|Rx|_|lodash|stream|Promise)|storage\s*)\s*$")
SB_VERB = re.compile(r"\.(select|insert|update|upsert|delete)\s*\(")
SB_FILTER = re.compile(r"\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order|not|match|filter|"
                       r"textSearch|overlaps|rangeGt|rangeLt)\s*\(")
SB_STORAGE = re.compile(r"\.(upload|download|getPublicUrl|createSignedUrl|createSignedUrls|move|copy|list|remove)\s*\(")
SB_RECEIVER_HINT = re.compile(r"(supa|sb\b|db\b|client|admin)\w*\s*\.?\s*$", re.I)


def _chain_end(code, i):
    """End of a method chain starting at i: `;` at depth 0, or a newline whose next line does not continue it."""
    depth, j, n, state = 0, i, len(code), None
    while j < n:
        c = code[j]
        if state:
            if c == "\\":
                j += 2
                continue
            if c == state:
                state = None
        elif c in "'\"`":
            state = c
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
            if depth < 0:
                return j
        elif depth == 0 and c == ";":
            return j
        elif depth == 0 and c == "\n":
            m = re.compile(r"\n\s*").match(code, j)
            if not code.startswith(".", m.end()) and not code.startswith("?.", m.end()):
                return j
        j += 1
        if j - i > 6000:
            return j
    return j


def _select_columns(spec):
    cols, depth, cur = [], 0, []
    for c in spec + ",":
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        if c == "," and depth == 0:
            item = "".join(cur).strip()
            cur = []
            if not item:
                continue
            if "(" in item:  # embedded relation: users(first_name) / alias:rel!fk(...)
                continue
            item = item.split("::")[0].strip()
            if ":" in item:
                item = item.split(":", 1)[1].strip()
            item = item.split("->")[0].strip()
            if item == "*" or re.match(r"^[A-Za-z_]\w*$", item):
                cols.append(item)
            continue
        cur.append(c)
    return cols


def x_supabase(t, facts):
    code = t.code
    for m in SB_FROM.finditer(code):
        before = code[max(0, m.start() - 40):m.start()]
        if SB_NOT_RECEIVER.search(before):
            continue
        table = m.group(2)
        if "." in table:
            schema, table = table.split(".", 1)
            if schema not in ("public",):
                table = schema + "." + table
        end = _chain_end(code, m.end())
        chain = code[m.end():end]
        if SB_STORAGE.search(chain) and not SB_VERB.search(chain):
            continue
        verbs = list(SB_VERB.finditer(chain))
        if not verbs and not SB_RECEIVER_HINT.search(before):
            continue
        ev_from = t.ev_at(m.start(2))
        write = any(v.group(1) in ("insert", "update", "upsert", "delete") for v in verbs)
        read = any(v.group(1) == "select" for v in verbs) or not verbs or any(SB_FILTER.finditer(chain))
        if write:
            facts["sb"].append(("writes_table", table, None, ev_from))
        if read or not write:
            facts["sb"].append(("reads_table", table, None, ev_from))
        base = m.end()
        for v in verbs:
            arg_at = base + v.end()
            if v.group(1) == "select":
                val, voff = string_arg(code, arg_at)
                if val is None:
                    continue
                for col in _select_columns(val):
                    if col == "*":
                        facts["sb"].append(("reads_column", table, "*", t.ev_at(voff)))
                    else:
                        idx = val.find(col)
                        facts["sb"].append(("reads_column", table, col, t.ev_at(voff + max(idx, 0))))
            elif v.group(1) in ("insert", "update", "upsert"):
                mm = re.compile(r"\s*(\[\s*)?\{").match(code, arg_at)
                if not mm:
                    continue
                b = mm.end() - 1
                e = match_paren(code, b)
                body = code[b + 1:e - 1]
                for k in _object_keys(body):
                    km = re.search(r"(?<![\w$])['\"]?" + re.escape(k) + r"['\"]?\s*(?=[:,}\n]|$)", body)
                    off = b + 1 + (km.start() if km else 0)
                    facts["sb"].append(("writes_column", table, k, t.ev_at(off)))
        for f in SB_FILTER.finditer(chain):
            val, voff = string_arg(code, base + f.end())
            if val and re.match(r"^[A-Za-z_]\w*$", val):
                facts["sb"].append(("reads_column", table, val, t.ev_at(voff)))
            elif val and f.group(1) in ("or",):
                pass


SQL_WRITE_RES = [re.compile(r"\bINSERT\s+INTO\s+(?:ONLY\s+)?([\w.\"]+)", re.I),
                 re.compile(r"\bUPDATE\s+(?:ONLY\s+)?([\w.\"]+)\s+(?:AS\s+\w+\s+)?SET\b", re.I),
                 re.compile(r"\bDELETE\s+FROM\s+(?:ONLY\s+)?([\w.\"]+)", re.I),
                 re.compile(r"\bTRUNCATE\s+(?:TABLE\s+)?([\w.\"]+)", re.I)]
SQL_READ_RE = re.compile(r"\b(?:FROM|JOIN)\s+(?:ONLY\s+)?([\w.\"]+)", re.I)
SQL_NOISE = {"on", "true", "false", "null", "using", "lateral", "select", "lateral", "unnest", "jsonb_array_elements", "generate_series", "json_array_elements",
             "information_schema", "pg_catalog", "pg_indexes", "pg_class", "pg_tables", "pg_stat_user_tables",
             "dual", "new", "old", "excluded", "the", "a", "an", "to", "and", "or", "where", "set", "values", "each"}


def _norm_table(name):
    name = name.strip('"').replace('"', "")
    if name.lower().startswith("public."):
        name = name[7:]
    if "." in name:
        schema = name.split(".")[0].lower()
        if schema in ("pg_catalog", "information_schema", "auth", "storage", "cron", "net", "extensions",
                      "supabase_functions", "realtime", "vault", "graphql"):
            return None
    if not re.match(r"^[A-Za-z_][\w.]*$", name) or name.lower() in SQL_NOISE:
        return None
    return name


def sql_tables(sql, offset0=0):
    """(pred, table, offset) for DML in a SQL text. CTE names and set-returning function calls are not tables."""
    out = []
    writes = set()
    ctes = {m.group(1).lower() for m in re.finditer(r"(?:\bWITH(?:\s+RECURSIVE)?|,)\s*([A-Za-z_]\w*)\s+AS\s*(?:NOT\s+)?(?:MATERIALIZED\s+)?\(",
                                                    sql, re.I)}
    for rx in SQL_WRITE_RES:
        for m in rx.finditer(sql):
            tb = _norm_table(m.group(1))
            if tb:
                out.append(("writes_table", tb, offset0 + m.start(1)))
                writes.add(m.start(1))
    for m in SQL_READ_RE.finditer(sql):
        if m.start(1) in writes or m.group(1).strip('"').lower() in ctes:
            continue
        if re.compile(r"\s*\(").match(sql, m.end(1)):  # FROM fn(...) — a function, not a table
            continue
        prev = sql[max(0, m.start() - 12):m.start()]
        if re.search(r"DELETE\s*$", prev, re.I):
            continue
        tb = _norm_table(m.group(1))
        if tb:
            out.append(("reads_table", tb, offset0 + m.start(1)))
    return out


QUERY_CALL = re.compile(r"(?<![\w$])(?:\w+\.)*(query|execute|executemany|raw)\s*\(")


def x_sql_literals(t, facts):
    code = t.code
    for m in QUERY_CALL.finditer(code):
        val, voff = string_arg(code, m.end())
        if val is None:
            # a python `cur.execute(sql)` with a non-literal arg, or a JS pool.query(text)
            rest = code[m.end():m.end() + 80].lstrip()
            if rest and not rest.startswith(")") and re.match(r"[A-Za-z_]", rest):
                if m.group(1) in ("query", "execute") and (".%s(" % m.group(1)) in code[m.start():m.end() + 1]:
                    facts["unparsed_sql"] += 1
            continue
        if not re.search(r"\b(SELECT|INSERT|UPDATE|DELETE|WITH|TRUNCATE)\b", val, re.I):
            continue
        for pred, tb, off in sql_tables(val, voff):
            facts["sqlq"].append((pred, tb, t.ev_at(off)))
    for m in re.finditer(r"\.rpc\(\s*(['\"])(\w+)\1", code):
        if m.group(2) in ("exec_sql", "execute_sql", "run_sql", "exec"):
            facts["unparsed_sql"] += 1
        else:
            facts["rpc"].append((m.group(2), t.ev_at(m.start(2))))


CREATE_TABLE = re.compile(r"\bCREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)\s*\(",
                          re.I)
ALTER_ADD = re.compile(r"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w.\"]+)\s+(.*?);", re.I | re.S)
CREATE_VIEW = re.compile(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)",
                         re.I)
CREATE_FN = re.compile(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.\"]+)\s*\(", re.I)
COL_SKIP = {"constraint", "primary", "foreign", "unique", "check", "exclude", "like", "index"}


def x_sql_file(t, facts):
    code = t.code
    for m in CREATE_TABLE.finditer(code):
        tb = _norm_table(m.group(1))
        if not tb:
            continue
        facts["ddl"].append(("writes_table", tb, None, t.ev_at(m.start(1))))
        b = m.end() - 1
        e = match_paren(code, b)
        body = code[b + 1:e - 1]
        depth, start = 0, 0
        for i, c in enumerate(body + ","):
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            elif c == "," and depth == 0:
                item = body[start:i]
                cm = re.match(r"\s*\"?([A-Za-z_]\w*)\"?", item)
                if cm and cm.group(1).lower() not in COL_SKIP:
                    facts["ddl"].append(("writes_column", tb, cm.group(1), t.ev_at(b + 1 + start + cm.start(1))))
                start = i + 1
    for m in ALTER_ADD.finditer(code):
        tb = _norm_table(m.group(1))
        if not tb:
            continue
        for am in re.finditer(r"\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\"?([A-Za-z_]\w*)\"?", m.group(2), re.I):
            if am.group(1).lower() in COL_SKIP:
                continue
            facts["ddl"].append(("writes_column", tb, am.group(1), t.ev_at(m.start(2) + am.start(1))))
    for m in CREATE_VIEW.finditer(code):
        tb = _norm_table(m.group(1))
        if tb:
            facts["ddl"].append(("writes_table", tb, None, t.ev_at(m.start(1))))
    for m in CREATE_FN.finditer(code):
        name = m.group(1).replace('"', "").split(".")[-1]
        bm = re.compile(r".*?\bAS\s+(\$\w*\$)(.*?)\1", re.I | re.S).match(code, m.end())
        if not bm or bm.start() - m.end() > 4000:
            continue
        body_off = bm.start(2)
        facts["fns"][name] = sorted({(p, tb) for p, tb, _ in sql_tables(bm.group(2), body_off) if p == "writes_table"})
    # top-level DML (outside function bodies) in .sql files
    masked = re.sub(r"(\$\w*\$).*?\1", lambda mm: _blank(mm.group(0)), code, flags=re.S)
    for pred, tb, off in sql_tables(masked):
        if pred == "writes_table":
            facts["ddl"].append(("writes_table:dml", tb, None, t.ev_at(off)))


PY_IMPORT = re.compile(r"^\s*(?:from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)|import\s+([\w., ]+))", re.M)


def x_py(t, facts):
    for m in PY_IMPORT.finditer(t.code):
        if m.group(1) is not None:
            mod = m.group(1)
            names = [n.strip().split(" as ")[0] for n in m.group(2).replace("(", "").replace(")", "").split(",")]
            facts["pyimports"].append((mod, [n for n in names if n and n != "*"], t.ev_at(m.start(1))))
        else:
            for part in m.group(3).split(","):
                mod = part.strip().split(" as ")[0].strip()
                if mod:
                    facts["pyimports"].append((mod, [], t.ev_at(m.start(3))))
    for m in re.finditer(r"^(?:async\s+)?(?:def|class)\s+([A-Za-z]\w*)", t.code, re.M):
        facts["symbols"].append((m.group(1), t.ev_at(m.start(1))))


MD_LINK = re.compile(r"\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
PATH_TOKEN = re.compile(r"`([^`\n]{2,200})`")


def x_md(t, facts):
    for m in MD_LINK.finditer(t.raw):
        target = m.group(1)
        if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("#"):
            continue
        facts["links"].append((target, t.ev_at(m.start(1))))
    for m in PATH_TOKEN.finditer(t.raw):
        tok = m.group(1).strip()
        if "/" in tok or re.search(r"\.(js|ts|tsx|py|sh|md|json|sql|yaml|yml|toml)$", tok):
            tok = tok.split()[0] if " " in tok and not os.path.splitext(tok)[1] else tok
            facts["mentions"].append((tok, t.ev_at(m.start(1))))


def x_deploy_config(t, facts):
    name = os.path.basename(t.path)
    d = os.path.dirname(t.path)
    if name == "Procfile":
        for i, ln in enumerate(t.lines, 1):
            m = re.match(r"^\s*([\w-]+)\s*:\s*(.+)$", ln)
            if m:
                facts["deploy"].append(("%s#%s" % (t.path, m.group(1)), m.group(1), m.group(2), d, t.ev(i)))
        return
    for i, ln in enumerate(t.lines, 1):
        m = re.search(r"[\"']?(?:startCommand|cmd)[\"']?\s*[:=]\s*[\"']([^\"']+)[\"']", ln)
        if m:
            facts["deploy"].append((t.path, name, m.group(1), d, t.ev(i)))
    if not facts["deploy"]:
        facts["deploy"].append((t.path, name, "", d, None))


def x_deploy_table(t, facts):
    """Service names in markdown tables whose header names a service/worker column (c = 0.6)."""
    header = None
    for i, ln in enumerate(t.lines, 1):
        if not ln.lstrip().startswith("|"):
            header = None
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if all(re.match(r"^:?-{2,}:?$", c) for c in cells if c):
            continue
        cols = [j for j, h in enumerate(header) if re.search(r"service|worker", h, re.I)]
        if not cols:
            continue
        names = []
        for j in cols:
            if j < len(cells):
                names += [n for n in re.findall(r"`([^`]+)`", cells[j]) if re.match(r"^[\w][\w .-]{1,60}$", n)
                          and not re.search(r"\.(js|ts|py|json|md)$", n)]
        paths = [p for p in re.findall(r"`([^`]+)`|\]\(([^)]+)\)", ln) for p in p if p]
        for n in names:
            facts["deptab"].append((n, paths, t.ev(i)))


def x_flow(t, facts):
    try:
        data = json.loads(t.raw)
    except ValueError:
        return
    if isinstance(data, dict) and "screens" in data and "version" in data:
        facts["flow"] = True


def extract(path, raw_bytes):
    """Per-file facts (unresolved; cached by blob sha). Never raises on bad input."""
    facts = {"imports": [], "symbols": [], "env": [], "sb": [], "sqlq": [], "rpc": [], "unparsed_sql": 0,
             "ddl": [], "fns": {}, "pyimports": [], "links": [], "mentions": [], "deploy": [], "deptab": [],
             "flow": False, "secret": False, "text": True}
    if b"\0" in raw_bytes[:4096]:
        facts["text"] = False
        return facts
    raw = raw_bytes.decode("utf-8", "replace")
    if SECRET_RE.search(raw):
        facts["secret"] = True
        return facts
    t = Text(path, raw)
    e = ext_of(path)
    base = os.path.basename(path)
    try:
        if e in JS_EXT or e == ".ejs":
            x_js_imports(t, facts)
            x_js_symbols(t, facts)
            x_env(t, facts)
            x_supabase(t, facts)
            x_sql_literals(t, facts)
        elif e == ".py":
            x_py(t, facts)
            x_env(t, facts, py=True)
            x_sql_literals(t, facts)
        elif e == ".sql":
            x_sql_file(t, facts)
        elif e in (".sh", ".bash"):
            x_env_sh(t, facts)
        elif e in DOC_EXT:
            x_md(t, facts)
            if base.upper() == "CLAUDE.MD":
                x_deploy_table(t, facts)
        elif e == ".json" and len(raw) < 400_000:
            x_flow(t, facts)
        if base == "Procfile" or re.match(r"^(railway\.(json|toml)|railpack[\w.-]*\.json|nixpacks\.toml)$", base) \
                or base.endswith(".railway.toml") or base.endswith(".railway.json"):
            x_deploy_config(t, facts)
    except (RecursionError, ValueError, IndexError) as exc:  # a parser bug never kills the build
        facts["error"] = "%s: %s" % (type(exc).__name__, exc)
    return facts


# ------------------------------------------------------------------------------------------------ build

def load_json_lenient(raw):
    """tsconfig-style JSON: // and /* */ comments, trailing commas."""
    txt = blank_js_comments(raw)
    txt = re.sub(r",(\s*[}\]])", r"\1", txt)
    return json.loads(txt)


class Builder:
    def __init__(self, root, repo, ref=None, out=None, beads=None, quiet=False):
        self.root = os.path.abspath(root)
        self.repo = repo
        self.ref = ref
        self.out = os.path.abspath(out) if out else os.path.join(self.root, KG_DIR)
        self.beads = beads
        self.quiet = quiet
        self.src = Source(self.root, ref)
        cfg_raw = self.src.read_optional(CONFIG_PATH.replace(os.sep, "/"))
        self.config = json.loads(cfg_raw.decode()) if cfg_raw else {}
        self.exclude = DEFAULT_EXCLUDE + self.config.get("exclude", [])
        self.no_door = DEFAULT_NO_DOOR + self.config.get("no_door", [])
        self.nodes = {}
        self.edges = {}
        self.counts = {"unparsed_sql": 0, "broken_links": 0, "secret_skipped": 0, "extract_errors": 0}
        self.misses = []
        self.broken = []

    # -- graph helpers
    def node(self, nid, kind, name, path="", **attrs):
        if nid not in self.nodes:
            self.nodes[nid] = {"id": nid, "kind": kind, "name": name, "path": path, "attrs": {}}
        if attrs:
            self.nodes[nid]["attrs"].update(attrs)
        return nid

    def edge(self, s, p, o, ev, x, c, **extra):
        key = (s, p, o, extra.get("via", ""), extra.get("k", ""))
        cur = self.edges.get(key)
        if cur is None:
            e = {"s": s, "p": p, "o": o, "ev": ev, "x": x, "c": c}
            e.update({k: v for k, v in extra.items() if v})
            e["n"] = 1
            self.edges[key] = e
        else:
            cur["n"] += 1
            if ev and (cur["ev"] is None or _ev_order(ev) < _ev_order(cur["ev"])):
                cur["ev"] = ev
            if c > cur["c"]:
                cur["c"], cur["x"] = c, x

    def fid(self, path):
        return self.path_ids.get(path)

    # -- main
    def run(self):
        t0 = time.time()
        paths = sorted(p for p in self.src.entries if not glob_match(p, self.exclude))
        self.paths = paths
        self.pathset = set(paths)
        self.dirset = set()
        for p in paths:
            d = os.path.dirname(p)
            while d:
                self.dirset.add(d)
                d = os.path.dirname(d)
        # B7: the shallowest directory whose every file is excluded (dist/, vendor/ …), with its file count
        self.excluded_dirs = {}
        for p in self.src.entries:
            if p in self.pathset:
                continue
            parts = p.split("/")
            for i in range(1, len(parts)):
                pre = "/".join(parts[:i])
                if pre not in self.dirset:
                    self.excluded_dirs[pre] = self.excluded_dirs.get(pre, 0) + 1
                    break
        cache = self._load_cache()
        newcache = {}
        texts = [p for p in paths if mappable(p) and self.src.entries[p][1] <= MAX_TEXT]
        textset = set(texts)
        facts = {}
        need = []
        shas = {}
        for p in texts:
            sha = self.src.entries[p][0]
            if sha is None:
                raw = self.src.read(p)
                sha = blob_sha(raw)
                shas[p] = (sha, raw)
            else:
                shas[p] = (sha, None)
            hit = cache.get(p)
            if hit and hit[0] == sha:
                facts[p] = hit[1]
                newcache[p] = hit
            else:
                need.append(p)
        if self.ref:
            for i in range(0, len(need), 2000):
                self.src.preload(need[i:i + 2000])
        for p in need:
            sha, raw = shas[p]
            if raw is None:
                raw = self.src.read(p)
            f = extract(p, raw)
            f["sha256"] = hashlib.sha256(raw).hexdigest()
            facts[p] = f
            newcache[p] = (sha, f)
        self.facts = facts
        self._nodes_fs(paths, textset)
        self._resolve_all()
        self._summaries()
        self._write(newcache, t0)
        return 0

    def _load_cache(self):
        p = os.path.join(self.out, "cache.marshal")
        try:
            with open(p, "rb") as f:
                data = marshal.load(f)
            if data.get("key") == CACHE_KEY and data.get("repo") == self.repo:
                return data["files"]
        except (OSError, ValueError, EOFError, TypeError, KeyError):
            pass
        return {}

    def _nodes_fs(self, paths, textset):
        r = self.repo
        self.node("%s:repo:%s" % (r, r), "repo", r, "")
        self.path_ids = {}
        report_pats = self.config.get("report_globs", ["**/Reports/**/*.md", "**/Investigations/**/*.md",
                                                       "Reports/**/*.md", "Investigations/**/*.md"])
        for d in sorted(self.dirset):
            did = "%s:dir:%s" % (r, d)
            self.node(did, "dir", os.path.basename(d), d)
            self.path_ids[d + "/"] = did
            parent = os.path.dirname(d)
            self.edge("%s:dir:%s" % (r, parent) if parent else "%s:repo:%s" % (r, r), "contains", did, None,
                      X["fs"], 1.0)
        for p in paths:
            f = self.facts.get(p, {})
            base = os.path.basename(p)
            e = ext_of(p)
            if base == "SKILL.md" and "/skills/" in "/" + p:
                kind, key = "skill", os.path.basename(os.path.dirname(p))
            elif "/hooks/" in "/" + p and p.startswith(".claude/") and e in (".sh", ".py", ".js") \
                    and not is_test_path(p) and not base.endswith(".test.sh"):
                kind, key = "hook", base
            elif f.get("flow"):
                kind, key = "flow", p
            elif e in DOC_EXT:
                kind, key = ("report", p) if glob_match(p, report_pats) else ("doc", p)
            else:
                kind, key = "file", p
            nid = "%s:%s:%s" % (r, kind, key)
            if nid in self.nodes:  # two hooks with one basename: fall back to the path
                nid = "%s:%s:%s" % (r, kind, p)
            attrs = {}
            if p not in textset:
                attrs["asset"] = True
            if f.get("secret"):
                attrs["skipped"] = True
            if is_test_path(p):
                attrs["test"] = True
            self.node(nid, kind, base if kind not in ("skill",) else key, p, **attrs)
            self.path_ids[p] = nid
            parent = os.path.dirname(p)
            self.edge("%s:dir:%s" % (r, parent) if parent else "%s:repo:%s" % (r, r), "contains", nid, None,
                      X["fs"], 1.0)
            if f.get("secret"):
                self.counts["secret_skipped"] += 1
                self.misses.append(p)
            if f.get("error"):
                self.counts["extract_errors"] += 1

    # -- resolution
    def _resolve_js(self, frm, spec):
        if spec.startswith("."):
            base = os.path.normpath(os.path.join(os.path.dirname(frm), spec)).replace(os.sep, "/")
            return self._try_file(base)
        if spec.startswith("/"):
            return self._try_file(spec.lstrip("/"))
        for prefix, targets, cfgdir in self._aliases_for(frm):
            if prefix.endswith("*"):
                if spec.startswith(prefix[:-1]):
                    rest = spec[len(prefix) - 1:]
                    for tgt in targets:
                        cand = os.path.normpath(os.path.join(cfgdir, tgt.replace("*", rest))).replace(os.sep, "/")
                        hit = self._try_file(cand)
                        if hit:
                            return hit
            elif spec == prefix:
                for tgt in targets:
                    hit = self._try_file(os.path.normpath(os.path.join(cfgdir, tgt)).replace(os.sep, "/"))
                    if hit:
                        return hit
        return None

    def _try_file(self, base):
        if base.startswith("../") or base == "..":
            return None
        for ext in RESOLVE_EXT:
            if base + ext in self.pathset:
                return base + ext
        for ext in RESOLVE_EXT[1:]:
            if base + "/index" + ext in self.pathset:
                return base + "/index" + ext
        # TS: import './x.js' that is really x.ts
        stem, e = os.path.splitext(base)
        if e in (".js", ".jsx", ".mjs"):
            for ext in (".ts", ".tsx"):
                if stem + ext in self.pathset:
                    return stem + ext
        return None

    def _aliases_for(self, frm):
        if not hasattr(self, "_alias_cache"):
            self._alias_cache = {}
            self._tsconfigs = {}
            for p in self.paths:
                b = os.path.basename(p)
                if re.match(r"^(tsconfig[\w.]*|jsconfig)\.json$", b):
                    try:
                        cfg = load_json_lenient(self.src.read(p).decode("utf-8", "replace"))
                    except (ValueError, OSError):
                        continue
                    co = cfg.get("compilerOptions") or {}
                    paths = co.get("paths") or {}
                    if not paths:
                        continue
                    d = os.path.dirname(p)
                    cfgdir = os.path.normpath(os.path.join(d, co.get("baseUrl", "."))).replace(os.sep, "/")
                    cfgdir = "" if cfgdir == "." else cfgdir
                    self._tsconfigs.setdefault(d, [])
                    for k, v in sorted(paths.items()):
                        self._tsconfigs[d].append((k, v if isinstance(v, list) else [v], cfgdir))
            for k, v in sorted((self.config.get("aliases") or {}).items()):
                self._tsconfigs.setdefault("", []).append((k, v if isinstance(v, list) else [v], ""))
        d = os.path.dirname(frm)
        if d in self._alias_cache:
            return self._alias_cache[d]
        res = []
        cur = d
        while True:
            if cur in self._tsconfigs:
                res = self._tsconfigs[cur]
                break
            if not cur:
                break
            cur = os.path.dirname(cur)
        self._alias_cache[d] = res
        return res

    def _resolve_py(self, frm, mod, names):
        out = []
        if mod.startswith("."):
            dots = len(mod) - len(mod.lstrip("."))
            base = os.path.dirname(frm)
            for _ in range(dots - 1):
                base = os.path.dirname(base)
            rest = mod.lstrip(".")
            bases = [os.path.join(base, *rest.split(".")) if rest else base]
        else:
            parts = mod.split(".")
            bases = [os.path.join(*parts)]
            d = os.path.dirname(frm)  # script-relative imports (sys.path[0] = the script's dir)
            if d:
                bases.append(os.path.join(d, *parts))
            for extra in self.config.get("python_paths", []):
                bases.append(os.path.join(extra, *parts))
        for b in bases:
            b = b.replace(os.sep, "/")
            found = False
            for n in names:
                if b + "/" + n + ".py" in self.pathset:
                    out.append(b + "/" + n + ".py")
                    found = True
            if b + ".py" in self.pathset:
                out.append(b + ".py")
                found = True
            elif b + "/__init__.py" in self.pathset and not found:
                out.append(b + "/__init__.py")
                found = True
            if found:
                break
        return out

    def _resolve_doc_target(self, frm, target):
        target = urllib.parse.unquote(target.split("#")[0].split("?")[0])
        if not target:
            return None, False
        if target.startswith("/"):
            cand = target.lstrip("/")
        else:
            cand = os.path.normpath(os.path.join(os.path.dirname(frm), target)).replace(os.sep, "/")
        cand = cand.rstrip("/")
        if cand in self.pathset:
            return cand, True
        if cand in self.dirset:
            return cand + "/", True
        if cand.startswith(".."):
            return None, False  # outside this repo: the cross-repo index's job
        return None, True

    def _resolve_mention(self, frm, tok):
        tok = tok.strip().strip("'\"").rstrip(".,:;)")
        tok = re.sub(r":\d+(-\d+)?$", "", tok)
        if not tok or tok.startswith(("http", "$", "~", "<")) or "*" in tok or "{" in tok:
            return None
        for cand in (os.path.normpath(os.path.join(os.path.dirname(frm), tok)).replace(os.sep, "/"),
                     os.path.normpath(tok.lstrip("/")).replace(os.sep, "/")):
            if cand.startswith(".."):
                continue
            c = cand.rstrip("/")
            if c in self.pathset:
                return c
            if c in self.dirset and tok.endswith("/"):
                return c + "/"
        return None

    def _resolve_all(self):
        r = self.repo
        rpc_fns = {}
        for p, f in sorted(self.facts.items()):
            for name, writes in sorted(f.get("fns", {}).items()):
                rpc_fns.setdefault(name, set()).update(tb for _, tb in writes)
        stems = {}
        for p in self.paths:
            if p in self.facts and not is_test_path(p) and ext_of(p) in CODE_EXT:
                stems.setdefault(os.path.basename(p).rsplit(".", 1)[0], []).append(p)
        env_readers = {}
        for p in sorted(self.facts):
            f = self.facts[p]
            if f.get("secret") or not f.get("text"):
                continue
            s = self.fid(p)
            self.counts["unparsed_sql"] += f.get("unparsed_sql", 0)
            test = is_test_path(p)
            for spec, ev in f["imports"]:
                tgt = self._resolve_js(p, spec)
                if tgt and tgt != p:
                    self.edge(s, "imports", self.fid(tgt), ev, X["js"], 1.0)
                    if test and not is_test_path(tgt):
                        self.edge(self.fid(tgt), "tested_by", s, ev, X["test"], 1.0)
            for mod, names, ev in f["pyimports"]:
                for tgt in self._resolve_py(p, mod, names):
                    if tgt != p:
                        self.edge(s, "imports", self.fid(tgt), ev, X["py"], 1.0)
                        if test and not is_test_path(tgt):
                            self.edge(self.fid(tgt), "tested_by", s, ev, X["test"], 1.0)
            for name, ev in f["symbols"]:
                sid = "%s:symbol:%s#%s" % (r, p, name)
                self.node(sid, "symbol", name, p)
                self.edge(s, "contains", sid, ev, X["pysym"] if p.endswith(".py") else X["sym"], 1.0)
            tk = "test" if test else None   # F-4: a test's reads/writes are mocks, not the system's consumers
            for name, ev in f["env"]:
                eid = self.node("%s:env:%s" % (r, name), "env", name)
                self.edge(s, "reads_env", eid, ev, X["env"], 1.0, k=tk)
                if not test:
                    env_readers.setdefault(name, []).append(ev)
            for pred, tb, col, ev in f["sb"]:
                tid = self.node("%s:table:%s" % (r, tb), "table", tb)
                if col is None:
                    self.edge(s, pred, tid, ev, X["sb"], 1.0, k=tk)
                else:
                    cid = self.node("%s:column:%s.%s" % (r, tb, col), "column", "%s.%s" % (tb, col))
                    self.edge(tid, "contains", cid, None, X["sb"], 1.0)
                    self.edge(s, pred, cid, ev, X["sb"], 1.0, k=tk)
            for pred, tb, ev in f["sqlq"]:
                tid = self.node("%s:table:%s" % (r, tb), "table", tb)
                self.edge(s, pred, tid, ev, X["q"], 0.9, via="sql-literal", k=tk)
            for fn, ev in f["rpc"]:
                for tb in sorted(rpc_fns.get(fn, ())):
                    tid = self.node("%s:table:%s" % (r, tb), "table", tb)
                    self.edge(s, "writes_table", tid, ev, X["rpc"], 0.8, via="rpc:" + fn, k=tk)
            for pred, tb, col, ev in f["ddl"]:
                tid = self.node("%s:table:%s" % (r, tb), "table", tb)
                if pred == "writes_table:dml":
                    self.edge(s, "writes_table", tid, ev, X["sql"], 1.0, k="dml")
                elif col is None:
                    self.edge(s, "writes_table", tid, ev, X["sql"], 1.0, k="ddl")
                else:
                    cid = self.node("%s:column:%s.%s" % (r, tb, col), "column", "%s.%s" % (tb, col))
                    self.edge(tid, "contains", cid, None, X["sql"], 1.0)
                    self.edge(s, "writes_column", cid, ev, X["sql"], 1.0, k="ddl")
            for target, ev in f["links"]:
                tgt, inside = self._resolve_doc_target(p, target)
                if tgt:
                    if tgt != p:
                        self.edge(self.path_ids[tgt], "documented_in", s, ev, X["md"], 0.7)
                elif inside:
                    self.counts["broken_links"] += 1
                    self.broken.append({"doc": p, "link": target, "ev": ev})
            for tok, ev in f["mentions"]:
                tgt = self._resolve_mention(p, tok)
                if tgt and tgt != p:
                    self.edge(s, "mentions", self.path_ids[tgt], ev, X["ment"], 0.7)
            for key, name, cmd, d, ev in f["deploy"]:
                sid = self.node("%s:service:%s" % (r, key), "service", name, p, config=p)
                if not cmd:
                    continue
                for entry in self._entry_files(cmd, d):
                    self.edge(self.fid(entry), "deployed_as", sid, ev, X["dep"], 1.0)
            for name, paths, ev in f["deptab"]:
                sid = self.node("%s:service:%s" % (r, name), "service", name, "", documented=p)
                hit = False
                for pp in paths:
                    tgt = self._resolve_mention(p, pp)
                    if tgt and not tgt.endswith("/") and ext_of(tgt) in CODE_EXT:
                        self.edge(self.fid(tgt), "deployed_as", sid, ev, X["deptab"], 0.6)
                        hit = True
                if not hit:
                    self.edge("%s:repo:%s" % (r, r), "deployed_as", sid, ev, X["deptab"], 0.6)
        # services named in kg/config.json: {"services": {"<name>": "<config path>"}}
        for name, cfgp in sorted((self.config.get("services") or {}).items()):
            sid = self.node("%s:service:%s" % (r, name), "service", name, "", config=cfgp)
            for e in [e for e in list(self.edges.values()) if e["p"] == "deployed_as"
                      and e["o"].startswith("%s:service:%s" % (r, cfgp))]:
                self.edge(e["s"], "deployed_as", sid, e["ev"], X["dep"], 1.0)
        # tested_by by path convention (c = 0.5) where no import edge exists
        tested = {e["s"] for e in self.edges.values() if e["p"] == "tested_by"}
        for p in self.paths:
            if p not in self.facts or not is_test_path(p) or ext_of(p) not in CODE_EXT:
                continue
            b = os.path.basename(p)
            m = re.match(r"^(?:test_)?(.+?)(?:\.(?:test|spec)|_test)?\.[a-z]+$", b)
            stem = m.group(1) if m else None
            cands = stems.get(stem, []) if stem else []
            if 1 <= len(cands) <= 2:
                lines = (self.src.read_optional(p) or b"").decode("utf-8", "replace").split("\n")
                ev = "%s:1:%s" % (p, line_hash(lines[0] if lines else ""))
                for c in cands:
                    if self.fid(c) not in tested:
                        self.edge(self.fid(c), "tested_by", self.fid(p), ev, X["test"], 0.5)
        # flows <-> *_FLOW_ID env names, matched by normalised stem (c = 0.5)
        for p in self.paths:
            nid = self.fid(p)
            if not nid or self.nodes[nid]["kind"] != "flow":
                continue
            stem = re.sub(r"(\.flow)?\.json$", "", os.path.basename(p))
            norm = re.sub(r"[^a-z0-9]", "", stem.lower())
            for name, evs in sorted(env_readers.items()):
                if name.endswith("_FLOW_ID"):
                    en = re.sub(r"[^a-z0-9]", "", name[:-8].lower())
                    if en and (en == norm or (len(en) > 5 and (en in norm or norm in en))):
                        self.edge(nid, "mentions", "%s:env:%s" % (r, name), sorted(evs, key=_ev_order)[0],
                                  X["flow"], 0.5)
        self._beads()

    def _entry_files(self, cmd, d):
        out = []
        for part in re.split(r"&&|;|\|\|", cmd):
            m = re.search(r"\b(?:node|nodemon|ts-node|tsx|python3?|bash|sh)\s+(?:--?[\w-]+(?:=\S+)?\s+)*([\w./-]+)", part)
            if not m:
                continue
            arg = m.group(1)
            cd = re.search(r"\bcd\s+([\w./-]+)", cmd)
            bases = []
            if cd:
                bases.append(os.path.join(d, cd.group(1)))
                bases.append(cd.group(1))
            bases += [d, ""]
            dd = d
            while dd:
                dd = os.path.dirname(dd)
                bases.append(dd)
            for b in bases:
                cand = os.path.normpath(os.path.join(b, arg)).replace(os.sep, "/")
                hit = cand if cand in self.pathset else self._try_file(cand)
                if hit:
                    out.append(hit)
                    break
        return out

    def _bead_items(self):
        """The ledger: --beads <bd list --json | issues.jsonl>, else the committed kg/beads.jsonl snapshot."""
        if self.beads:
            try:
                with open(self.beads) as f:
                    txt = f.read()
            except OSError:
                return []
        else:
            raw = self.src.read_optional(BEADS_PATH)
            if raw is None:
                return []
            txt = raw.decode("utf-8", "replace")
        try:
            data = json.loads(txt)
            if isinstance(data, dict):     # a one-line JSONL file parses as one object
                return [data] if "id" in data else data.get("issues", [])
            return data
        except ValueError:
            return [json.loads(ln) for ln in txt.splitlines() if ln.strip().startswith("{")]

    def bead_links(self, items):
        """[(bead, implements, named, mentions)] for every bead that names a path in this repo. close_reason →
        implements (c 0.8), title → implements (c 0.6), description/notes/design/acceptance → mentions (c 0.6).
        A snapshot row (kg/beads.jsonl) already carries the three lists."""
        prefixes = self.config.get("bead_path_prefixes", [])

        def paths_in(text):
            hits = set()
            for m in re.finditer(r"[\w.@ &/-]*?([\w.-]+/)+[\w.-]+\.\w+", text):
                tok = m.group(0).strip()
                for pre in [""] + prefixes:
                    t2 = tok[len(pre):] if pre and tok.startswith(pre) else (tok if not pre else None)
                    if t2 is None:
                        continue
                    t2 = t2.lstrip("./")
                    for cand in (t2, t2.split(" ")[-1]):
                        if cand in self.pathset:
                            hits.add(cand)
            return hits

        out = []
        for b in sorted(items, key=lambda x: str(x.get("id"))):
            if any(k in b for k in ("implements", "named", "mentions")):
                done, named, said = ({p for p in b.get(k) or [] if p in self.pathset}
                                     for k in ("implements", "named", "mentions"))
            else:
                done = paths_in(str(b.get("close_reason") or ""))
                named = paths_in(str(b.get("title") or "")) - done
                said = paths_in(" ".join(str(b.get(k) or "") for k in ("description", "notes", "design",
                                                                        "acceptance_criteria"))) - done - named
            if done or named or said:
                out.append((b, done, named, said))
        return out

    def _beads(self):
        for b, done, named, said in self.bead_links(self._bead_items()):
            bid = str(b.get("id"))
            attrs = {"status": b.get("status")}
            if b.get("title"):
                attrs["title"] = str(b["title"])[:120]
            for k in ("closed_at", "updated_at"):
                if b.get(k):
                    attrs[k] = str(b[k])
            nid = self.node("bead:" + bid, "bead", bid, "", **attrs)
            ev = "bead:%s:%s" % (bid, line_hash(str(b.get("title") or bid)))
            for h in sorted(done):
                self.edge(nid, "implements", self.fid(h), ev, X["bead"], 0.8)
            for h in sorted(named):
                self.edge(nid, "implements", self.fid(h), ev, X["bead"], 0.6)
            for h in sorted(said):
                self.edge(nid, "mentions", self.fid(h), ev, X["bead"], 0.6)

    # -- summaries (purposes)
    def _summaries(self):
        self.summaries = {}
        for p in sorted(self.src.entries):
            if p.startswith("kg/summaries/") and p.endswith(".jsonl"):
                for ln in (self.src.read(p) or b"").decode("utf-8", "replace").splitlines():
                    if not ln.strip():
                        continue
                    try:
                        s = json.loads(ln)
                    except ValueError:
                        continue
                    path = s.get("id", "").split(":", 2)[-1]
                    self.summaries[path] = s
        if not self.ref:
            d = os.path.join(self.root, SUMMARY_DIR)
            if os.path.isdir(d):
                for fn in sorted(os.listdir(d)):
                    if fn.endswith(".jsonl") and "kg/summaries/" + fn not in self.src.entries:
                        with open(os.path.join(d, fn)) as fh:
                            for ln in fh:
                                if ln.strip():
                                    s = json.loads(ln)
                                    self.summaries[s.get("id", "").split(":", 2)[-1]] = s
        for path, s in self.summaries.items():
            f = self.facts.get(path)
            nid = self.path_ids.get(path)
            if not nid:
                continue
            cur = f.get("sha256") if f else None
            stale = bool(s.get("stale")) or (cur is not None and s.get("sha") != cur)
            self.nodes[nid]["attrs"]["purpose"] = s.get("purpose", "")
            if stale:
                self.nodes[nid]["attrs"]["purpose_stale"] = True

    # -- output
    def _write(self, newcache, t0):
        os.makedirs(self.out, exist_ok=True)
        nodes = [self.nodes[k] for k in sorted(self.nodes)]
        edges = sorted(self.edges.values(), key=lambda e: (e["s"], e["p"], e["o"], e.get("via", ""), e.get("k", "")))
        for e in edges:
            if e.get("n") == 1:
                del e["n"]
        with open(os.path.join(self.out, "nodes.jsonl"), "w") as f:
            for n in nodes:
                f.write(json.dumps(n, sort_keys=True, ensure_ascii=False) + "\n")
        with open(os.path.join(self.out, "edges.jsonl"), "w") as f:
            for e in edges:
                f.write(json.dumps(e, sort_keys=True, ensure_ascii=False) + "\n")
        with open(os.path.join(self.out, "misses"), "w") as f:
            for p in sorted(set(self.misses)):
                f.write(p + "\n")
        with open(os.path.join(self.out, "broken_links.jsonl"), "w") as f:
            for b in sorted(self.broken, key=lambda b: (b["doc"], _ev_order(b["ev"]), b["link"])):
                f.write(json.dumps(b, sort_keys=True, ensure_ascii=False) + "\n")
        with open(os.path.join(self.out, "cache.marshal"), "wb") as f:
            marshal.dump({"key": CACHE_KEY, "repo": self.repo, "files": newcache}, f)
        commit = None
        try:
            commit = subprocess.run(["git", "-C", self.root, "rev-parse", self.ref or "HEAD"], capture_output=True,
                                    text=True).stdout.strip() or None
        except OSError:
            pass
        g = KG(self.root, self.out, nodes={n["id"]: n for n in nodes}, edges=edges, config=self.config,
               repo=self.repo, no_door=self.no_door, source=self.src)
        counts = g.compute_counts(self.counts)
        manifest = {"kg_py": VERSION, "repo": self.repo, "commit": commit, "ref": self.ref,
                    "excluded_dirs": dict(sorted(self.excluded_dirs.items())),
                    "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "build_seconds": round(time.time() - t0, 2), "counts": counts}
        g.manifest = manifest
        with open(os.path.join(self.out, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=1, sort_keys=True)
            f.write("\n")
        with open(os.path.join(self.out, "graph.marshal"), "wb") as f:
            marshal.dump({"nodes": nodes, "edges": edges, "manifest": manifest, "config": self.config,
                          "dirs_door": g.dirs_needing_door(), "existing_doors": sorted(g.existing_doors),
                          "test_only": sorted(g.test_only)}, f)
        if not self.ref and os.path.isdir(os.path.join(self.root, "kg")):
            committed = {"kg_py": VERSION, "repo": self.repo, "counts": counts,
                         "excluded_dirs": dict(sorted(self.excluded_dirs.items()))}
            with open(os.path.join(self.root, "kg", "manifest.json"), "w") as f:
                json.dump(committed, f, indent=1, sort_keys=True)
                f.write("\n")
        if doors is not None and hasattr(doors, "build_cards"):
            cards = doors.build_cards(g)
            with open(os.path.join(self.out, "cards.json"), "w") as f:
                json.dump(cards, f, sort_keys=True, ensure_ascii=False)
        if not self.quiet:
            print("kg build %s: %d nodes, %d edges, %d files in %.1fs -> %s" % (
                self.repo, len(nodes), len(edges), counts["files"], time.time() - t0, self.out))


def _ev_order(ev):
    try:
        path, line, _ = ev.rsplit(":", 2)
        return (path, int(line))
    except (ValueError, AttributeError):
        return (str(ev), 0)


# ------------------------------------------------------------------------------------------------ the graph (queries)

class KG:
    """Read-only view of a built graph. doors.py receives one of these (see SCHEMA.md §doors seam)."""

    def __init__(self, root, kg_dir, nodes, edges, manifest=None, config=None, repo=None, no_door=None,
                 source=None, dirs_door=None, existing_doors=None, test_only=None):
        self.root = os.path.abspath(root)
        self.kg_dir = kg_dir
        self.nodes = nodes
        self.edges = edges
        self.manifest = manifest or {"counts": {}}
        self.config = config or {}
        self.repo = repo or self.manifest.get("repo")
        self.no_door = no_door if no_door is not None else DEFAULT_NO_DOOR + self.config.get("no_door", [])
        self._src = source
        self._out = None
        self._in = None
        self._by_path = None
        self._dirs_door = dirs_door
        self.test_only = set(test_only or ())
        self.existing_doors = set(existing_doors) if existing_doors is not None else {
            os.path.dirname(n["path"]) for n in nodes.values()
            if n.get("path") and os.path.basename(n["path"]) == "CLAUDE.md"}

    @classmethod
    def load(cls, root, kg_dir=None):
        root = os.path.abspath(root)
        kg_dir = os.path.abspath(kg_dir) if kg_dir else os.path.join(root, KG_DIR)
        gm = os.path.join(kg_dir, "graph.marshal")
        if os.path.exists(gm):
            with open(gm, "rb") as f:
                d = marshal.load(f)
            return cls(root, kg_dir, {n["id"]: n for n in d["nodes"]}, d["edges"], d["manifest"], d["config"],
                       dirs_door=d.get("dirs_door"), existing_doors=d.get("existing_doors"),
                       test_only=d.get("test_only"))
        nodes, edges = {}, []
        with open(os.path.join(kg_dir, "nodes.jsonl")) as f:
            for ln in f:
                n = json.loads(ln)
                nodes[n["id"]] = n
        with open(os.path.join(kg_dir, "edges.jsonl")) as f:
            edges = [json.loads(ln) for ln in f]
        man = {}
        mp = os.path.join(kg_dir, "manifest.json")
        if os.path.exists(mp):
            with open(mp) as f:
                man = json.load(f)
        return cls(root, kg_dir, nodes, edges, man)

    # -- indexes
    def _index(self):
        if self._out is not None:
            return
        self._out, self._in = {}, {}
        for e in self.edges:
            self._out.setdefault(e["s"], []).append(e)
            self._in.setdefault(e["o"], []).append(e)
        self._by_path = {}
        for n in self.nodes.values():
            if n["kind"] == "dir":
                self._by_path[n["path"] + "/"] = n["id"]
            elif n.get("path") and n["kind"] not in ("symbol", "service"):
                self._by_path[n["path"]] = n["id"]

    def node(self, nid):
        return self.nodes.get(nid)

    def file_id(self, path):
        self._index()
        path = path.lstrip("./") if path.startswith("./") else path
        return self._by_path.get(path) or self._by_path.get(path.rstrip("/") + "/")

    def out_edges(self, nid, p=None):
        self._index()
        return [e for e in self._out.get(nid, []) if p is None or e["p"] == p]

    def in_edges(self, nid, p=None):
        self._index()
        return [e for e in self._in.get(nid, []) if p is None or e["p"] == p]

    def children(self, dir_path):
        did = self.file_id(dir_path.rstrip("/") + "/") if dir_path not in ("", ".") else \
            "%s:repo:%s" % (self.repo, self.repo)
        return sorted(e["o"] for e in self.out_edges(did, "contains"))

    def summary(self, path):
        nid = self.file_id(path)
        n = self.nodes.get(nid) if nid else None
        if not n or "purpose" not in n["attrs"]:
            return None
        return {"id": nid, "purpose": n["attrs"]["purpose"], "stale": bool(n["attrs"].get("purpose_stale"))}

    def purpose(self, path):
        s = self.summary(path)
        return s["purpose"] if s else None

    # -- doors needed (D-9 + RULING Q3)
    def dirs_needing_door(self):
        if self._dirs_door is not None:
            return self._dirs_door
        files_by_dir, kids = {}, {}
        special = set()
        for n in self.nodes.values():
            if n["kind"] in ("symbol", "service", "table", "column", "env", "bead", "repo", "feature"):
                continue
            p = n.get("path")
            if not p:
                continue
            parent = os.path.dirname(p)
            kids[parent] = kids.get(parent, 0) + 1
            if n["kind"] == "dir":
                continue
            if not n["attrs"].get("asset") and not is_rendered(p):
                files_by_dir[parent] = files_by_dir.get(parent, 0) + 1
            if n["kind"] == "flow":
                special.add(parent)
        self._index()
        for e in self.edges:
            if e["p"] == "deployed_as" and e.get("c", 0) >= 1.0:
                n = self.nodes.get(e["s"])
                if n and n.get("path"):
                    special.add(os.path.dirname(n["path"]))
        need = {d for d, c in files_by_dir.items() if c >= 3}
        need |= special
        need |= self.existing_doors
        for d, c in kids.items():
            if c > 40:
                for n in self.nodes.values():
                    if n["kind"] == "dir" and os.path.dirname(n["path"]) == d:
                        need.add(n["path"])
        # LR-2: a directory whose files are all tests gets no door (its parent's row says `(no door; N tests)`)
        self.test_only = {d for d in need if self._test_only(d, kids.get(d, 0))}
        need = {d for d in need if d and not glob_match(d, self.no_door) and d not in self.test_only}
        # every ancestor of a door gets a door, so each door is reachable hop by hop from the repo root
        for d in list(need):
            a = os.path.dirname(d)
            while a:
                if not glob_match(a, self.no_door) and a not in self.test_only:
                    need.add(a)
                a = os.path.dirname(a)
        self._dirs_door = sorted(need)
        return self._dirs_door

    def _test_only(self, d, nkids):
        """LR-2: every file directly in d is a test, nothing under d is a fixture harness or other code (a code file
        whose own name is not a test name: `helpers.js`, `conftest.py`, `support/commands.ts`), and d has <= 40
        children."""
        if nkids > 40:
            return False
        prefix = d + "/"
        direct = 0
        for n in self.nodes.values():
            p = n.get("path") or ""
            if n["kind"] in ("dir", "symbol", "service") or not p.startswith(prefix) or n["attrs"].get("asset"):
                continue
            if is_rendered(p):
                continue
            if "/" not in p[len(prefix):]:
                direct += 1
                if not is_test_path(p):
                    return False
            if ext_of(p) in CODE_EXT and not is_test_name(p):
                return False
            if os.path.basename(os.path.dirname(p)) in ("__mocks__", "fixtures") and ext_of(p) in CODE_EXT:
                return False
        return direct > 0

    def slice_hash(self, dir_path):
        prefix = dir_path.rstrip("/") + "/"
        h = hashlib.sha256()
        for nid in sorted(self.nodes):
            n = self.nodes[nid]
            if n.get("path", "").startswith(prefix) and "/" not in n["path"][len(prefix):]:
                h.update(json.dumps(n, sort_keys=True).encode())
                for e in self.out_edges(nid) + self.in_edges(nid):
                    h.update(json.dumps(e, sort_keys=True).encode())
        return h.hexdigest()[:12]

    # -- evidence
    def _read_lines(self, path):
        if self.manifest.get("ref") and self.manifest.get("commit"):
            # a graph built with --ref is checked against that commit, never the (possibly stale) checkout
            r = subprocess.run(["git", "-C", self.root, "show", "%s:%s" % (self.manifest["commit"], path)],
                               capture_output=True)
            return r.stdout.decode("utf-8", "replace").split("\n") if r.returncode == 0 else None
        full = os.path.join(self.root, path)
        try:
            with open(full, "rb") as f:
                return f.read().decode("utf-8", "replace").split("\n")
        except OSError:
            if self._src is not None:
                raw = self._src.read_optional(path)
                if raw is not None:
                    return raw.decode("utf-8", "replace").split("\n")
            return None

    def check_ev(self, ev, token=None):
        """'ok' | 'moved' (same content, other line) | 'changed' (content or token gone) | 'missing' (no file)."""
        if not ev:
            return "missing"
        if ev.startswith("bead:"):
            return "ok"
        try:
            path, line, h8 = ev.rsplit(":", 2)
            line = int(line)
        except ValueError:
            return "missing"
        lines = self._read_lines(path)
        if lines is None:
            return "missing"
        if h8 == EMPTY_HASH:
            return "changed"   # an ev on a blank line proves nothing
        if 1 <= line <= len(lines) and line_hash(lines[line - 1]) == h8:
            if token and token not in lines[line - 1]:
                return "changed"
            return "ok"
        for ln in lines:
            if line_hash(ln) == h8 and (not token or token in ln):
                return "moved"
        return "changed"

    # -- who reads (Rule 10 as a query)
    def consumers(self, nid, tests=False):
        """Every consumer of a file, table, column or env node, including data-mediated ones. A test file's own
        reads and writes (edges tagged k=test, F-4) are mocks, left out unless tests=True."""
        out = []
        n = self.nodes.get(nid)
        if not n:
            return out

        def add(via, e, who_id, c=None):
            if e.get("k") == "test" and not tests:
                return
            who = self.nodes.get(who_id) or {}
            live = bool(self.in_edges(who_id, "imports") or self.out_edges(who_id, "deployed_as")
                        or who.get("kind") == "service")
            out.append({"via": via, "consumer": who.get("path") or who_id, "id": who_id, "ev": e.get("ev"),
                        "c": c if c is not None else e.get("c", 1.0), "live": live})

        kind = n["kind"]
        if kind == "env":
            for e in self.in_edges(nid, "reads_env"):
                add("reads env %s" % n["name"], e, e["s"])
        elif kind == "column":
            table, col = n["name"].split(".", 1)
            for e in self.in_edges(nid):
                if e["p"] in ("reads_column", "writes_column") and e.get("k") != "ddl":
                    add("%s %s" % (e["p"].replace("_", " "), n["name"]), e, e["s"])
            star = "%s:column:%s.*" % (self.repo, table)
            for e in self.in_edges(star, "reads_column"):
                add("reads %s.* (whole row)" % table, e, e["s"], c=min(e.get("c", 1.0), 0.7))
        elif kind == "table":
            for e in self.in_edges(nid):
                if e["p"] in ("reads_table", "writes_table") and e.get("k") != "ddl":
                    add("%s %s" % (e["p"].replace("_", " "), n["name"]), e, e["s"])
        else:
            for e in self.in_edges(nid, "imports"):
                add("imports it", e, e["s"])
            for e in self.out_edges(nid, "tested_by"):
                add("tests it", e, e["o"])
            for e in self.out_edges(nid, "deployed_as"):
                add("deployed as %s" % self.nodes.get(e["o"], {}).get("name", e["o"]), e, e["o"])
            for e in self.out_edges(nid):
                if e.get("k") == "test" and not tests:
                    continue
                if e["p"] == "writes_column":
                    col = self.nodes.get(e["o"], {})
                    for c in self.consumers(e["o"], tests):
                        if c["id"] != nid and c["via"].startswith("reads"):
                            c["via"] = "reads %s (written here)" % col.get("name")
                            out.append(c)
                elif e["p"] == "writes_table" and e.get("k") != "ddl":
                    tb = self.nodes.get(e["o"], {})
                    for c in self.consumers(e["o"], tests):
                        if c["id"] != nid and c["via"].startswith("reads"):
                            c["via"] = "reads table %s (written here)" % tb.get("name")
                            c["c"] = min(c["c"], 0.7)
                            out.append(c)
        seen, uniq = set(), []
        for c in sorted(out, key=lambda c: (-c["c"], not c["live"], c["consumer"], c["via"])):
            k = (c["consumer"], c["via"])
            if k in seen:
                continue
            seen.add(k)
            uniq.append(c)
        return uniq

    def resolve_target(self, q):
        if q.startswith("env:"):
            return "%s:env:%s" % (self.repo, q[4:])
        nid = self.file_id(q)
        if nid:
            return nid
        if re.match(r"^[\w.]+\.[\w*]+$", q) and "%s:column:%s" % (self.repo, q) in self.nodes:
            return "%s:column:%s" % (self.repo, q)
        if "%s:table:%s" % (self.repo, q) in self.nodes:
            return "%s:table:%s" % (self.repo, q)
        if q in self.nodes:
            return q
        return None

    def door_for(self, path):
        d = os.path.dirname(path.rstrip("/")) if not path.endswith("/") else path.rstrip("/")
        while True:
            if d in self.existing_doors:
                return (d + "/CLAUDE.md") if d else "CLAUDE.md"
            if not d:
                return None
            d = os.path.dirname(d)

    # -- coverage
    def compute_counts(self, extra=None):
        files = [n for n in self.nodes.values() if n["kind"] in ("file", "doc", "report", "flow", "skill", "hook")]
        mapp = [n for n in files if not n["attrs"].get("asset") and not is_rendered(n.get("path") or "")]
        purposes = [n for n in mapp if n["attrs"].get("purpose")]
        stale = [n for n in purposes if n["attrs"].get("purpose_stale")]
        need = self.dirs_needing_door()
        doors_have = [d for d in need if d in self.existing_doors]
        ev_edges = [e for e in self.edges if e["p"] != "contains"]
        sym_edges = [e for e in self.edges if e["p"] == "contains" and e.get("ev")]
        by_p = {}
        for e in self.edges:
            by_p[e["p"]] = by_p.get(e["p"], 0) + 1
        overflow = None
        stale_doors = None
        if doors is not None and hasattr(doors, "door_stats"):
            try:
                ds = doors.door_stats(self)
                overflow, stale_doors = ds.get("overflow_rows"), ds.get("stale_doors")
            except Exception:  # a doors bug must not break stats
                pass
        elif doors is not None and hasattr(doors, "overflow_rows"):
            try:
                overflow = doors.overflow_rows(self)
            except Exception:  # a doors bug must not break stats
                overflow = None
        misses = 0
        mp = os.path.join(self.kg_dir, "misses") if self.kg_dir else None
        if mp and os.path.exists(mp):
            with open(mp) as f:
                misses = sum(1 for ln in f if ln.strip())
        c = {"nodes": len(self.nodes), "edges": len(self.edges), "files": len(files), "mappable_files": len(mapp),
             "assets": len(files) - len(mapp), "purposes": len(purposes), "stale": len(stale),
             "missing_purposes": len(mapp) - len(purposes), "doors": len(doors_have),
             "dirs_needing_door": len(need), "dirs_missing_door": len(need) - len(doors_have),
             "test_only_no_door": len(self.test_only),
             "edges_with_ev": sum(1 for e in ev_edges if e.get("ev")) + len(sym_edges),
             "edges_needing_ev": len(ev_edges) + len(sym_edges), "overflow_rows": overflow, "misses": misses,
             "tables": sum(1 for n in self.nodes.values() if n["kind"] == "table"),
             "envs": sum(1 for n in self.nodes.values() if n["kind"] == "env"),
             "services": sum(1 for n in self.nodes.values() if n["kind"] == "service"), "stale_doors": stale_doors,
             "by_predicate": dict(sorted(by_p.items())), "unparsed_sql": 0, "broken_links": 0}
        if extra:
            c.update(extra)
        return c

    def coverage(self):
        c = self.manifest.get("counts", {})

        def pct(a, b):
            return round(100.0 * a / b, 2) if b else 100.0
        return {"purposes_pct": pct(c.get("purposes", 0) - c.get("stale", 0), c.get("mappable_files", 0)),
                "doors_pct": pct(c.get("doors", 0), c.get("dirs_needing_door", 0)),
                "edges_with_ev_pct": pct(c.get("edges_with_ev", 0), c.get("edges_needing_ev", 0))}


# ------------------------------------------------------------------------------------------------ CLI helpers

def emit(args, obj, text):
    if getattr(args, "json", False):
        print(json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=False))
    else:
        print(text)


def repo_name_for(root):
    cfg = os.path.join(root, CONFIG_PATH)
    if os.path.exists(cfg):
        try:
            with open(cfg) as f:
                name = json.load(f).get("repo")
            if name:
                return name
        except ValueError:
            pass
    built = os.path.join(root, KG_DIR, "manifest.json")
    if os.path.exists(built):
        try:
            with open(built) as f:
                name = json.load(f).get("repo")
            if name:
                return name
        except ValueError:
            pass
    try:
        url = subprocess.run(["git", "-C", root, "remote", "get-url", "origin"], capture_output=True,
                             text=True).stdout.strip()
        if url:
            return re.sub(r"\.git$", "", url.rstrip("/").split("/")[-1].split(":")[-1])
    except OSError:
        pass
    return os.path.basename(os.path.abspath(root))


def load_graph(args):
    root = os.path.abspath(args.repo_root)
    kgd = getattr(args, "kg_dir", None)
    g = KG.load(root, kgd)
    return g


def _tokens(q):
    return [t for t in re.split(r"[^a-z0-9]+", q.lower()) if len(t) > 1]


def cmd_build(args):
    root = os.path.abspath(args.repo_root)
    repo = args.repo_name or repo_name_for(root)
    beads = args.beads
    b = Builder(root, repo, ref=args.ref, out=args.out, beads=beads, quiet=args.quiet)
    if args.changed and not args.quiet:
        print("kg build --changed: %d path(s); unchanged files come from the blob-sha cache" % len(args.changed))
    return b.run()


def cmd_find(args):
    g = load_graph(args)
    toks = _tokens(" ".join(args.query))
    raw = " ".join(args.query).lower()
    scored = []
    for n in g.nodes.values():
        if n["kind"] in ("dir",) and not args.dirs:
            pass
        name = (n.get("name") or "").lower()
        path = (n.get("path") or "").lower()
        purpose = (n["attrs"].get("purpose") or "").lower()
        if not (name or path):
            continue
        s = 0.0
        if raw == name or raw == path:
            s += 20
        if raw and raw in name:
            s += 8
        for t in toks:
            if t in name:
                s += 4
            if t in path:
                s += 2
            if re.search(r"\b" + re.escape(t), purpose):
                s += 3
        if s <= 0:
            continue
        if n["kind"] == "symbol":
            s *= 0.6
        if n["attrs"].get("test"):
            s *= 0.7
        scored.append((-s, n["id"], n))
    scored.sort()
    res = []
    # I-2: a query naming a table or an env var answers with its readers/writers first (`who-reads`)
    words = [w for w in re.split(r"\s+", " ".join(args.query).strip()) if w]
    names = [w for w in words if w.lower() not in ("table", "env", "column", "who", "reads", "writes")]
    seen_paths = set()
    for w in names:
        for tgt in ("%s:table:%s" % (g.repo, w), "%s:env:%s" % (g.repo, w.upper() if w.isupper() else w)):
            if tgt not in g.nodes:
                continue
            for c in g.consumers(tgt):
                if c["consumer"] in seen_paths:
                    continue
                seen_paths.add(c["consumer"])
                cn = g.nodes.get(c["id"]) or {}
                res.append({"id": c["id"], "kind": cn.get("kind", "file"), "path": c["consumer"],
                            "purpose": (cn.get("attrs") or {}).get("purpose"), "door": g.door_for(c["consumer"]),
                            "score": 100.0, "via": c["via"]})
    for negs, nid, n in scored[:args.limit]:
        if n.get("path") in seen_paths:
            continue
        res.append({"id": nid, "kind": n["kind"], "path": n.get("path"), "purpose": n["attrs"].get("purpose"),
                    "door": g.door_for(n.get("path") or ""), "score": round(-negs, 2)})
    res = res[:max(args.limit, len(seen_paths))]
    text = "\n".join("%-6s %s%s" % (r["kind"], r["path"] or r["id"], ("  — " + r["purpose"]) if r["purpose"] else "")
                     for r in res) or "(no match)"
    emit(args, {"query": " ".join(args.query), "results": res}, text)
    return 0 if res else 1


def cmd_file(args):
    g = load_graph(args)
    nid = g.resolve_target(args.path)
    if not nid:
        emit(args, {"error": "not in the graph", "path": args.path}, "not in the graph: %s" % args.path)
        return 1
    n = g.node(nid)
    outg, ing = {}, {}
    for e in g.out_edges(nid):
        if e["p"] == "contains" and not e.get("ev"):
            continue
        outg.setdefault(e["p"], []).append({"o": e["o"], "ev": e.get("ev"), "c": e["c"]})
    for e in g.in_edges(nid):
        if e["p"] == "contains":
            continue
        ing.setdefault(e["p"], []).append({"s": e["s"], "ev": e.get("ev"), "c": e["c"]})
    tests = sorted({g.nodes[e["o"]]["path"] for e in g.out_edges(nid, "tested_by") if e["o"] in g.nodes})
    obj = {"id": nid, "kind": n["kind"], "path": n.get("path"), "purpose": n["attrs"].get("purpose"),
           "purpose_stale": bool(n["attrs"].get("purpose_stale")), "out": outg, "in": ing, "tests": tests,
           "door": g.door_for(n.get("path") or "")}
    lines = ["%s  [%s]" % (n.get("path") or nid, n["kind"]), "purpose: %s%s" % (
        obj["purpose"] or "(none)", " (stale)" if obj["purpose_stale"] else "")]
    for p, es in sorted(outg.items()):
        lines.append("%s → %s" % (p, ", ".join(_short(g, x["o"]) + ("?" if x["c"] < 0.8 else "") for x in es[:12])
                                  + (" … +%d" % (len(es) - 12) if len(es) > 12 else "")))
    for p, es in sorted(ing.items()):
        lines.append("%s ← %s" % (p, ", ".join(_short(g, x["s"]) + ("?" if x["c"] < 0.8 else "") for x in es[:12])
                                  + (" … +%d" % (len(es) - 12) if len(es) > 12 else "")))
    lines.append("tests: %s" % (", ".join(tests) or "(none)"))
    lines.append("door: %s" % (obj["door"] or "(none)"))
    emit(args, obj, "\n".join(lines))
    return 0


def _short(g, nid):
    n = g.nodes.get(nid)
    if not n:
        return nid
    if n["kind"] in ("table", "column", "env", "service", "bead", "skill"):
        return "%s:%s" % (n["kind"], n["name"])
    return n.get("path") or n["name"]


def cmd_who_reads(args):
    g = load_graph(args)
    nid = g.resolve_target(args.target)
    if not nid:
        emit(args, {"error": "not in the graph", "target": args.target, "consumers": []},
             "not in the graph: %s" % args.target)
        return 1
    cons = g.consumers(nid, tests=args.tests)
    text = "\n".join("%s%s  %s  ← %s" % (c["consumer"], "?" if c["c"] < 0.8 else "", c["via"], c["ev"])
                     for c in cons) or "(no consumers found)"
    emit(args, {"target": nid, "consumers": cons}, text)
    return 0


def cmd_feature(args):
    g = load_graph(args)
    name = args.name.lower()
    feats = g.config.get("features") or {}
    globs = feats.get(args.name) or feats.get(name)
    files = []
    for n in g.nodes.values():
        p = n.get("path")
        if not p or n["kind"] in ("symbol", "dir"):
            continue
        if globs:
            if glob_match(p, globs):
                files.append(n["id"])
        elif name in p.lower() or name in (n["attrs"].get("purpose") or "").lower():
            files.append(n["id"])
    files = sorted(set(files))
    rel = {"tables": set(), "services": set(), "flows": set(), "skills": set(), "beads": set(), "docs": set(),
           "envs": set()}
    for fid in files:
        k = g.nodes[fid]["kind"]
        if k == "flow":
            rel["flows"].add(g.nodes[fid]["path"])
        if k == "skill":
            rel["skills"].add(g.nodes[fid]["name"])
        for e in g.out_edges(fid):
            o = g.nodes.get(e["o"], {})
            if e["p"] in ("reads_table", "writes_table"):
                rel["tables"].add(o.get("name"))
            elif e["p"] == "deployed_as":
                rel["services"].add(o.get("name"))
            elif e["p"] == "reads_env":
                rel["envs"].add(o.get("name"))
            elif e["p"] == "documented_in":
                rel["docs"].add(o.get("path"))
        for e in g.in_edges(fid):
            s = g.nodes.get(e["s"], {})
            if e["p"] == "implements":
                rel["beads"].add(s.get("name"))
            elif e["p"] == "mentions" and s.get("kind") == "skill":
                rel["skills"].add(s.get("name"))
    obj = {"feature": args.name, "source": "config" if globs else "name match",
           "files": [g.nodes[f]["path"] for f in files]}
    obj.update({k: sorted(x for x in v if x) for k, v in rel.items()})
    lines = ["feature %s (%s): %d files" % (args.name, obj["source"], len(files))]
    for k in ("files", "tables", "services", "flows", "envs", "skills", "beads", "docs"):
        if obj[k]:
            lines.append("%s: %s" % (k, ", ".join(obj[k][:25]) + (" … +%d" % (len(obj[k]) - 25)
                                                                   if len(obj[k]) > 25 else "")))
    emit(args, obj, "\n".join(lines))
    return 0 if files else 1


def cmd_stale(args):
    g = load_graph(args)
    missing, stale = [], []
    for n in sorted(g.nodes.values(), key=lambda n: n.get("path") or ""):
        if n["kind"] in ("file", "doc", "report", "flow", "skill", "hook") and not n["attrs"].get("asset") \
                and not is_rendered(n.get("path") or ""):
            if not n["attrs"].get("purpose"):
                missing.append(n["path"])
            elif n["attrs"].get("purpose_stale"):
                stale.append(n["path"])
    need = g.dirs_needing_door()
    no_door = [d for d in need if d not in g.existing_doors]
    stale_doors = []
    for d in sorted(g.existing_doors):
        p = os.path.join(g.root, d, "CLAUDE.md") if d else os.path.join(g.root, "CLAUDE.md")
        try:
            with open(p) as f:
                head = f.read(4000)
        except OSError:
            continue
        m = re.search(r"<!-- kg:meta [^>]*\bkg=([0-9a-f]{12})", head)
        if m and m.group(1) != g.slice_hash(d):
            stale_doors.append(d or ".")
    broken = []
    bp = os.path.join(g.kg_dir, "broken_links.jsonl")
    if os.path.exists(bp):
        with open(bp) as f:
            broken = [json.loads(ln) for ln in f if ln.strip()]
    obj = {"missing_purposes": missing, "stale_purposes": stale, "dirs_needing_door": no_door,
           "stale_doors": stale_doors, "broken_links": broken}
    text = "missing purposes: %d\nstale purposes: %d\ndirs needing a door: %d\nstale doors: %d\nbroken links: %d" % (
        len(missing), len(stale), len(no_door), len(stale_doors), len(broken))
    if args.verbose:
        for k in ("stale_purposes", "stale_doors", "dirs_needing_door", "missing_purposes"):
            for p in obj[k][:200]:
                text += "\n%s\t%s" % (k, p)
        for b in broken[:200]:
            text += "\nbroken_link\t%s\t(%s)" % (b["ev"], b["link"])
    emit(args, obj, text)
    return 0


def cmd_stats(args):
    g = load_graph(args)
    cov = g.coverage()
    obj = {"repo": g.manifest.get("repo"), "commit": g.manifest.get("commit"), "kg_py": g.manifest.get("kg_py"),
           "counts": g.manifest.get("counts", {}), "coverage": cov}
    rc = 0
    if args.baseline:
        with open(args.baseline) as f:
            base = json.load(f)
        drops = {k: (base["coverage"][k], v) for k, v in cov.items()
                 if k in base.get("coverage", {}) and v < base["coverage"][k]}
        obj["baseline_drops"] = drops
        rc = 1 if drops else 0
    c = obj["counts"]
    text = ("%s @ %s (kg.py %s)\nnodes %s · edges %s · files %s (mappable %s, assets %s)\n"
            "purposes %s/%s (%.1f%%, stale %s) · doors %s/%s (%.1f%%) · edges with ev %.1f%%\n"
            "tables %s · envs %s · services %s · unparsed_sql %s · broken_links %s · overflow_rows %s · misses %s"
            % (obj["repo"], (obj["commit"] or "?")[:10], obj["kg_py"], c.get("nodes"), c.get("edges"), c.get("files"),
               c.get("mappable_files"), c.get("assets"), c.get("purposes"), c.get("mappable_files"),
               cov["purposes_pct"], c.get("stale"), c.get("doors"), c.get("dirs_needing_door"), cov["doors_pct"],
               cov["edges_with_ev_pct"], c.get("tables"), c.get("envs"), c.get("services"), c.get("unparsed_sql"),
               c.get("broken_links"), c.get("overflow_rows"), c.get("misses")))
    if args.baseline:
        text += "\nbaseline: " + ("coverage dropped: %s" % obj["baseline_drops"] if rc else "no coverage drop")
    emit(args, obj, text)
    return rc


def cmd_purpose(args):
    root = os.path.abspath(args.repo_root)
    repo = args.repo_name or repo_name_for(root)
    items = []
    if args.action == "set":
        if len(args.rest) < 2:
            print("usage: kg purpose set <path> <purpose…> --by <lane>/<model>", file=sys.stderr)
            return 2
        items.append({"path": args.rest[0], "purpose": " ".join(args.rest[1:])})
    else:
        for src in args.rest:      # every file named, not only the first (map-read-docs finding 23:06)
            with open(src) as f:
                for ln in f:
                    if ln.strip():
                        d = json.loads(ln)
                        items.append({"path": d.get("path") or d["id"].split(":", 2)[-1], "purpose": d["purpose"],
                                      "by": d.get("by")})
    shards = {}
    bad = 0
    for it in items:
        p = it["path"]
        full = os.path.join(root, p)
        if not os.path.isfile(full):
            print("skip (no such file): %s" % p, file=sys.stderr)
            bad += 1
            continue
        purpose = " ".join(it["purpose"].split())
        if len(purpose) > 120:
            print("skip (purpose > 120 chars): %s" % p, file=sys.stderr)
            bad += 1
            continue
        with open(full, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        kind = "doc" if ext_of(p) in DOC_EXT else "file"
        shards.setdefault(top_of(p), []).append({"id": "%s:%s:%s" % (repo, kind, p), "sha": sha, "purpose": purpose,
                                                 "by": it.get("by") or args.by or "unknown",
                                                 "at": time.strftime("%Y-%m-%d", time.gmtime()), "stale": False})
    os.makedirs(os.path.join(root, SUMMARY_DIR), exist_ok=True)
    for top, rows in shards.items():
        fp = os.path.join(root, SUMMARY_DIR, top + ".jsonl")
        cur = {}
        if os.path.exists(fp):
            with open(fp) as f:
                for ln in f:
                    if ln.strip():
                        d = json.loads(ln)
                        cur[d["id"].split(":", 2)[-1]] = d
        for r in rows:
            path = r["id"].split(":", 2)[-1]
            old = cur.get(path)
            if old:  # keep the node kind the graph uses (skill/report/hook ids) when it was already set
                r["id"] = old["id"] if old["id"].split(":", 2)[-1] == path else r["id"]
            cur[path] = r
        with open(fp, "w") as f:
            for path in sorted(cur):
                f.write(json.dumps(cur[path], sort_keys=True, ensure_ascii=False) + "\n")
    if not args.quiet:
        print("purposes written: %d, skipped: %d" % (sum(len(v) for v in shards.values()), bad))
    return 0 if not bad else 1


def cmd_beads(args):
    """`kg beads snapshot --from <bd list --json>`: keep only beads that name a path here, and only ids, status,
    dates and the paths — the ledger's free text never lands in a repo (some repos are public)."""
    root = os.path.abspath(args.repo_root)
    b = Builder(root, args.repo_name or repo_name_for(root), beads=args.source, quiet=True)
    b.pathset = {p for p in b.src.entries if not glob_match(p, b.exclude)}
    rows = []
    for bead, done, named, said in b.bead_links(b._bead_items()):
        r = {"id": str(bead.get("id")), "status": bead.get("status")}
        for k in ("closed_at", "updated_at"):
            if bead.get(k):
                r[k] = str(bead[k])
        for k, v in (("implements", done), ("named", named), ("mentions", said)):
            if v:
                r[k] = sorted(v)
        rows.append(r)
    os.makedirs(os.path.join(root, "kg"), exist_ok=True)
    text = "".join(json.dumps(r, sort_keys=True) + "\n" for r in rows)
    p = os.path.join(root, BEADS_PATH)
    old = open(p).read() if os.path.exists(p) else None
    if old != text:
        with open(p, "w") as f:
            f.write(text)
    if not args.quiet:
        print("beads snapshot: %d bead(s) name a path here → %s" % (len(rows), BEADS_PATH))
    return 0


def file_self_hash(path):
    with open(path, "rb") as f:
        lines = f.read().decode("utf-8").split("\n")
    m = HEADER_RE.match(lines[0])
    if not m:
        return None, None
    lines[0] = lines[0].replace(m.group("sha"), "0" * 64)
    return m, hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def verify_header(path):
    m, h = file_self_hash(path)
    return bool(m) and m.group("sha") == h


def stamp_header(path):
    m, h = file_self_hash(path)
    if not m:
        return False
    with open(path, "rb") as f:
        txt = f.read().decode("utf-8")
    first, rest = txt.split("\n", 1)
    with open(path, "w") as f:
        f.write(first.replace(m.group("sha"), h) + "\n" + rest)
    return True


def cmd_vendor(args):
    here = os.path.dirname(os.path.abspath(__file__))
    source = os.path.abspath(args.source) if args.source else here
    if args.stamp:
        ok = True
        for name in ("kg.py", "doors.py", "heal.py"):
            p = os.path.join(source, name)
            if os.path.exists(p):
                ok &= stamp_header(p)
        return 0 if ok else 1
    roots = args.clones or [args.repo_root]
    rc = 0
    rows = []
    for r in roots:
        for name in ("kg.py", "doors.py", "heal.py"):
            src = os.path.join(source, name)
            dst = os.path.join(r, "kg", name)
            if not os.path.exists(src):
                continue
            if args.update:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(src, "rb") as f, open(dst, "wb") as g:
                    g.write(f.read())
                rows.append((r, name, "updated"))
                continue
            if not os.path.exists(dst):
                rows.append((r, name, "missing"))
                rc = 1
                continue
            sm, sh = file_self_hash(src)
            dm, dh = file_self_hash(dst)
            if not dm or dm.group("sha") != dh:
                rows.append((r, name, "edited after vendoring (header hash mismatch)"))
                rc = 1
            elif not sm or sm.group("sha") != dm.group("sha"):
                rows.append((r, name, "behind source (v%s vs v%s)" % (dm.group("ver"), sm.group("ver") if sm else "?")))
                rc = 1
            else:
                rows.append((r, name, "ok v%s" % dm.group("ver")))
    if not args.quiet:
        for r, name, st in rows:
            print("%s\t%s\t%s" % (r, name, st))
    return rc


def cmd_doors_missing(args):
    print("doors.py not vendored next to kg.py: `kg door` and `kg card` come from it (contracts C/E)",
          file=sys.stderr)
    return 2


# ------------------------------------------------------------------------------------------------ main

def build_parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo-root", default=".")
    common.add_argument("--kg-dir", default=None, help="graph dir (default <repo-root>/.kg)")
    common.add_argument("--json", action="store_true")
    common.add_argument("--quiet", action="store_true")
    ap = argparse.ArgumentParser(prog="kg", description="deterministic repo knowledge graph (SCHEMA.md)")
    ap.add_argument("--version", action="version", version="kg.py " + VERSION)
    sub = ap.add_subparsers(dest="cmd")

    b = sub.add_parser("build", parents=[common], help="extract the graph into .kg/")
    b.add_argument("--ref", help="map a git ref (blobs via git cat-file; the checkout is never read)")
    b.add_argument("--out", help="output dir (default <repo-root>/.kg)")
    b.add_argument("--repo-name", help="GitHub repo name used in ids (default: kg/config.json repo, else origin)")
    b.add_argument("--changed", nargs="*", help="paths changed since the last build (cache makes every build "
                                                "incremental; accepted for hooks)")
    b.add_argument("--beads", help="`bd list --json` output or an issues.jsonl export → implements edges")
    b.set_defaults(func=cmd_build)

    f = sub.add_parser("find", parents=[common], help="rank files/symbols/tables/docs by name + purpose")
    f.add_argument("query", nargs="+")
    f.add_argument("--limit", type=int, default=20)
    f.add_argument("--dirs", action="store_true")
    f.set_defaults(func=cmd_find)

    fl = sub.add_parser("file", parents=[common], help="a node with its edges, tests, door")
    fl.add_argument("path")
    fl.set_defaults(func=cmd_file)

    w = sub.add_parser("who-reads", parents=[common], help="every consumer of a path, table.column or env:NAME")
    w.add_argument("target")
    w.add_argument("--tests", action="store_true", help="also list test files' own reads/writes (mocks)")
    w.set_defaults(func=cmd_who_reads)

    fe = sub.add_parser("feature", parents=[common], help="files, tables, services, flows, skills, beads, docs")
    fe.add_argument("name")
    fe.set_defaults(func=cmd_feature)

    st = sub.add_parser("stale", parents=[common], help="missing/stale purposes, stale doors, dirs needing a door")
    st.add_argument("-v", "--verbose", action="store_true")
    st.set_defaults(func=cmd_stale)

    s = sub.add_parser("stats", parents=[common], help="manifest counts + coverage")
    s.add_argument("--baseline", help="fail (exit 1) if any coverage %% is below this stats --json file")
    s.set_defaults(func=cmd_stats)

    p = sub.add_parser("purpose", parents=[common], help="write purposes into kg/summaries/<top-dir>.jsonl")
    p.add_argument("action", choices=["set", "import"])
    p.add_argument("rest", nargs="+")
    p.add_argument("--by", help="<lane>/<model>")
    p.add_argument("--repo-name")
    p.set_defaults(func=cmd_purpose)

    bd = sub.add_parser("beads", parents=[common], help="write kg/beads.jsonl from a `bd list --json` export")
    bd.add_argument("action", choices=["snapshot"])
    bd.add_argument("--from", dest="source", required=True)
    bd.add_argument("--repo-name")
    bd.set_defaults(func=cmd_beads, _nograph=True)

    v = sub.add_parser("vendor", parents=[common], help="compare/update the vendored kg.py + doors.py")
    g = v.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--update", action="store_true")
    g.add_argument("--stamp", action="store_true", help="rewrite the sha256 in the source files' headers")
    v.add_argument("--source", help="dir holding the source kg.py/doors.py (default: this file's dir)")
    v.add_argument("clones", nargs="*", help="repo roots to check (default --repo-root)")
    v.set_defaults(func=cmd_vendor)

    if doors is not None and hasattr(doors, "register"):
        doors.register(sub)
    else:
        for name in ("door", "card"):
            x = sub.add_parser(name, parents=[common], help="(needs doors.py)")
            x.add_argument("rest", nargs="*")
            x.add_argument("--all", action="store_true")
            x.set_defaults(func=lambda a: cmd_doors_missing(a), _nograph=True)
    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    if not getattr(args, "func", None):
        ap.print_help()
        return 2
    if getattr(args, "needs_kg", True) is False:  # e.g. `card`: reads .kg/cards.json only (< 200 ms)
        return args.func(args, None)
    if args.cmd in ("door", "card") and not getattr(args, "_nograph", False):
        try:
            g = load_graph(args)
        except OSError:
            print("no graph: run `python3 kg/kg.py build` first", file=sys.stderr)
            return 2
        return args.func(args, g)
    try:
        return args.func(args)
    except FileNotFoundError as exc:
        if args.cmd not in ("build", "purpose", "vendor"):
            print("no graph at %s: run `python3 kg/kg.py build` first (%s)" % (
                getattr(args, "kg_dir", None) or os.path.join(args.repo_root, KG_DIR), exc.filename), file=sys.stderr)
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main())
