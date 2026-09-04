"""A synthetic programme, deterministic, with no real person or school in it.

`metrics(kind)` returns exactly what `pull.pull()` returns, so the renderer, the captions, the
README and the film can all be exercised without a database. Forty-two fictional schools, a
term that is three weeks old, and the usual shape of a real programme: lesson plans ramping,
coaching a step behind, a few schools at zero, and Fridays quiet."""
from __future__ import annotations

import datetime as dt
import random

from .. import calendar as cal

DAY = dt.date(2026, 9, 3)          # a Thursday; the weekly covers Fri 28 Aug – Thu 3 Sep
TERM_START = dt.date(2026, 8, 17)

PREFIX = ["GPS", "GGPS", "GES", "GMPS", "GGES"]
PLACES = ["Riverside", "Hillcrest", "Lakeside", "Mill Road", "Old Town", "Station Colony", "Green Valley",
          "Sunnybank", "North Ridge", "Bridge End", "Canal View", "Orchard", "Willow Park", "Fort Road",
          "Model Town", "Chak 12", "Chak 47", "New Colony", "Cedar Lane", "Highfield", "Meadow", "Rock Hill",
          "Bazaar Road", "Kot Sarwar", "Mohra", "Dhok Ali", "Pind Khan", "Basti Noor", "Jhang Road",
          "Sector B", "Sector F", "Phase 2", "Ravi Bank", "Elm Street", "Quarry", "Maple", "Harbour",
          "Upper Mall", "Lower Mall", "Garden East", "Garden West", "Airport Road"]


def _schools(rng):
    out = []
    for i, place in enumerate(PLACES):
        out.append({"name": f"{PREFIX[i % len(PREFIX)]} {place}", "registered": rng.randint(3, 34)})
    return out


