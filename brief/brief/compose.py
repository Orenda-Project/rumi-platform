"""The words beside each panel — templated from the metrics so the job composes with no human.

Plain language, one idea per caption, statements not questions, and every delta honest: a count
compares relatively above a base of twenty and absolutely below it; a percentage compares in
points; a missing baseline is said, never faked."""
from __future__ import annotations

UP, DOWN = "▲", "▼"


def delta_text(cur, prev, mode: str = "count") -> str:
    if cur is None or prev is None:
        return "no earlier data"
    if mode == "pct":
        d = round(float(cur) - float(prev))
        if d == 0:
            return "no change"
        return f"{UP if d > 0 else DOWN} {abs(d)}pt"
    cur, prev = float(cur), float(prev)
    if cur == prev:
        return "no change"
    if prev < 20 or cur < 20:
        d = round(cur - prev)
        return f"{UP if d > 0 else DOWN} {abs(d)}"
    rel = round(100 * (cur - prev) / prev)
    return f"{UP if rel > 0 else DOWN} {abs(rel)}%"


def chip(cur, prev, mode, vs):
    t = delta_text(cur, prev, mode)
    return t if t in ("no change", "no earlier data") else f"{t} {vs}"


def _pct(n, d):
    return round(100 * n / d, 1) if d else 0.0


def _fmt(n):
    return f"{int(n):,}"


