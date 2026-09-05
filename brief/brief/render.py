"""The panels — matplotlib + numpy only, no system fonts assumed, one palette.

The grammar these panels follow, in one breath: a delta chip on every headline; the organising
unit breaks down every panel; the school-wise list is EVERY unit, worst first; observations are
target-and-stars for every observer; trend x-axes are calendar days; every line is a PCHIP curve
with the real points marked; the headline always equals what the bars show; every label stays on
the canvas. A panel that passes the tests but looks wrong is wrong — open the PNG."""
from __future__ import annotations

import datetime as dt
import math
import os
import unicodedata

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.image as mpimg  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

from . import compose, smooth  # noqa: E402
from .config import Config  # noqa: E402
from .pull import UNMAPPED  # noqa: E402

NAVY, GOLD, WHITE = "#001F3F", "#F5B301", "#FFFFFF"
INK, MUTED, GRID, GREEN, RED = "#1D2025", "#6A7180", "#E7E4DD", "#21C45D", "#DC2828"
BAR_BG, BAR_MID = "#EDEFF1", "#C9CDD3"
UNIT_COLOURS = ["#2F6DB5", "#2E9E5B", "#C9782A", "#B24C8A", "#3F9FB7", "#8B5CF6", "#C74B4B", "#6B7F1E"]
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
DPI = 150


def _rc():
    plt.rcParams.update({"font.family": "DejaVu Sans", "axes.edgecolor": "#CFD2D6"})


def _nfkc(s):
    return unicodedata.normalize("NFKC", str(s)) if s is not None else ""


def _fmt(n):
    return f"{int(round(n)):,}"


def _label_unit(unit_col):
    return {"school_name": "school", "region": "region", "organization": "organization"}.get(unit_col, "unit")


# ---------------------------------------------------------------------------------------------
# shared furniture
# ---------------------------------------------------------------------------------------------
def chrome(fig, title, sub, m, cfg: Config):
    """Title, subtitle and footer at fixed distances IN INCHES from the edges, so a tall figure
    (every observer, every school) keeps the same header and footer as a standard one."""
    _rc()
    weekly = m["kind"] == "weekly"
    h = fig.get_figheight()
    fig.text(0.065, 1 - 0.44 / h, "■", color=GOLD, fontsize=15, va="center")
    fig.text(0.088, 1 - 0.41 / h, title, color=NAVY, fontsize=21, fontweight="bold", va="center")
    fig.text(0.065, 1 - 0.78 / h, sub, color=MUTED, fontsize=11.5, va="center")
    fig.text(0.065, 0.30 / h, f"{cfg.brand} · {cfg.programme_label} · {m['dateline']}",
             color=MUTED, fontsize=9.5, style="italic", va="center")
    fig.text(0.935, 0.30 / h, "Weekly roll-up" if weekly else "Morning brief", color=MUTED, fontsize=9.5,
             ha="right", va="center")


def _chipline(fig, x, y, text, size=10.5):
    """A delta chip on ONE line: ▲ 3%  vs yesterday. Green up, red down, muted otherwise."""
    if text.startswith("▲"):
        col, head, rest = GREEN, text.split(" ", 2)[0] + " " + text.split(" ", 2)[1], " ".join(text.split(" ", 2)[2:])
    elif text.startswith("▼"):
        col, head, rest = RED, text.split(" ", 2)[0] + " " + text.split(" ", 2)[1], " ".join(text.split(" ", 2)[2:])
    else:
        col, head, rest = MUTED, text, ""
    t = fig.text(x, y, head, color=col, fontsize=size, fontweight="bold", va="center")
    if rest:
        fig.canvas.draw()
        bb = t.get_window_extent(fig.canvas.get_renderer())
        x_after = bb.x1 / fig.bbox.width + 0.006
        fig.text(x_after, y, rest, color=MUTED, fontsize=size - 1.5, va="center")


def _stat(fig, x, y, big, chip, label, col=NAVY, size=30):
    fig.text(x, y, big, color=col, fontsize=size, fontweight="bold", va="center")
    _chipline(fig, x, y - 0.057, chip)
    fig.text(x, y - 0.105, label, color=MUTED, fontsize=11, va="center")