def _series(rng, teachers, days):
    rows = []
    for i, d in enumerate(days):
        age = (d - TERM_START).days
        ramp = 0 if age < 0 else min(1.0, 0.25 + age / 22)
        weekend = d.weekday() in (5, 6)
        friday = d.weekday() == 4
        base = 0.03 if weekend else (0.22 if friday else 0.34)
        lp_t = int(teachers * base * ramp * rng.uniform(0.85, 1.15))
        co_t = int(teachers * (0.012 if weekend else 0.075) * ramp * rng.uniform(0.7, 1.3))
        rd = 0 if weekend else int(28 * ramp * rng.uniform(0.5, 1.4))
        rows.append({"date": d.isoformat(), "lps": int(lp_t * rng.uniform(1.4, 2.3)), "lp_teachers": lp_t,
                     "coach": int(co_t * rng.uniform(1.0, 1.5)), "coach_teachers": co_t,
                     "reading": rd, "reading_teachers": max(0, rd // 3),
                     "active": int(max(lp_t, co_t) * rng.uniform(1.25, 1.6)) + (0 if weekend else rng.randint(20, 40))})
    return rows


def metrics(kind: str = "daily", seed: int = 7) -> dict:
    rng = random.Random(seed)
    weekly = kind == "weekly"
    day = DAY
    lo, hi = cal.weekly_window(day) if weekly else (day, day)
    span = (hi - lo).days + 1
    plo, phi = lo - dt.timedelta(days=span), hi - dt.timedelta(days=span)
    schools = _schools(rng)
    teachers = sum(s["registered"] for s in schools) + 11        # 11 with no school recorded
    long = _series(rng, teachers, [day - dt.timedelta(days=8 * 7 - 1 - i) for i in range(56)])
    daily = long[-14:]
    weekly_series = []
    for k in range(7, -1, -1):
        end = day - dt.timedelta(days=7 * k)
        chunk = [r for r in long if (end - dt.timedelta(days=6)).isoformat() <= r["date"] <= end.isoformat()]
        weekly_series.append({"week_end": end.isoformat(), "week_start": (end - dt.timedelta(days=6)).isoformat(),
                              "lps": sum(r["lps"] for r in chunk), "lp_teachers": int(max(r["lp_teachers"] for r in chunk) * 1.9),
                              "coach": sum(r["coach"] for r in chunk), "coach_teachers": int(max(r["coach_teachers"] for r in chunk) * 2.4),
                              "reading": sum(r["reading"] for r in chunk), "reading_teachers": int(max(r["reading_teachers"] for r in chunk) * 2),
                              "active": int(max(r["active"] for r in chunk) * 1.7)})

    def totals(rows):
        return {"lps": sum(r["lps"] for r in rows), "lp_teachers": int(max(r["lp_teachers"] for r in rows) * (1.9 if len(rows) > 1 else 1)),
                "coach": sum(r["coach"] for r in rows), "coach_teachers": int(max(r["coach_teachers"] for r in rows) * (2.4 if len(rows) > 1 else 1)),
                "reading": sum(r["reading"] for r in rows), "reading_teachers": int(max(r["reading_teachers"] for r in rows) * (2 if len(rows) > 1 else 1))}

    win = [r for r in long if lo.isoformat() <= r["date"] <= hi.isoformat()]
    pwin = [r for r in long if plo.isoformat() <= r["date"] <= phi.isoformat()]
    tot, ptot = totals(win), totals(pwin)
    active_today = daily[-1]["active"]
    active_week = int(max(r["active"] for r in daily[-7:]) * 1.7)

    # per-unit registration + activity
    units, schoolwise = [], []
    for s in schools:
        act = int(s["registered"] * max(0.0, min(1.0, rng.gauss(0.42, 0.28))))
        units.append({"name": s["name"], "registered": s["registered"], "active_week": act})
        schoolwise.append({"unit": s["name"], "registered": s["registered"], "active_7d": act,
                           "pct": round(100 * act / s["registered"])})
    units.append({"name": "No unit recorded", "registered": 11, "active_week": 3})
    units.sort(key=lambda u: (u["name"] == "No unit recorded", -u["registered"]))
    schoolwise.sort(key=lambda s: (s["pct"], -s["registered"], s["unit"]))

    # coaching scores: a slow climb, noisy on thin days
    trend = []
    for i in range(60):
        d = day - dt.timedelta(days=59 - i)
        if d < TERM_START or d.weekday() in (5, 6):
            continue
        n = rng.randint(2, 26)
        trend.append({"date": d.isoformat(), "avg": round(50 + (d - TERM_START).days * 0.35 + rng.gauss(0, 2.2 if n > 8 else 5), 1), "n": n})
    domains = [("lesson_planning", 61.2), ("instructional_strategies", 55.8), ("student_engagement", 47.9),
               ("assessment_feedback", 52.4), ("classroom_environment", 66.5)]
    dom = sorted([{"key": k, "pct": round(v + rng.gauss(0, 1.5), 1), "n": tot["coach"]} for k, v in domains], key=lambda x: x["pct"])
    pdom = [{"key": d["key"], "pct": round(d["pct"] - rng.uniform(-1, 3), 1), "n": ptot["coach"]} for d in dom]
    avg = round(sum(t["avg"] for t in trend[-span:]) / max(1, len(trend[-span:])), 1)
    coaching = {"sessions": tot["coach"], "teachers": tot["coach_teachers"], "avg_score": avg, "framework": "hots",
                "score_trend": trend, "domains": dom,
                "prev": {"sessions": ptot["coach"], "teachers": ptot["coach_teachers"], "avg_score": round(avg - 1.6, 1),
                         "framework": "hots", "domains": pdom}}

    reading = {"assessments": tot["reading"], "students": int(tot["reading"] * 0.93), "on_track_pct": 58.3,
               "by_grade": [{"grade": g, "n": int(tot["reading"] * w), "median_wcpm": m, "on_track_pct": o}
                            for g, w, m, o in ((1, 0.18, 24.0, 44.0), (2, 0.31, 41.5, 57.1), (3, 0.29, 60.0, 63.8), (4, 0.22, 78.5, 66.0))],
               "prev": {"assessments": ptot["reading"], "students": int(ptot["reading"] * 0.93), "on_track_pct": 55.0}}

    features = [{"key": "quizzes", "label": "quizzes sent", "n": int(tot["lps"] * 0.21), "prev": int(ptot["lps"] * 0.19)},
                {"key": "attendance", "label": "attendance sessions", "n": int(teachers * (0.31 if weekly else 0.06)), "prev": int(teachers * (0.28 if weekly else 0.05))},
                {"key": "exam_checks", "label": "exams checked", "n": 9 if weekly else 2, "prev": 6 if weekly else 1},
                {"key": "videos", "label": "videos made", "n": 14 if weekly else 3, "prev": 11 if weekly else 4}]

    observers = []
    names = ["A. Khan", "S. Ahmed", "N. Bibi", "R. Malik", "T. Hussain", "M. Iqbal", "F. Zahra", "K. Raza",
             "H. Shah", "Z. Ali", "I. Baig", "U. Farooq", "L. Mirza", "W. Aslam", "G. Butt", "J. Qureshi"]
    target = 10 if weekly else 2
    for i, nm in enumerate(names):
        n = max(0, int(rng.gauss(target * 0.75, target * 0.55)))
        observers.append({"name": nm, "unit": schools[(i * 3) % len(schools)]["name"], "n": n})
    observers.sort(key=lambda o: (-o["n"], o["name"]))
    total_obs = sum(o["n"] for o in observers)
    observations = {"total": total_obs, "active_observers": sum(1 for o in observers if o["n"]),
                    "debriefs_done": int(total_obs * 0.7), "prev_total": int(total_obs * 0.82), "target": target,
                    "roster_size": len(observers), "hit": sum(1 for o in observers if o["n"] >= target),
                    "above": sum(1 for o in observers if o["n"] > target), "working_days": cal.working_days(lo, hi),
                    "observers": observers}

    return {
        "kind": kind, "day": day.isoformat(),
        "window": {"lo": lo.isoformat(), "hi": hi.isoformat()},
        "prev_window": {"lo": plo.isoformat(), "hi": phi.isoformat()},
        "dateline": cal.dateline(day, kind, 1), "day_word": "yesterday", "unit_col": "school_name",
        "cohort": {"teachers": teachers, "label": "all registered teachers, test accounts excluded", "filters": {}},
        "registration": {"teachers": teachers, "active_week": active_week, "active_today": active_today,
                         "prev": {"active_week": int(active_week * 0.86), "active_today": daily[-2]["active"]}},
        "units": units, "series": {"daily": daily, "weekly": weekly_series}, "by_unit_daily": {},
        "totals": tot, "prev_totals": ptot, "coaching": coaching, "reading": reading, "features": features,
        "schoolwise": schoolwise, "unmapped_teachers": 11, "observations": observations,
    }
