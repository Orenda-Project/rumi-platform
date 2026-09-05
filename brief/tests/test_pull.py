"""The pull — every metric definition, asserted against the SQL it emits and the shape it returns.

Offline: a fake connection routes on each query's `/* tag */`. These tests pin the definitions
that must never drift silently: the cohort filter, event-based "active", the local-day boundary,
the comparison windows behind every delta chip, and schema-gated panels."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import pull, schema  # noqa: E402
from brief.config import Config  # noqa: E402
from tests.fakes import FakeConn  # noqa: E402
from tests.test_schema import BASELINE  # noqa: E402

DAY = dt.date(2026, 9, 3)


def feats(extra=()):
    return schema.detect(FakeConn({"schema.columns": BASELINE + list(extra)}))


def canned():
    """A small but complete set of canned rows so pull() returns a full metrics dict."""
    return {
        "cohort.count": [(640,)],
        "units.registered": [("Riverside Primary", 120), ("Hillcrest", 80), (None, 12)],
        "active.total": [(233,)],
        "active.by_unit": [("Riverside Primary", 40), ("Hillcrest", 21)],
        "lp.daily": [(DAY - dt.timedelta(days=i), 30 - i, 20 - i) for i in range(14)],
        "coach.daily": [(DAY - dt.timedelta(days=i), 12, 9) for i in range(14)],
        "reading.daily": [(DAY - dt.timedelta(days=i), 5, 4) for i in range(14)],
        "active.daily": [(DAY - dt.timedelta(days=i), 150 - i) for i in range(14)],
        "lp.daily_by_unit": [(DAY, "Riverside Primary", 10), (DAY, "Hillcrest", 6)],
        "coach.daily_by_unit": [(DAY, "Riverside Primary", 4), (DAY, "Hillcrest", 2)],
        "coach.summary": [(84, 61, 58.4, "hots")],
        "coach.score_trend": [(DAY - dt.timedelta(days=i), 55.0 + i % 3, 7) for i in range(30)],
        "coach.domains": [("lesson_planning", 61.0, 84), ("student_engagement", 48.5, 84)],
        "reading.summary": [(37, 35, 62.2)],
        "reading.by_grade": [(2, 12, 41.0, 58.3), (3, 25, 60.5, 64.0)],
        "features.counts": [(14, 9, 3, 2)],
        "schoolwise": [("Riverside Primary", 120, 40), ("Hillcrest", 80, 5), ("Lakeside", 10, 0)],
        "obs.by_observer": [("Amina K.", "Riverside Primary", 4), ("Bilal R.", "Hillcrest", 0)],
        "obs.total": [(4, 2, 3)],
    }


class Cohort(unittest.TestCase):
    def test_cohort_excludes_test_users_and_incomplete_registrations(self):
        conn = FakeConn(canned())
        pull.pull(conn, DAY, "daily", Config(), feats())
        sql = conn.sql_for("cohort.count")[0]
        self.assertIn("COALESCE(u.is_test_user, false) = false", sql)
        self.assertIn("u.registration_completed = true", sql)

    def test_region_and_organization_filters_are_parameterised_not_interpolated(self):
        conn = FakeConn(canned())
        cfg = Config(region="north", organization="acme")
        pull.pull(conn, DAY, "daily", cfg, feats())
        sql = conn.sql_for("cohort.count")[0]
        self.assertIn("u.region = %(region)s", sql)
        self.assertIn("u.organization = %(organization)s", sql)
        self.assertNotIn("north", sql)
        self.assertEqual(conn.params_for("cohort.count")[0]["region"], "north")

    def test_no_filters_means_no_filter_clauses(self):
        conn = FakeConn(canned())
        pull.pull(conn, DAY, "daily", Config(), feats())
        self.assertNotIn("u.region", conn.sql_for("cohort.count")[0])


class Active(unittest.TestCase):
    def test_active_is_a_union_of_teacher_originated_events_never_a_pointer(self):
        conn = FakeConn(canned())
        pull.pull(conn, DAY, "daily", Config(), feats())
        sql = conn.sql_for("active.total")[0]
        for table in ("conversations", "lesson_plans", "coaching_sessions", "reading_assessments",
                      "quiz_sessions", "attendance_sessions"):
            self.assertIn(table, sql)
        self.assertIn("role = 'user'", sql)
        self.assertNotIn("last_message_at", sql)
        self.assertNotIn("last_activity_at", sql)

    def test_local_day_boundary_uses_the_configured_timezone(self):
        conn = FakeConn(canned())
        pull.pull(conn, DAY, "daily", Config(tz="Asia/Karachi"), feats())
        sql = conn.sql_for("active.total")[0]
        self.assertIn("AT TIME ZONE %(tz)s", sql)
        self.assertEqual(conn.params_for("active.total")[0]["tz"], "Asia/Karachi")

    def test_every_headline_has_a_comparison_window(self):
        # today, yesterday, this-7, previous-7 -> four windows of the same active query
        conn = FakeConn(canned())
        pull.pull(conn, DAY, "daily", Config(), feats())
        windows = [(p["lo"], p["hi"]) for p in conn.params_for("active.total")]
        self.assertIn((DAY, DAY), windows)
        self.assertIn((DAY - dt.timedelta(days=1), DAY - dt.timedelta(days=1)), windows)
        self.assertIn((DAY - dt.timedelta(days=6), DAY), windows)
        self.assertIn((DAY - dt.timedelta(days=13), DAY - dt.timedelta(days=7)), windows)


class Shape(unittest.TestCase):
    def test_metrics_shape_daily(self):
        m = pull.pull(FakeConn(canned()), DAY, "daily", Config(), feats())
        self.assertEqual(m["kind"], "daily")
        self.assertEqual(m["day"], "2026-09-03")
        self.assertEqual(m["cohort"]["teachers"], 640)
        self.assertEqual(m["registration"]["active_today"], 233)
        self.assertEqual(len(m["series"]["daily"]), 14)
        self.assertEqual(m["series"]["daily"][-1]["date"], "2026-09-03")
        self.assertEqual(m["coaching"]["framework"], "hots")
        self.assertEqual(m["reading"]["by_grade"][0]["grade"], 2)
        self.assertEqual(m["schoolwise"][0]["unit"], "Lakeside")          # worst first
        self.assertEqual(m["schoolwise"][0]["pct"], 0)
        self.assertIsNone(m["observations"])                               # baseline schema
        self.assertEqual(m["units"][0]["name"], "Riverside Primary")
        self.assertEqual(m["units"][-1]["name"], pull.UNMAPPED)             # NULL unit is shown, not dropped

    def test_daily_series_covers_calendar_days_even_with_no_rows(self):
        c = canned()
        c["lp.daily"] = [(DAY, 30, 20)]          # only one day has rows
        m = pull.pull(FakeConn(c), DAY, "daily", Config(), feats())
        self.assertEqual(len(m["series"]["daily"]), 14)
        self.assertEqual(m["series"]["daily"][0]["lps"], 0)
        self.assertEqual(m["series"]["daily"][-1]["lps"], 30)

    def test_weekly_kind_uses_the_seven_day_window_and_eight_weeks(self):
        m = pull.pull(FakeConn(canned()), DAY, "weekly", Config(), feats())
        self.assertEqual(m["window"], {"lo": "2026-08-28", "hi": "2026-09-03"})
        self.assertEqual(len(m["series"]["weekly"]), 8)
        self.assertEqual(m["series"]["weekly"][-1]["week_end"], "2026-09-03")

    def test_observations_panel_switches_on_with_the_fork_columns(self):
        f = feats([("coaching_sessions", "observation_type"), ("coaching_sessions", "observer_user_id"),
                   ("coaching_sessions", "debrief_status")])
        m = pull.pull(FakeConn(canned()), DAY, "daily", Config(), f)
        self.assertEqual(m["observations"]["total"], 4)
        self.assertEqual(m["observations"]["target"], 2)                    # daily target
        self.assertEqual(m["observations"]["observers"][0]["name"], "Amina K.")
        self.assertEqual(m["observations"]["observers"][1]["n"], 0)         # zero rows are shown

    def test_feature_strip_only_counts_tables_that_exist(self):
        f = schema.detect(FakeConn({"schema.columns": [c for c in BASELINE if c[0] != "video_requests"]}))
        c = canned(); c["features.counts"] = [(14, 9, 3)]
        m = pull.pull(FakeConn(c), DAY, "daily", Config(), f)
        self.assertEqual([x["key"] for x in m["features"]], ["quizzes", "attendance", "exam_checks"])

    def test_deltas_compare_the_same_metric_over_the_shifted_window(self):
        c = canned()
        seq = iter([(233,), (200,), (400,), (380,), (233,), (200,), (400,), (380,)])
        c["active.total"] = lambda: [next(seq)]
        m = pull.pull(FakeConn(c), DAY, "daily", Config(), feats())
        self.assertEqual(m["registration"]["active_today"], 233)
        self.assertEqual(m["registration"]["prev"]["active_today"], 200)
        self.assertEqual(m["registration"]["active_week"], 400)
        self.assertEqual(m["registration"]["prev"]["active_week"], 380)


if __name__ == "__main__":
    unittest.main(verbosity=2)
