#!/usr/bin/env python3
"""Morning Brief — the thin command line.

    python3 brief/cli.py render [--kind auto|daily|weekly] [--day YYYY-MM-DD] [--out DIR] [--json]
    python3 brief/cli.py check                      what this database can draw (no render)
    python3 brief/cli.py sample [--out DIR]         the synthetic sample brief, no database needed

`render` reads BRIEF_DATABASE_URL (or DATABASE_URL), decides the covered day and the kind from
the calendar (a code-level day guard: an off-day exits 0 and renders nothing), pulls, draws,
writes `<out>/latest/<kind>/manifest.json` and mirrors it to Supabase Storage when the bot's
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present. Delivery is the bot's job:
`rumi brief --send` or `bot/workers/brief.worker.js`."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from brief import calendar as cal  # noqa: E402
from brief import compose, publish, render, schema  # noqa: E402
from brief.config import Config  # noqa: E402


def _connect(url: str):
    try:
        import psycopg  # type: ignore
        conn = psycopg.connect(url)
    except ImportError:
        try:
            import psycopg2  # type: ignore
        except ImportError:
            raise SystemExit("Install a Postgres driver:  pip install 'psycopg[binary]'   (or psycopg2-binary)")
        conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET TIME ZONE 'UTC'")
    cur.execute("SET statement_timeout = '120s'")
    return conn


def _load_env():
    """Local convenience: seed missing env vars from the repo-root .env. In a container the
    environment is already set, so every setdefault is a no-op."""
    envp = os.path.join(os.path.dirname(HERE), ".env")
    if not os.path.isfile(envp):
        return
    for line in open(envp):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _out_dir(cfg: Config, override):
    d = override or cfg.out_dir
    return d if os.path.isabs(d) else os.path.join(os.path.dirname(HERE), d)


def _finish(m, cfg, out_dir, kind, day, mirror=True):
    with tempfile.TemporaryDirectory() as tmp:
        charts = render.render_all(m, cfg, tmp)
        posts = compose.posts(m, charts, brand=cfg.brand)
        closer = compose.closer(m, cfg.live_url)
        manifest = publish.write(out_dir, kind=kind, day=day, dateline=m["dateline"], cohort=m["cohort"],
                                 posts=posts, closer=closer, live_url=cfg.live_url)
    print(f"brief: {kind} for {m['dateline']} — {len(manifest['panels'])} panels -> {os.path.join(out_dir, 'latest', kind)}")
    if mirror and cfg.supabase_url and cfg.supabase_key:
        n = publish.mirror(out_dir, kind, day, supabase_url=cfg.supabase_url, service_key=cfg.supabase_key)
        if n:
            print(f"brief: mirrored {n} files to storage — {publish.public_url(cfg.supabase_url, kind)}")
    return manifest


def cmd_render(args):
    _load_env()
    cfg = Config.from_env()
    if not cfg.db_url:
        raise SystemExit("Set BRIEF_DATABASE_URL (a read-only Postgres URL) or DATABASE_URL.")
    kind = args.kind
    if kind == "auto":
        kind = cal.decide_kind(cal.fire_day(tz=cfg.tz), cfg.daily_dows, cfg.weekly_dow)
        if kind is None:
            print("brief: off-day, nothing to send"); return 0
    day = dt.date.fromisoformat(args.day) if args.day else cal.covered_day(cfg.lag, tz=cfg.tz)
    conn = _connect(cfg.db_url)
    from brief import pull
    feats = schema.detect(conn)
    m = pull.pull(conn, day, kind, cfg, feats)
    if args.json:
        json.dump(m, sys.stdout, indent=1, default=str); print()
    _finish(m, cfg, _out_dir(cfg, args.out), kind, day.isoformat(), mirror=not args.no_mirror)
    return 0


def cmd_check(args):
    _load_env()
    cfg = Config.from_env()
    if not cfg.db_url:
        raise SystemExit("Set BRIEF_DATABASE_URL (a read-only Postgres URL) or DATABASE_URL.")
    f = schema.detect(_connect(cfg.db_url))
    unit = f.resolve_group_by(cfg.group_by)
    rows = [("registration + active teachers", True),
            ("lesson plans", f.has("lesson_plans")),
            ("AI coaching + scores", f.has("coaching_sessions") and f.col("coaching_sessions", "analysis_data")),
            ("reading", f.has("reading_assessments")),
            ("feature strip", ", ".join(f.feature_tables()) or False),
            ("classroom observations", f.observations),
            ("lesson-plan ratings", f.ratings),
            (f"organising unit (BRIEF_GROUP_BY={cfg.group_by})", unit or False)]
    for name, ok in rows:
        print(f"  {'on ' if ok else 'off'}  {name}" + (f"  ({ok})" if isinstance(ok, str) else ""))
    print(f"  timezone {cfg.tz} · covered day {cal.covered_day(cfg.lag, tz=cfg.tz)} · today would be: "
          f"{cal.decide_kind(cal.fire_day(tz=cfg.tz), cfg.daily_dows, cfg.weekly_dow) or 'an off-day'}")
    return 0


def cmd_sample(args):
    from brief.sample import make_sample
    cfg = Config(programme="Riverside District", brand="Rumi", live_url=None)
    out = args.out or os.path.join(HERE, "sample")
    for kind in ("daily", "weekly"):
        m = make_sample.metrics(kind)
        d = os.path.join(out, kind)
        for f in os.listdir(d) if os.path.isdir(d) else []:
            os.remove(os.path.join(d, f))
        charts = render.render_all(m, cfg, d)
        posts = compose.posts(m, charts, brand=cfg.brand)
        thread = [f"# Sample {kind} brief — {m['dateline']}\n"]
        for p in posts:
            thread.append(f"## {p['id']} · `{os.path.basename(p['image'])}`\n\n{p['caption']}\n")
        thread.append("## closer\n\n" + compose.closer(m, "https://your-dashboard.example/observability/brief") + "\n")
        with open(os.path.join(d, "THREAD.md"), "w") as fh:
            fh.write("\n".join(thread))
        print(f"sample {kind}: {len(charts)} panels -> {d}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="brief", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="pull, draw and write the manifest")
    r.add_argument("--kind", default="auto", choices=["auto", "daily", "weekly"])
    r.add_argument("--day", help="pin the covered day (YYYY-MM-DD) for a replay or review render")
    r.add_argument("--out", help="output directory (default BRIEF_OUT_DIR or brief/out)")
    r.add_argument("--json", action="store_true", help="also print the metrics as JSON")
    r.add_argument("--no-mirror", action="store_true", help="skip the storage mirror")
    r.set_defaults(fn=cmd_render)
    c = sub.add_parser("check", help="what this database can draw")
    c.set_defaults(fn=cmd_check)
    s = sub.add_parser("sample", help="render the synthetic sample brief")
    s.add_argument("--out")
    s.set_defaults(fn=cmd_sample)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
