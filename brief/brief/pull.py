"""The metric definitions, as SQL against the open-source schema. ONE place; the prose in
`README.md` § Definitions must match it, and changes land in both in the same pass.

Cohort:   users with registration_completed and not is_test_user, optionally narrowed by
          region / organization. The organising unit is one users column (school_name by
          default) and NULL units are shown as "No unit recorded", never dropped.
Active:   a teacher who ORIGINATED an event on that day — a message, a lesson plan, a coaching
          session, a reading assessment, a quiz, an attendance session — never a stored
          "last seen" pointer, which cannot be re-computed for an earlier window.
Days:     every timestamp is converted to the programme's timezone before it becomes a date.
Deltas:   every headline is recomputed over the shifted window (yesterday / previous 7 days),
          so a chip always compares like with like.

Every query carries a leading `/* tag */` so offline tests can route canned rows to it."""
from __future__ import annotations

import datetime as dt

from . import calendar as cal
from .config import Config
from .schema import FEATURE_TABLES, Features

UNMAPPED = "No unit recorded"

# a timestamp or timestamptz column -> the programme's local calendar date
LD = "(({col})::timestamptz AT TIME ZONE %(tz)s)::date"
# a coarse, index-friendly pre-filter (a day of slack either side covers any timezone offset)
COARSE = "{col} >= (%(lo)s::date - 1) AND {col} < (%(hi)s::date + 2)"


def _cohort_sql(cfg: Config, unit_col):
    unit = f"u.{unit_col}" if unit_col else "NULL::text"
    where = ["COALESCE(u.is_test_user, false) = false", "u.registration_completed = true"]
    if cfg.region:
        where.append("u.region = %(region)s")
    if cfg.organization:
        where.append("u.organization = %(organization)s")
    return f"cohort AS (SELECT u.id, NULLIF(TRIM({unit}), '') AS unit FROM users u WHERE " + " AND ".join(where) + ")"


def _events_sql(feats: Features):
    parts = []
    for table, ucol, tcol, extra in feats.active_sources():
        w = [COARSE.format(col=f"{table}.{tcol}")]
        if extra:
            w.append(extra)
        parts.append(f"SELECT {table}.{ucol} AS user_id, {LD.format(col=f'{table}.{tcol}')} AS d "
                     f"FROM {table} WHERE " + " AND ".join(w))
    return "events AS (" + " UNION ALL ".join(parts) + ")"


def _q(cur, tag, sql, params):
    cur.execute(f"/* {tag} */ " + sql, params)
    return cur.fetchall()


def _p(cfg: Config, lo: dt.date, hi: dt.date, **more):
    p = {"tz": cfg.tz, "lo": lo, "hi": hi}
    if cfg.region:
        p["region"] = cfg.region
    if cfg.organization:
        p["organization"] = cfg.organization
    p.update(more)
    return p


def _iso(d):
    return d.isoformat() if hasattr(d, "isoformat") else str(d)


def _f(x):
    return None if x is None else float(x)