def _fig(h=6.75):
    fig = plt.figure(figsize=(12, h), dpi=DPI)
    fig.patch.set_facecolor(WHITE)
    return fig


def _save(fig, out, face=WHITE):
    fig.savefig(out, facecolor=face)
    plt.close(fig)
    return out


def _place_labels(ax, items, ymax, x_end, gap_frac=0.07):
    """items = (value, text, colour, fontsize). De-collide vertically, clamp INSIDE the axes
    both ways, draw a leader line + the text just right of the last point."""
    x0, x1 = ax.get_xlim()
    xe = mdates.date2num(x_end) if hasattr(x_end, "year") else float(x_end)
    x_lab = xe + (x1 - xe) * 0.14
    gap = max(ymax, 1) * gap_frac
    order = sorted(items, key=lambda t: t[0])
    n = len(order)
    if n > 1:
        gap = min(gap, float(ymax) / (n - 1))
    ypos, last = [], -1e9
    for it in order:
        y = max(it[0], last + gap)
        ypos.append(y)
        last = y
    if ypos and ypos[-1] > ymax:
        over = ypos[-1] - ymax
        ypos = [y - over for y in ypos]
        prev = -gap
        for i in range(n):
            ypos[i] = max(ypos[i], prev + gap)
            prev = ypos[i]
    for (val, text, col, fs), y in zip(order, ypos):
        ax.plot([xe, x_lab], [val, y], color="#DBDEE2", lw=0.8, zorder=2, clip_on=False)
        ax.text(x_lab, y, text, va="center", ha="left", fontsize=fs, color=col, fontweight="bold",
                zorder=6, clip_on=False)


def _trend_axes(fig):
    ax = fig.add_axes([0.075, 0.13, 0.66, 0.44])
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(labelsize=10, colors=INK)
    return ax


def _dates(rows, key):
    return [dt.date.fromisoformat(r[key]) for r in rows]


def _smooth_line(ax, xs, ys, **style):
    sx, sy = smooth.smooth_xy(xs, ys)
    ax.plot(sx, sy, **style)


# ---------------------------------------------------------------------------------------------
# 00 · cover
# ---------------------------------------------------------------------------------------------
def cover(out, m, cfg: Config):
    _rc()
    weekly = m["kind"] == "weekly"
    unit = _label_unit(m.get("unit_col"))
    by = f", by {unit}" if m.get("unit_col") else ""
    lo, hi = m["window"]["lo"], m["window"]["hi"]
    d_lo, d_hi = dt.date.fromisoformat(lo), dt.date.fromisoformat(hi)
    dateline = f"{d_lo:%d %b} – {d_hi:%d %B %Y}" if weekly else f"{d_hi:%A, %d %B %Y}"
    fig = plt.figure(figsize=(13.33, 7.5), dpi=DPI)
    fig.patch.set_facecolor(NAVY)
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    bg = os.environ.get("BRIEF_COVER_BG") or os.path.join(ASSETS, "cover_bg.jpg")
    if os.path.exists(bg):
        try:
            import numpy as np
            from matplotlib.colors import to_rgb
            img = mpimg.imread(bg)
            ax.imshow(img, extent=[0, 1, 0, 1], aspect="auto", zorder=0)
            grad = np.zeros((1, 512, 4)); grad[..., :3] = to_rgb(NAVY); grad[..., 3] = np.linspace(0.96, 0.58, 512)
            ax.imshow(grad, extent=[0, 1, 0, 1], aspect="auto", zorder=0.6)
            ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        except Exception:
            pass
    ax.plot([0.062, 0.145], [0.815, 0.815], color=GOLD, lw=4)
    ax.text(0.062, 0.752, f"{cfg.brand} · {cfg.programme_label}".upper(), color=GOLD, fontsize=15, fontweight="bold")
    title = cfg.programme_label
    size = 82 if len(title) <= 14 else (62 if len(title) <= 22 else 44)
    ax.text(0.058, 0.60, title, color=WHITE, fontsize=size, fontweight="bold")
    ax.text(0.062, 0.485, "WEEKLY ROLL-UP" if weekly else "MORNING BRIEF", color="#AEB6C6", fontsize=19, fontweight="bold")
    ax.text(0.062, 0.35, f"Teach Well · Improve — {'the week' if weekly else m['day_word']} in one thread{by}",
            color="#C9CDD6", fontsize=20, linespacing=1.4)
    ax.text(0.062, 0.13, dateline, color=GOLD, fontsize=16)
    mark = os.path.join(ASSETS, "rumi-mark-white.png")
    if os.path.exists(mark):
        try:
            img = mpimg.imread(mark)
            mh, mw = img.shape[:2]
            bw = 0.11
            bh = bw * (13.33 / 7.5) * (mh / mw)
            mb = fig.add_axes([0.85, 0.085, bw, bh]); mb.imshow(img); mb.axis("off")
        except Exception:
            pass
    return _save(fig, out, NAVY)