def posts(m: dict, charts: dict, brand: str = "Rumi") -> list:
    """Ordered posts: cover first, the attention list (school-wise) always last."""
    weekly = m["kind"] == "weekly"
    vs = "vs last week" if weekly else "vs yesterday"
    period = "this week" if weekly else m["day_word"]
    reg, t, pt = m["registration"], m["totals"], m["prev_totals"]
    teachers = reg["teachers"]
    out = []

    lead = (f"*{brand} {'weekly roll-up' if weekly else 'morning brief'} — {m['dateline']}.*\n\n"
            f"{_fmt(teachers)} teachers on {brand} · {_fmt(reg['active_today'])} active {m['day_word']} "
            f"({chip(reg['active_today'], reg['prev']['active_today'], 'count', 'vs the day before')}) · "
            f"{_fmt(reg['active_week'])} active in the last 7 days "
            f"({chip(reg['active_week'], reg['prev']['active_week'], 'count', 'vs the 7 days before')}).\n\n"
            f"Who's counted: {m['cohort']['label']}. Same charts every {'week' if weekly else 'morning'}, "
            f"so what changed is visible at a glance.")
    out.append({"id": "cover", "image": charts.get("cover"), "caption": lead, "alt": f"{brand} brief cover"})

    unit_note = ""
    if m.get("unit_col") and m["units"]:
        top = m["units"][0]
        unit_note = (f" {top['name']} is the largest unit with {_fmt(top['registered'])} registered, "
                     f"{_fmt(top['active_week'])} of them active this week.")
    out.append({"id": "registration", "image": charts.get("registration"),
                "caption": (f"*Registration — {_fmt(teachers)} teachers on {brand}, {_fmt(reg['active_week'])} active this week.*\n\n"
                            f"Active means the teacher sent a message or used a feature — a real event, never a stored "
                            f"'last seen'.{unit_note}"),
                "alt": "Registered and active teachers, by unit"})

    lp_pct, lp_prev_pct = _pct(t["lp_teachers"], teachers), _pct(pt["lp_teachers"], teachers)
    out.append({"id": "lessonplans", "image": charts.get("lessonplans"),
                "caption": (f"*Teach Well — {_fmt(t['lp_teachers'])} teachers made lesson plans {period}, "
                            f"{_fmt(t['lps'])} plans between them ({chip(lp_pct, lp_prev_pct, 'pct', vs)}).*\n\n"
                            f"That is {lp_pct}% of the cohort. 'Made' means the plan was generated and sent — "
                            f"delivery, not a confirmed opening."),
                "alt": "Share of teachers making lesson plans, per day"})

    co_pct, co_prev_pct = _pct(t["coach_teachers"], teachers), _pct(pt["coach_teachers"], teachers)
    out.append({"id": "aicoach", "image": charts.get("aicoach"),
                "caption": (f"*Improve — {_fmt(t['coach'])} coaching sessions {period} by {_fmt(t['coach_teachers'])} teachers "
                            f"({chip(co_pct, co_prev_pct, 'pct', vs)}).*\n\n"
                            f"A session is a teacher recording their own lesson and getting it scored — the teacher's "
                            f"initiative, not an observation by someone else."),
                "alt": "Share of teachers doing AI coaching, per day"})

    co = m.get("coaching")
    if co and co.get("avg_score") is not None:
        fw = (co.get("framework") or "the coaching framework").upper() if co.get("framework") else "the coaching framework"
        out.append({"id": "scores", "image": charts.get("scores"),
                    "caption": (f"*Teachers averaged {round(co['avg_score'])}% on {fw} {period} "
                                f"({chip(co['avg_score'], co['prev'].get('avg_score'), 'pct', vs)}).*\n\n"
                                f"The line is the daily average of every scored session; dot size is how many sessions "
                                f"that day, so a swing on a one-session day is noise, not news."),
                    "alt": "Average coaching score per day"})
        if co.get("domains"):
            weakest = co["domains"][0]
            out.append({"id": "subindicators", "image": charts.get("subindicators"),
                        "caption": (f"*The weakest area is {_label(weakest['key'])} at {round(weakest['pct'] or 0)}% — "
                                    f"the most coachable thing on the board.*\n\n"
                                    f"Each bar is the share of maximum marks in that area, {period}, with its move {vs}."),
                        "alt": "Coaching sub-indicators"})

    rd = m.get("reading")
    if rd and rd.get("assessments"):
        ot = f", {round(rd['on_track_pct'])}% on track for their grade" if rd.get("on_track_pct") is not None else ""
        out.append({"id": "reading", "image": charts.get("reading"),
                    "caption": (f"*Reading — {_fmt(rd['assessments'])} students assessed {period}"
                                f"{ot} ({chip(rd['assessments'], rd['prev']['assessments'], 'count', vs)}).*\n\n"
                                f"A child reads a passage into a voice note; the brief reports words-correct-per-minute "
                                f"against the grade benchmark."),
                    "alt": "Reading assessments per day and by grade"})

    if m.get("features"):
        bits = ", ".join(f"{_fmt(f['n'])} {f['label']}" for f in m["features"])
        out.append({"id": "features", "image": charts.get("features"),
                    "caption": f"*Also {period}: {bits}.*\n\nEach count compares with the {'week' if weekly else 'day'} before.",
                    "alt": "Other feature usage"})

    ob = m.get("observations")
    if ob:
        out.append({"id": "observations", "image": charts.get("observations"),
                    "caption": (f"*{_fmt(ob['total'])} classroom observations {period} — target {ob['target']} per observer; "
                                f"{ob['hit']} of {ob['roster_size']} hit it, {ob['above']} went above "
                                f"({chip(ob['total'], ob['prev_total'], 'count', vs)}).*\n\n"
                                f"Every observer is listed, including the zeros. The roster is everyone who has ever "
                                f"filed an observation."),
                    "alt": "Observations per observer against target"})

    if m.get("schoolwise"):
        zero = sum(1 for s in m["schoolwise"] if s["active_7d"] == 0)
        out.append({"id": "schoolwise", "image": charts.get("schoolwise"),
                    "caption": (f"*Where to point attention — every unit, worst first. {zero} of {len(m['schoolwise'])} "
                                f"had no active teacher in the last 7 days.*\n\n"
                                f"Each row is the share of a unit's registered teachers who used anything in the last 7 days."),
                    "alt": "Every unit by share of active teachers, worst first"})
    return out


def closer(m: dict, live_url: str | None = None) -> str:
    t, reg = m["totals"], m["registration"]
    weekly = m["kind"] == "weekly"
    bits = [f"{_fmt(t['lps'])} lesson plans", f"{_fmt(t['coach'])} coaching sessions"]
    if m.get("reading"):
        bits.append(f"{_fmt(t['reading'])} reading assessments")
    if m.get("observations"):
        bits.append(f"{_fmt(m['observations']['total'])} observations")
    line = (f"*In short — {'this week' if weekly else m['day_word']}*\n\n" + " · ".join(bits) +
            f" · {_fmt(reg['active_week'])} teachers active in the last 7 days, across {_fmt(reg['teachers'])} registered.")
    if live_url:
        line += f"\n\nLive: {live_url}"
    return line


def _label(key: str) -> str:
    return str(key).replace("_", " ")