def pull(conn, day: dt.date, kind: str, cfg: Config, feats: Features) -> dict:
    cur = conn.cursor()
    unit_col = feats.resolve_group_by(cfg.group_by)
    cohort = _cohort_sql(cfg, unit_col)
    events = _events_sql(feats)
    weekly = kind == "weekly"
    lo, hi = cal.weekly_window(day) if weekly else (day, day)
    span = (hi - lo).days + 1
    plo, phi = lo - dt.timedelta(days=span), hi - dt.timedelta(days=span)
    week_lo = day - dt.timedelta(days=6)

    def one(tag, sql, lo_, hi_, **more):
        rows = _q(cur, tag, sql, _p(cfg, lo_, hi_, **more))
        return rows[0] if rows else None

    # ---- cohort + registration -------------------------------------------------------------
    n_teachers = (one("cohort.count", f"WITH {cohort} SELECT count(*) FROM cohort", day, day) or (0,))[0] or 0
    unit_rows = _q(cur, "units.registered",
                   f"WITH {cohort} SELECT unit, count(*) FROM cohort GROUP BY unit ORDER BY 2 DESC", _p(cfg, day, day))

    active_sql = (f"WITH {cohort}, {events} SELECT count(DISTINCT e.user_id) FROM events e "
                  f"JOIN cohort c ON c.id = e.user_id WHERE e.d BETWEEN %(lo)s AND %(hi)s")
    active_unit_sql = (f"WITH {cohort}, {events} SELECT c.unit, count(DISTINCT e.user_id) FROM events e "
                       f"JOIN cohort c ON c.id = e.user_id WHERE e.d BETWEEN %(lo)s AND %(hi)s GROUP BY c.unit")

    def active(lo_, hi_):
        r = one("active.total", active_sql, lo_, hi_)
        return int(r[0] or 0) if r else 0

    active_today = active(day, day)
    active_yday = active(day - dt.timedelta(days=1), day - dt.timedelta(days=1))
    active_week = active(week_lo, day)
    active_prev_week = active(week_lo - dt.timedelta(days=7), day - dt.timedelta(days=7))
    active_by_unit = {r[0]: int(r[1] or 0) for r in _q(cur, "active.by_unit", active_unit_sql, _p(cfg, week_lo, day))}

    units = []
    for unit, n in unit_rows:
        name = unit if unit else UNMAPPED
        units.append({"name": name, "registered": int(n or 0), "active_week": active_by_unit.get(unit, 0)})
    units.sort(key=lambda u: (u["name"] == UNMAPPED, -u["registered"]))

    # ---- daily series (14 days) ----------------------------------------------------------------
    s_lo = day - dt.timedelta(days=13)
    lp_daily_sql = (f"WITH {cohort} SELECT {LD.format(col='lp.created_at')} AS d, count(*), count(DISTINCT lp.user_id) "
                    f"FROM lesson_plans lp JOIN cohort c ON c.id = lp.user_id WHERE {COARSE.format(col='lp.created_at')} "
                    f"GROUP BY 1")
    coach_daily_sql = (f"WITH {cohort} SELECT {LD.format(col='cs.completed_at')} AS d, count(*), count(DISTINCT cs.user_id) "
                       f"FROM coaching_sessions cs JOIN cohort c ON c.id = cs.user_id WHERE cs.status = 'completed' "
                       f"AND {COARSE.format(col='cs.completed_at')} GROUP BY 1")
    reading_daily_sql = (f"WITH {cohort} SELECT {LD.format(col='ra.created_at')} AS d, count(*), count(DISTINCT ra.user_id) "
                         f"FROM reading_assessments ra JOIN cohort c ON c.id = ra.user_id WHERE ra.status = 'completed' "
                         f"AND {COARSE.format(col='ra.created_at')} GROUP BY 1")
    active_daily_sql = (f"WITH {cohort}, {events} SELECT e.d, count(DISTINCT e.user_id) FROM events e "
                        f"JOIN cohort c ON c.id = e.user_id WHERE e.d BETWEEN %(lo)s AND %(hi)s GROUP BY 1")

    def by_day(tag, sql, lo_, hi_):
        out = {}
        for r in _q(cur, tag, sql, _p(cfg, lo_, hi_)):
            d = r[0]
            if isinstance(d, dt.datetime):
                d = d.date()
            if lo_ <= d <= hi_:
                out[d] = tuple(int(v or 0) for v in r[1:])
        return out

    lp_d = by_day("lp.daily", lp_daily_sql, s_lo, day) if feats.has("lesson_plans") else {}
    co_d = by_day("coach.daily", coach_daily_sql, s_lo, day) if feats.has("coaching_sessions") else {}
    rd_d = by_day("reading.daily", reading_daily_sql, s_lo, day) if feats.has("reading_assessments") else {}
    ac_d = by_day("active.daily", active_daily_sql, s_lo, day)
    daily = []
    for i in range(14):
        d = s_lo + dt.timedelta(days=i)
        daily.append({"date": d.isoformat(),
                      "lps": lp_d.get(d, (0, 0))[0], "lp_teachers": lp_d.get(d, (0, 0))[1],
                      "coach": co_d.get(d, (0, 0))[0], "coach_teachers": co_d.get(d, (0, 0))[1],
                      "reading": rd_d.get(d, (0, 0))[0], "reading_teachers": rd_d.get(d, (0, 0))[1],
                      "active": ac_d.get(d, (0,))[0]})

    # per-unit daily lines (thin dotted per unit; the renderer only draws them for a few units)
    by_unit_daily = {}
    if unit_col and len(units) <= 8:
        lpu = (f"WITH {cohort} SELECT {LD.format(col='lp.created_at')} AS d, c.unit, count(DISTINCT lp.user_id) "
               f"FROM lesson_plans lp JOIN cohort c ON c.id = lp.user_id WHERE {COARSE.format(col='lp.created_at')} "
               f"GROUP BY 1, 2")
        cou = (f"WITH {cohort} SELECT {LD.format(col='cs.completed_at')} AS d, c.unit, count(DISTINCT cs.user_id) "
               f"FROM coaching_sessions cs JOIN cohort c ON c.id = cs.user_id WHERE cs.status = 'completed' "
               f"AND {COARSE.format(col='cs.completed_at')} GROUP BY 1, 2")
        lp_u = _q(cur, "lp.daily_by_unit", lpu, _p(cfg, s_lo, day)) if feats.has("lesson_plans") else []
        co_u = _q(cur, "coach.daily_by_unit", cou, _p(cfg, s_lo, day)) if feats.has("coaching_sessions") else []
        for u in units:
            by_unit_daily[u["name"]] = {d["date"]: {"lp_teachers": 0, "coach_teachers": 0} for d in daily}
        for rows, key in ((lp_u, "lp_teachers"), (co_u, "coach_teachers")):
            for d, unit, n in rows:
                name = unit if unit else UNMAPPED
                ds = _iso(d.date() if isinstance(d, dt.datetime) else d)
                if name in by_unit_daily and ds in by_unit_daily[name]:
                    by_unit_daily[name][ds][key] = int(n or 0)

    # ---- weekly series (8 weeks ending on the covered day) ---------------------------------
    weekly_series = []
    if weekly:
        w_lo = day - dt.timedelta(days=8 * 7 - 1)
        bucket = f"floor((%(hi)s::date - {{d}}) / 7)"
        lp_w = (f"WITH {cohort} SELECT {bucket.format(d=LD.format(col='lp.created_at'))} AS k, count(*), "
                f"count(DISTINCT lp.user_id) FROM lesson_plans lp JOIN cohort c ON c.id = lp.user_id "
                f"WHERE {COARSE.format(col='lp.created_at')} GROUP BY 1")
        co_w = (f"WITH {cohort} SELECT {bucket.format(d=LD.format(col='cs.completed_at'))} AS k, count(*), "
                f"count(DISTINCT cs.user_id) FROM coaching_sessions cs JOIN cohort c ON c.id = cs.user_id "
                f"WHERE cs.status = 'completed' AND {COARSE.format(col='cs.completed_at')} GROUP BY 1")
        rd_w = (f"WITH {cohort} SELECT {bucket.format(d=LD.format(col='ra.created_at'))} AS k, count(*), "
                f"count(DISTINCT ra.user_id) FROM reading_assessments ra JOIN cohort c ON c.id = ra.user_id "
                f"WHERE ra.status = 'completed' AND {COARSE.format(col='ra.created_at')} GROUP BY 1")
        ac_w = (f"WITH {cohort}, {events} SELECT {bucket.format(d='e.d')} AS k, count(DISTINCT e.user_id) "
                f"FROM events e JOIN cohort c ON c.id = e.user_id WHERE e.d BETWEEN %(lo)s AND %(hi)s GROUP BY 1")

        def by_week(tag, sql):
            out = {}
            for r in _q(cur, tag, sql, _p(cfg, w_lo, day)):
                k = int(r[0]) if r[0] is not None else None
                if k is not None and 0 <= k < 8:
                    out[k] = tuple(int(v or 0) for v in r[1:])
            return out

        lpw = by_week("lp.weekly", lp_w) if feats.has("lesson_plans") else {}
        cow = by_week("coach.weekly", co_w) if feats.has("coaching_sessions") else {}
        rdw = by_week("reading.weekly", rd_w) if feats.has("reading_assessments") else {}
        acw = by_week("active.weekly", ac_w)
        for k in range(7, -1, -1):
            end = day - dt.timedelta(days=7 * k)
            weekly_series.append({"week_end": end.isoformat(), "week_start": (end - dt.timedelta(days=6)).isoformat(),
                                  "lps": lpw.get(k, (0, 0))[0], "lp_teachers": lpw.get(k, (0, 0))[1],
                                  "coach": cow.get(k, (0, 0))[0], "coach_teachers": cow.get(k, (0, 0))[1],
                                  "reading": rdw.get(k, (0, 0))[0], "reading_teachers": rdw.get(k, (0, 0))[1],
                                  "active": acw.get(k, (0,))[0]})

    # ---- window totals for the headline panels ---------------------------------------------
    def window_totals(lo_, hi_):
        t = {"lps": 0, "lp_teachers": 0, "coach": 0, "coach_teachers": 0, "reading": 0, "reading_teachers": 0}
        if feats.has("lesson_plans"):
            r = one("lp.window", f"WITH {cohort} SELECT count(*), count(DISTINCT lp.user_id) FROM lesson_plans lp "
                    f"JOIN cohort c ON c.id = lp.user_id WHERE {COARSE.format(col='lp.created_at')} "
                    f"AND {LD.format(col='lp.created_at')} BETWEEN %(lo)s AND %(hi)s", lo_, hi_)
            if r:
                t["lps"], t["lp_teachers"] = int(r[0] or 0), int(r[1] or 0)
        if feats.has("coaching_sessions"):
            r = one("coach.window", f"WITH {cohort} SELECT count(*), count(DISTINCT cs.user_id) FROM coaching_sessions cs "
                    f"JOIN cohort c ON c.id = cs.user_id WHERE cs.status = 'completed' AND {COARSE.format(col='cs.completed_at')} "
                    f"AND {LD.format(col='cs.completed_at')} BETWEEN %(lo)s AND %(hi)s", lo_, hi_)
            if r:
                t["coach"], t["coach_teachers"] = int(r[0] or 0), int(r[1] or 0)
        if feats.has("reading_assessments"):
            r = one("reading.window", f"WITH {cohort} SELECT count(*), count(DISTINCT ra.user_id) FROM reading_assessments ra "
                    f"JOIN cohort c ON c.id = ra.user_id WHERE ra.status = 'completed' AND {COARSE.format(col='ra.created_at')} "
                    f"AND {LD.format(col='ra.created_at')} BETWEEN %(lo)s AND %(hi)s", lo_, hi_)
            if r:
                t["reading"], t["reading_teachers"] = int(r[0] or 0), int(r[1] or 0)
        return t

    totals, prev_totals = window_totals(lo, hi), window_totals(plo, phi)

    # ---- coaching: score + sub-indicators (framework-agnostic) -----------------------------
    coaching = None
    if feats.has("coaching_sessions") and feats.col("coaching_sessions", "analysis_data"):
        pct = "NULLIF(cs.analysis_data->'scores'->>'overall_percentage', '')::numeric"
        base = (f"FROM coaching_sessions cs JOIN cohort c ON c.id = cs.user_id WHERE cs.status = 'completed' "
                f"AND {COARSE.format(col='cs.completed_at')} AND {LD.format(col='cs.completed_at')} BETWEEN %(lo)s AND %(hi)s")
        summ_sql = (f"WITH {cohort} SELECT count(*), count(DISTINCT cs.user_id), round(avg({pct}), 1), "
                    f"mode() WITHIN GROUP (ORDER BY cs.analysis_data->>'framework') {base}")

        def summary(lo_, hi_):
            r = one("coach.summary", summ_sql, lo_, hi_)
            if not r:
                return {"sessions": 0, "teachers": 0, "avg_score": None, "framework": None}
            return {"sessions": int(r[0] or 0), "teachers": int(r[1] or 0), "avg_score": _f(r[2]), "framework": r[3]}

        cur_s, prev_s = summary(lo, hi), summary(plo, phi)
        t_lo = day - dt.timedelta(days=59)
        trend = [{"date": _iso(r[0].date() if isinstance(r[0], dt.datetime) else r[0]), "avg": _f(r[1]), "n": int(r[2] or 0)}
                 for r in _q(cur, "coach.score_trend",
                             f"WITH {cohort} SELECT {LD.format(col='cs.completed_at')} AS d, round(avg({pct}), 1), count(*) "
                             f"{base} AND {pct} IS NOT NULL GROUP BY 1 ORDER BY 1", _p(cfg, t_lo, day))]
        dom_sql = (f"WITH {cohort}, s AS (SELECT COALESCE(cs.analysis_data->'domains', cs.analysis_data->'areas') AS dm {base}) "
                   f"SELECT d.key, round(100 * avg((d.value->>'area_score')::numeric / NULLIF((d.value->>'area_max')::numeric, 0)), 1), "
                   f"count(*) FROM s, LATERAL jsonb_each(s.dm) d WHERE jsonb_typeof(d.value) = 'object' AND d.value ? 'area_score' "
                   f"GROUP BY 1 ORDER BY 2")

        def domains(lo_, hi_):
            return [{"key": r[0], "pct": _f(r[1]), "n": int(r[2] or 0)} for r in _q(cur, "coach.domains", dom_sql, _p(cfg, lo_, hi_))]

        coaching = dict(cur_s, score_trend=trend, domains=domains(lo, hi),
                        prev=dict(prev_s, domains=domains(plo, phi)))

    # ---- reading ---------------------------------------------------------------------------
    reading = None
    if feats.has("reading_assessments"):
        base = (f"FROM reading_assessments ra JOIN cohort c ON c.id = ra.user_id WHERE ra.status = 'completed' "
                f"AND {COARSE.format(col='ra.created_at')} AND {LD.format(col='ra.created_at')} BETWEEN %(lo)s AND %(hi)s")
        on_track = ("round(100.0 * count(*) FILTER (WHERE ra.on_track) / NULLIF(count(*) FILTER (WHERE ra.on_track IS NOT NULL), 0), 1)"
                    if feats.col("reading_assessments", "on_track") else "NULL")
        student = "COALESCE(ra.student_identifier, ra.id::text)" if feats.col("reading_assessments", "student_identifier") else "ra.id::text"

        def rsum(lo_, hi_):
            r = one("reading.summary", f"WITH {cohort} SELECT count(*), count(DISTINCT {student}), {on_track} {base}", lo_, hi_)
            if not r:
                return {"assessments": 0, "students": 0, "on_track_pct": None}
            return {"assessments": int(r[0] or 0), "students": int(r[1] or 0), "on_track_pct": _f(r[2])}

        median = ("percentile_cont(0.5) WITHIN GROUP (ORDER BY ra.wcpm)" if feats.col("reading_assessments", "wcpm") else "NULL")
        grade = "ra.grade_level" if feats.col("reading_assessments", "grade_level") else "NULL"
        by_grade = [{"grade": r[0], "n": int(r[1] or 0), "median_wcpm": _f(r[2]), "on_track_pct": _f(r[3])}
                    for r in _q(cur, "reading.by_grade",
                                f"WITH {cohort} SELECT {grade}, count(*), round(({median})::numeric, 1), {on_track} {base} "
                                f"GROUP BY 1 ORDER BY 1", _p(cfg, lo, hi))]
        reading = dict(rsum(lo, hi), by_grade=by_grade, prev=rsum(plo, phi))

    # ---- the feature strip (only tables that exist) ----------------------------------------
    features = []
    ftables = feats.feature_tables()
    if ftables:
        parts = []
        for t in ftables:
            parts.append(f"(SELECT count(*) FROM {t} x JOIN cohort c ON c.id = x.user_id WHERE {COARSE.format(col='x.created_at')} "
                         f"AND {LD.format(col='x.created_at')} BETWEEN %(lo)s AND %(hi)s)")
        fsql = f"WITH {cohort} SELECT " + ", ".join(parts)
        cur_r = one("features.counts", fsql, lo, hi) or (0,) * len(ftables)
        prev_r = one("features.counts", fsql, plo, phi) or (0,) * len(ftables)
        labels = {t: (k, lab) for t, k, lab in FEATURE_TABLES}
        for i, t in enumerate(ftables):
            k, lab = labels[t]
            features.append({"key": k, "label": lab, "n": int(cur_r[i] or 0), "prev": int(prev_r[i] or 0)})

    # ---- school-wise: EVERY unit, worst first --------------------------------------------
    schoolwise, unmapped = [], 0
    if unit_col:
        rows = _q(cur, "schoolwise",
                  f"WITH {cohort}, {events}, act AS (SELECT DISTINCT e.user_id FROM events e WHERE e.d BETWEEN %(lo)s AND %(hi)s) "
                  f"SELECT c.unit, count(*), count(act.user_id) FROM cohort c LEFT JOIN act ON act.user_id = c.id "
                  f"GROUP BY c.unit", _p(cfg, week_lo, day))
        for unit, reg, act in rows:
            reg, act = int(reg or 0), int(act or 0)
            if not unit:
                unmapped += reg
                continue
            schoolwise.append({"unit": unit, "registered": reg, "active_7d": act,
                               "pct": round(100 * act / reg) if reg else 0})
        schoolwise.sort(key=lambda s: (s["pct"], -s["registered"], s["unit"]))

    # ---- observations (only when the fork records them) --------------------------------------
    observations = None
    if feats.observations:
        debrief = ("count(*) FILTER (WHERE cs.debrief_status = 'done')" if feats.debriefs else "NULL")
        base = (f"FROM coaching_sessions cs WHERE cs.observation_type IS NOT NULL AND cs.observer_user_id IS NOT NULL "
                f"AND {COARSE.format(col='cs.created_at')} AND {LD.format(col='cs.created_at')} BETWEEN %(lo)s AND %(hi)s")
        tot = one("obs.total", f"SELECT count(*), count(DISTINCT cs.observer_user_id), {debrief} {base}", lo, hi) or (0, 0, None)
        prev_tot = one("obs.total", f"SELECT count(*), count(DISTINCT cs.observer_user_id), {debrief} {base}", plo, phi) or (0, 0, None)
        name = ("COALESCE(NULLIF(TRIM(o.first_name || ' ' || COALESCE(o.last_name, '')), ''), o.id::text)"
                if feats.col("users", "first_name") else "o.id::text")
        ounit = f"o.{unit_col}" if unit_col else "NULL::text"
        # the roster is everyone who has EVER observed a teacher in this cohort (so a shared database
        # never leaks another programme's observers); their own counts are not scoped
        obs_rows = _q(cur, "obs.by_observer",
                      f"WITH {cohort}, roster AS (SELECT DISTINCT cs0.observer_user_id AS oid FROM coaching_sessions cs0 "
                      f"JOIN cohort c0 ON c0.id = cs0.user_id WHERE cs0.observation_type IS NOT NULL AND cs0.observer_user_id IS NOT NULL), "
                      f"win AS (SELECT cs.observer_user_id AS oid, count(*) AS n {base} GROUP BY 1) "
                      f"SELECT {name}, {ounit}, COALESCE(win.n, 0) FROM roster JOIN users o ON o.id = roster.oid "
                      f"LEFT JOIN win ON win.oid = roster.oid ORDER BY 3 DESC, 1", _p(cfg, lo, hi))
        target = cfg.obs_target_weekly if weekly else cfg.obs_target_daily
        observers = [{"name": r[0], "unit": r[1] or UNMAPPED, "n": int(r[2] or 0)} for r in obs_rows]
        observations = {"total": int(tot[0] or 0), "active_observers": int(tot[1] or 0),
                        "debriefs_done": (int(tot[2]) if tot[2] is not None else None),
                        "prev_total": int(prev_tot[0] or 0), "target": target,
                        "roster_size": len(observers), "hit": sum(1 for o in observers if o["n"] >= target),
                        "above": sum(1 for o in observers if o["n"] > target),
                        "working_days": cal.working_days(lo, hi), "observers": observers}

    return {
        "kind": kind, "day": day.isoformat(),
        "window": {"lo": lo.isoformat(), "hi": hi.isoformat()},
        "prev_window": {"lo": plo.isoformat(), "hi": phi.isoformat()},
        "dateline": cal.dateline(day, kind, cfg.lag),
        "day_word": cal.day_word(cfg.lag),
        "unit_col": unit_col,
        "cohort": {"teachers": int(n_teachers), "label": _cohort_label(cfg),
                   "filters": {k: v for k, v in (("region", cfg.region), ("organization", cfg.organization)) if v}},
        "registration": {"teachers": int(n_teachers), "active_week": active_week, "active_today": active_today,
                         "prev": {"active_week": active_prev_week, "active_today": active_yday}},
        "units": units,
        "series": {"daily": daily, "weekly": weekly_series},
        "by_unit_daily": by_unit_daily,
        "totals": totals, "prev_totals": prev_totals,
        "coaching": coaching, "reading": reading, "features": features,
        "schoolwise": schoolwise, "unmapped_teachers": unmapped,
        "observations": observations,
    }


def _cohort_label(cfg: Config) -> str:
    parts = ["all registered teachers"]
    if cfg.region:
        parts.append(f"in region {cfg.region}")
    if cfg.organization:
        parts.append(f"of {cfg.organization}")
    return " ".join(parts) + ", test accounts excluded"