# ---------------------------------------------------------------------------------------------
# 01 · registration
# ---------------------------------------------------------------------------------------------
def registration(out, m, cfg: Config):
    reg = m["registration"]
    weekly = m["kind"] == "weekly"
    unit = _label_unit(m.get("unit_col"))
    fig = _fig()
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    stats = [(_fmt(reg["teachers"]), "no change", f"teachers on {cfg.brand}", NAVY),
             (_fmt(reg["active_week"]), compose.chip(reg["active_week"], reg["prev"]["active_week"], "count", "vs the 7 days before"),
              "active in the last 7 days", GOLD),
             (_fmt(reg["active_today"]), compose.chip(reg["active_today"], reg["prev"]["active_today"], "count", "vs the day before"),
              f"active {m['day_word']}", GREEN)]
    for i, (big, chip, lab, col) in enumerate(stats):
        _stat(fig, 0.065 + i * 0.235, 0.775, big, chip, lab, col)
    units = [u for u in m["units"] if u["name"] != UNMAPPED]
    unmapped = next((u for u in m["units"] if u["name"] == UNMAPPED), None)
    if units:
        shown = units[:8]
        fig.text(0.065, 0.60, f"By {unit} — registered teachers, and how many were active in the last 7 days"
                 + (f" · largest {len(shown)} of {len(units)}" if len(units) > len(shown) else ""),
                 color=INK, fontsize=12.5, fontweight="bold")
        mx = max(u["registered"] for u in shown) or 1
        bx, bw = 0.36, 0.40
        y, step = 0.535, min(0.058, 0.44 / max(1, len(shown)))
        for i, u in enumerate(shown):
            col = UNIT_COLOURS[i % len(UNIT_COLOURS)]
            fig.text(0.065, y, _nfkc(u["name"])[:34], color=col, fontsize=11.5, fontweight="bold", va="center")
            ax.add_patch(Rectangle((bx, y - 0.014), bw, 0.028, color=BAR_BG, zorder=1))
            ax.add_patch(Rectangle((bx, y - 0.014), bw * u["registered"] / mx, 0.028, color=BAR_MID, zorder=2))
            ax.add_patch(Rectangle((bx, y - 0.014), bw * u["active_week"] / mx, 0.028, color=col, zorder=3))
            pct = round(100 * u["active_week"] / u["registered"]) if u["registered"] else 0
            fig.text(bx + bw + 0.012, y, f"{_fmt(u['active_week'])} active / {_fmt(u['registered'])} registered ({pct}%)",
                     color=INK, fontsize=10.5, va="center")
            y -= step
        note = []
        if len(units) > len(shown):
            note.append(f"{len(units) - len(shown)} more {unit}s are on the last panel, every one of them")
        if unmapped:
            note.append(f"{_fmt(unmapped['registered'])} teachers have no {unit} recorded ({_fmt(unmapped['active_week'])} active)")
        if note:
            fig.text(0.065, max(y + step - 0.045, 0.085), " · ".join(note), color=MUTED, fontsize=10, va="center")
    else:
        fig.text(0.065, 0.55, f"No {unit} is recorded on the users table yet — every panel reports the whole cohort.",
                 color=MUTED, fontsize=12)
    chrome(fig, f"Registration — who's on {cfg.brand}" + (f", by {unit}" if units else ""),
           f"{cfg.programme_label}: teachers on {cfg.brand}, and how many actually used it. "
           f"Active = sent a message or used a feature." + (" Week = the 7 days ending on the covered day." if weekly else ""),
           m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
# 02 / 03 · share-of-teachers trend panels (lesson plans, AI coaching)
# ---------------------------------------------------------------------------------------------
def _share_trend(out, m, cfg, *, key, title, sub, noun, unit_key):
    weekly = m["kind"] == "weekly"
    teachers = max(1, m["registration"]["teachers"])
    t, pt = m["totals"], m["prev_totals"]
    cur = 100 * t[key] / teachers
    prev = 100 * pt[key] / teachers
    fig = _fig()
    _stat(fig, 0.065, 0.775, f"{cur:.1f}%", compose.chip(cur, prev, "pct", "vs last week" if weekly else "vs yesterday"),
          f"{noun} {'this week' if weekly else m['day_word']} · {_fmt(t[key])} teachers", NAVY)
    ax = _trend_axes(fig)
    if weekly and m["series"]["weekly"]:
        rows = m["series"]["weekly"]
        xs = _dates(rows, "week_end")
        ys = [100 * r[key] / teachers for r in rows]
        ax.set_title(f"share of registered teachers who {noun.replace('made', 'made').replace('did', 'did')} that week · "
                     f"last 8 weeks, each ending on a {xs[-1]:%A}", loc="left", fontsize=10.5, color=MUTED, pad=8)
    else:
        rows = m["series"]["daily"]
        xs = _dates(rows, "date")
        ys = [100 * r[key] / teachers for r in rows]
        ax.set_title(f"share of registered teachers who {noun} that day · last 14 calendar days",
                     loc="left", fontsize=10.5, color=MUTED, pad=8)
    _smooth_line(ax, xs, ys, color=NAVY, lw=3.2, zorder=5, solid_capstyle="round")
    ax.scatter(xs, ys, color=NAVY, s=18, zorder=6)
    items = [(ys[-1], f"All {cfg.programme_label}  {ys[-1]:.1f}%", NAVY, 11.5)]
    ymax = max(ys + [1.0])
    # thin dotted line per unit (few units only — the whole point of the organising unit)
    per_unit = m.get("by_unit_daily") or {}
    if not weekly and per_unit:
        regs = {u["name"]: u["registered"] for u in m["units"]}
        for i, (name, days) in enumerate([(k, v) for k, v in per_unit.items() if k != UNMAPPED][:6]):
            col = UNIT_COLOURS[i % len(UNIT_COLOURS)]
            uy = [100 * days.get(r["date"], {}).get(unit_key, 0) / max(1, regs.get(name, 1)) for r in rows]
            _smooth_line(ax, xs, uy, color=col, lw=0.9, ls=":", alpha=0.85, zorder=4)
            items.append((uy[-1], f"{_nfkc(name)[:22]}  {uy[-1]:.1f}%", col, 9.5))
            ymax = max(ymax, max(uy))
    ax.set_ylim(0, ymax * 1.18)
    ax.set_xlim(xs[0], xs[-1] + (xs[-1] - xs[0]) * 0.36)
    ax.set_ylabel(f"% of teachers", color=MUTED, fontsize=10)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    ax.set_xticks(xs[::2] if not weekly else xs)         # never a tick in the future
    _place_labels(ax, items, ymax * 1.18, xs[-1])
    chrome(fig, title, sub, m, cfg)
    return _save(fig, out)


def lessonplans(out, m, cfg: Config):
    unit = _label_unit(m.get("unit_col"))
    return _share_trend(out, m, cfg, key="lp_teachers",
                        title="Teach Well — % of teachers making lesson plans",
                        sub=f"The share of {cfg.programme_label}'s teachers generating lesson plans"
                            + (f" — all, and each {unit}." if m.get("by_unit_daily") else "."),
                        noun="made a lesson plan", unit_key="lp_teachers")


def aicoach(out, m, cfg: Config):
    unit = _label_unit(m.get("unit_col"))
    return _share_trend(out, m, cfg, key="coach_teachers",
                        title="Improve — % of teachers doing AI coaching",
                        sub="Teachers recording their own lesson and getting it scored"
                            + (f" — all, and each {unit}." if m.get("by_unit_daily") else "."),
                        noun="did a coaching session", unit_key="coach_teachers")


# ---------------------------------------------------------------------------------------------
# 04 · score trend   05 · sub-indicators
# ---------------------------------------------------------------------------------------------
def scores(out, m, cfg: Config):
    co = m["coaching"]
    weekly = m["kind"] == "weekly"
    fw = (co.get("framework") or "coaching").upper()
    fig = _fig()
    _stat(fig, 0.065, 0.775, f"{co['avg_score']:.0f}%",
          compose.chip(co["avg_score"], co["prev"].get("avg_score"), "pct", "vs last week" if weekly else "vs the day before"),
          f"average {fw} score {'this week' if weekly else m['day_word']} · {_fmt(co['sessions'])} sessions", NAVY)
    ax = _trend_axes(fig)
    tr = [t for t in co["score_trend"] if t["avg"] is not None]
    if tr:
        xs, ys, ns = _dates(tr, "date"), [t["avg"] for t in tr], [t["n"] for t in tr]
        _smooth_line(ax, xs, ys, color=NAVY, lw=2.6, zorder=5)
        ax.scatter(xs, ys, s=[14 + 6 * min(n, 30) for n in ns], color=NAVY, zorder=6, alpha=0.9)
        ax.set_ylim(0, 100)
        ax.set_xlim(xs[0], xs[-1] + (xs[-1] - xs[0]) * 0.36)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
        step = max(1, len(xs) // 7)
        ax.set_xticks(xs[::-step][::-1])                  # ticks end on the last real day
        _place_labels(ax, [(ys[-1], f"All {cfg.programme_label}  {ys[-1]:.0f}%", NAVY, 11.5)], 100, xs[-1])
        ax.set_title("daily average of every scored session · dot size = sessions that day · last 60 days",
                     loc="left", fontsize=10.5, color=MUTED, pad=8)
    else:
        ax.text(0.5, 0.5, "No scored sessions in the last 60 days", ha="center", color=MUTED, transform=ax.transAxes)
    ax.set_ylabel(f"average {fw} %", color=MUTED, fontsize=10)
    chrome(fig, f"Improve — how {fw} is trending",
           f"The daily-average {fw} score from teachers' own AI-coaching sessions.", m, cfg)
    return _save(fig, out)


def subindicators(out, m, cfg: Config):
    co = m["coaching"]
    weekly = m["kind"] == "weekly"
    fw = (co.get("framework") or "coaching").upper()
    doms = [d for d in co["domains"] if d["pct"] is not None]
    prev = {d["key"]: d["pct"] for d in co["prev"].get("domains", [])}
    fig = _fig()
    ax = fig.add_axes([0.30, 0.16, 0.50, 0.62]); ax.axis("off"); ax.set_xlim(0, 100); ax.set_ylim(-0.6, max(1, len(doms)) - 0.4)
    for i, d in enumerate(doms):
        y = len(doms) - 1 - i
        ax.add_patch(Rectangle((0, y - 0.28), 100, 0.56, color=BAR_BG, zorder=1))
        col = RED if d["pct"] < 50 else (GOLD if d["pct"] < 65 else GREEN)
        ax.add_patch(Rectangle((0, y - 0.28), d["pct"], 0.56, color=col, zorder=2))
        ax.text(-2, y, compose._label(d["key"]).capitalize(), ha="right", va="center", fontsize=12, color=INK, fontweight="bold")
        ax.text(d["pct"] + 1.5, y, f"{d['pct']:.0f}%", va="center", fontsize=12, color=INK, fontweight="bold")
        chip = compose.chip(d["pct"], prev.get(d["key"]), "pct", "")
        ccol = GREEN if chip.startswith("▲") else (RED if chip.startswith("▼") else MUTED)
        ax.text(112, y, chip.strip(), va="center", fontsize=10.5, color=ccol, fontweight="bold", clip_on=False)
    ax.text(112, len(doms) - 0.25, "vs last week" if weekly else "vs the day before", fontsize=9, color=MUTED, clip_on=False)
    if doms:
        fig.text(0.065, 0.80, f"Weakest: {compose._label(doms[0]['key'])} at {doms[0]['pct']:.0f}% of marks — "
                 f"the most coachable thing on the board.", color=INK, fontsize=12.5)
    chrome(fig, f"Improve — {fw} by area, weakest first",
           f"Share of maximum marks in each area, {'this week' if weekly else m['day_word']}, across {_fmt(co['sessions'])} scored sessions.",
           m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
# 06 · reading
# ---------------------------------------------------------------------------------------------
def reading(out, m, cfg: Config):
    rd = m["reading"]
    weekly = m["kind"] == "weekly"
    fig = _fig()
    _stat(fig, 0.065, 0.775, _fmt(rd["assessments"]),
          compose.chip(rd["assessments"], rd["prev"]["assessments"], "count", "vs last week" if weekly else "vs the day before"),
          f"students assessed {'this week' if weekly else m['day_word']}", NAVY)
    if rd.get("on_track_pct") is not None:
        _stat(fig, 0.30, 0.775, f"{rd['on_track_pct']:.0f}%",
              compose.chip(rd["on_track_pct"], rd["prev"].get("on_track_pct"), "pct", "vs last week" if weekly else "vs the day before"),
              "on track for their grade", GREEN)
    ax = fig.add_axes([0.075, 0.13, 0.40, 0.45])
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    rows = m["series"]["weekly"] if weekly and m["series"]["weekly"] else m["series"]["daily"]
    xs = list(range(len(rows)))
    ys = [r["reading"] for r in rows]
    ax.bar(xs, ys, color=[GOLD if i == len(xs) - 1 else "#BFD0E4" for i in xs], width=0.7, zorder=3)
    ax.set_xticks(xs[::2] if not weekly else xs)
    labels = [dt.date.fromisoformat(r["week_end" if weekly else "date"]).strftime("%d %b") for r in rows]
    ax.set_xticklabels(labels[::2] if not weekly else labels, fontsize=9, color=INK)
    ax.tick_params(axis="y", labelsize=9, colors=INK)
    ax.grid(axis="y", color=GRID, lw=0.8); ax.set_axisbelow(True)
    ax.set_title(f"assessments per {'week' if weekly else 'day'} · latest in gold", loc="left", fontsize=10.5, color=MUTED, pad=8)
    # the by-grade table
    x0, y0 = 0.56, 0.575
    fig.text(x0, y0, "By grade", color=INK, fontsize=12.5, fontweight="bold")
    cols = [(x0, "grade"), (x0 + 0.09, "assessed"), (x0 + 0.20, "median wcpm"), (x0 + 0.33, "on track")]
    for x, h in cols:
        fig.text(x, y0 - 0.05, h, color=MUTED, fontsize=9.5)
    y = y0 - 0.095
    for g in rd["by_grade"][:8]:
        vals = [f"G{g['grade']}" if g["grade"] is not None else "—", _fmt(g["n"]),
                f"{g['median_wcpm']:.0f}" if g.get("median_wcpm") is not None else "—",
                f"{g['on_track_pct']:.0f}%" if g.get("on_track_pct") is not None else "—"]
        for (x, _), v in zip(cols, vals):
            fig.text(x, y, v, color=INK, fontsize=11.5, fontweight="bold" if x == x0 else "normal")
        y -= 0.052
    if not rd["by_grade"]:
        fig.text(x0, y, "no completed assessments in the window", color=MUTED, fontsize=10.5)
    chrome(fig, "Reading — students assessed, and how they read",
           "A child reads a passage into a voice note; words-correct-per-minute is scored against the grade benchmark.",
           m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
# 07 · the feature strip
# ---------------------------------------------------------------------------------------------
def features(out, m, cfg: Config):
    weekly = m["kind"] == "weekly"
    fs = m["features"][:4]
    fig = _fig()
    for i, f in enumerate(fs):
        _stat(fig, 0.065 + i * 0.235, 0.58, _fmt(f["n"]),
              compose.chip(f["n"], f["prev"], "count", "vs last week" if weekly else "vs the day before"),
              f["label"], NAVY, size=34)
    chrome(fig, f"Also {'this week' if weekly else m['day_word']} — everything else teachers used",
           "Each count is the cohort's events in the window; the chip compares with the window before.", m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
# 08 · observations — target-and-stars, every observer
# ---------------------------------------------------------------------------------------------
def observations(out, m, cfg: Config):
    ob = m["observations"]
    weekly = m["kind"] == "weekly"
    obs = ob["observers"]
    target = max(1, ob["target"])
    ncol = 2
    rows = math.ceil(len(obs) / ncol) if obs else 1
    h = max(6.75, 3.9 + rows * 0.34)
    fig = _fig(h)
    top = 1 - 1.55 / h
    _stat(fig, 0.065, top, _fmt(ob["total"]),
          compose.chip(ob["total"], ob["prev_total"], "count", "vs last week" if weekly else "vs the day before"),
          f"observations {'this week' if weekly else m['day_word']}", NAVY)
    fig.text(0.30, top + 0.012, f"target {target} per observer {'this week' if weekly else 'per day'} · "
             f"{ob['hit']} of {ob['roster_size']} hit it, {ob['above']} went above (gold ★) · bar fills to n / {target}",
             color=INK, fontsize=11.5, va="center")
    if ob.get("debriefs_done") is not None:
        fig.text(0.30, top - 0.028, f"{_fmt(ob['debriefs_done'])} of {_fmt(ob['total'])} already debriefed with the teacher",
                 color=MUTED, fontsize=10.5, va="center")
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    y_start = top - 1.05 / h
    step = 0.34 / h
    colw = 0.44
    for i, o in enumerate(obs):
        c, r = i % ncol, i // ncol
        x = 0.065 + c * colw
        y = y_start - r * step
        n = o["n"]
        col = GOLD if n > target else (GREEN if n >= target else ("#9EDBB6" if n > 0 else "#E5E7EA"))
        name_col = INK if n > 0 else MUTED
        fig.text(x, y, _nfkc(o["name"])[:24], color=name_col, fontsize=10.5, va="center", fontweight="bold" if n >= target else "normal")
        fig.text(x, y - 0.13 / h, _nfkc(o["unit"])[:30], color=MUTED, fontsize=8, va="center")
        bx, bw = x + 0.19, 0.15
        ax.add_patch(Rectangle((bx, y - 0.10 / h), bw, 0.20 / h, color=BAR_BG, zorder=1))
        ax.add_patch(Rectangle((bx, y - 0.10 / h), bw * min(1.0, n / target), 0.20 / h, color=col, zorder=2))
        fig.text(bx + bw + 0.01, y, f"{n}/{target}" + (" ★" if n > target else ""), color=GOLD if n > target else INK,
                 fontsize=10, va="center", fontweight="bold" if n > target else "normal")
    if not obs:
        fig.text(0.065, y_start, "No observer has filed an observation yet.", color=MUTED, fontsize=12)
    fig.text(0.065, 0.62 / h, "The roster is everyone who has ever observed a teacher in this cohort; their observations are counted "
             "wherever they happened.", color=MUTED, fontsize=9, va="center")
    chrome(fig, "Improve — observations, every observer vs the target",
           f"Each observer's {'week' if weekly else 'day'}: gold ★ above target · green met · light green partial · grey none.",
           m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
# 09 · school-wise — EVERY unit, worst first
# ---------------------------------------------------------------------------------------------
def _cc(pct):
    if pct <= 0:
        return RED
    if pct < 34:
        return "#E8632B"
    if pct < 50:
        return "#F0A020"
    if pct < 67:
        return "#B8BE2E"
    if pct < 85:
        return "#79B12F"
    return "#21A84B"


def schoolwise(out, m, cfg: Config):
    sw = m["schoolwise"]
    unit = _label_unit(m.get("unit_col"))
    n = len(sw)
    ncol = max(1, min(4, math.ceil(n / 30)))
    rows = math.ceil(n / ncol) if n else 1
    h = max(6.75, 3.5 + rows * 0.235)
    fig = _fig(h)
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    top = 1 - 1.45 / h
    colw = 0.87 / ncol
    max_chars = max(12, int((min(colw, 0.30) - 0.075) / 0.0058))
    cell_h = 0.19 / h
    step = 0.235 / h
    for i, s in enumerate(sw):
        c, r = i // rows, i % rows
        x = 0.065 + c * colw
        y = top - r * step
        ax.add_patch(Rectangle((x, y - cell_h / 2), 0.028, cell_h, color=_cc(s["pct"]), zorder=2))
        fig.text(x + 0.014, y, f"{s['pct']}", color=WHITE, fontsize=7.5, ha="center", va="center", fontweight="bold")
        fig.text(x + 0.036, y, _nfkc(s["unit"])[:max_chars], color=INK, fontsize=8.5, va="center")
        fig.text(x + min(colw, 0.30) - 0.02, y, _fmt(s["registered"]), color=MUTED, fontsize=7.5, ha="right", va="center")
    zero = sum(1 for s in sw if s["active_7d"] == 0)
    legend_y = 1.25 / h
    line1 = f"{n} {unit}s · {zero} with no active teacher · cell = % of the {unit}'s registered teachers active in the last 7 days"
    line2 = "grey number = registered teachers"
    if m.get("unmapped_teachers"):
        line2 += f" · {_fmt(m['unmapped_teachers'])} teachers with no {unit} recorded are not listed"
    fig.text(0.065, 0.90 / h, line1, color=MUTED, fontsize=9, va="center")
    fig.text(0.065, 0.62 / h, line2, color=MUTED, fontsize=9, va="center")
    for j, (lo_, lab) in enumerate([(0, "0%"), (20, "under 34"), (40, "under 50"), (60, "under 67"), (75, "under 85"), (90, "85 and up")]):
        ax.add_patch(Rectangle((0.065 + j * 0.115, legend_y - 0.07 / h), 0.02, 0.14 / h, color=_cc(lo_), zorder=2))
        fig.text(0.090 + j * 0.115, legend_y, lab, color=MUTED, fontsize=8.5, va="center")
    chrome(fig, "Where to point attention — every " + unit + ", worst first",
           f"% of each {unit}'s registered teachers who used anything in the last 7 days. Worst at the top of each column.",
           m, cfg)
    return _save(fig, out)


# ---------------------------------------------------------------------------------------------
def render_all(m: dict, cfg: Config, out_dir: str) -> dict:
    """Every panel this metrics dict can draw, in thread order. Returns {id: path}."""
    os.makedirs(out_dir, exist_ok=True)
    order = [("cover", cover), ("registration", registration), ("lessonplans", lessonplans), ("aicoach", aicoach)]
    if m.get("coaching") and m["coaching"].get("avg_score") is not None:
        order.append(("scores", scores))
        if m["coaching"].get("domains"):
            order.append(("subindicators", subindicators))
    if m.get("reading") and m["reading"].get("assessments"):
        order.append(("reading", reading))
    if m.get("features"):
        order.append(("features", features))
    if m.get("observations"):
        order.append(("observations", observations))
    if m.get("schoolwise"):
        order.append(("schoolwise", schoolwise))
    paths = {}
    for i, (pid, fn) in enumerate(order):
        paths[pid] = fn(os.path.join(out_dir, f"{i:02d}_{pid}.png"), m, cfg)
    return paths
