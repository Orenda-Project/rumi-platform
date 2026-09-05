"""Panels switch themselves on from the LIVE schema, never from an assumption about it.

The baseline OSS schema has no leader observations, no lesson-plan ratings; a fork that adds them
gets those panels without touching the brief. Detection reads information_schema once."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import schema  # noqa: E402
from tests.fakes import FakeConn  # noqa: E402

BASELINE = [
    ("users", "id"), ("users", "created_at"), ("users", "registration_completed"), ("users", "is_test_user"),
    ("users", "school_name"), ("users", "region"), ("users", "organization"), ("users", "first_name"),
    ("lesson_plans", "user_id"), ("lesson_plans", "created_at"),
    ("coaching_sessions", "user_id"), ("coaching_sessions", "status"), ("coaching_sessions", "completed_at"),
    ("coaching_sessions", "created_at"), ("coaching_sessions", "analysis_data"),
    ("reading_assessments", "user_id"), ("reading_assessments", "status"), ("reading_assessments", "created_at"),
    ("reading_assessments", "wcpm"), ("reading_assessments", "on_track"), ("reading_assessments", "grade_level"),
    ("conversations", "user_id"), ("conversations", "role"), ("conversations", "created_at"),
    ("quiz_sessions", "user_id"), ("quiz_sessions", "created_at"),
    ("attendance_sessions", "user_id"), ("attendance_sessions", "created_at"),
    ("exam_check_sessions", "user_id"), ("exam_check_sessions", "created_at"),
    ("video_requests", "user_id"), ("video_requests", "created_at"),
]


class Detect(unittest.TestCase):
    def test_baseline_has_core_panels_but_no_observations_or_ratings(self):
        f = schema.detect(FakeConn({"schema.columns": BASELINE}))
        self.assertTrue(f.has("lesson_plans"))
        self.assertTrue(f.has("coaching_sessions"))
        self.assertTrue(f.has("reading_assessments"))
        self.assertFalse(f.observations)
        self.assertFalse(f.ratings)
        self.assertEqual(f.group_by_candidates, ["school_name", "region", "organization"])

    def test_fork_with_observation_columns_switches_the_panel_on(self):
        cols = BASELINE + [("coaching_sessions", "observation_type"), ("coaching_sessions", "observer_user_id"),
                           ("coaching_sessions", "debrief_status")]
        f = schema.detect(FakeConn({"schema.columns": cols}))
        self.assertTrue(f.observations)
        self.assertTrue(f.debriefs)

    def test_missing_optional_tables_drop_out_of_the_feature_strip(self):
        cols = [c for c in BASELINE if c[0] not in ("video_requests", "exam_check_sessions")]
        f = schema.detect(FakeConn({"schema.columns": cols}))
        self.assertEqual(f.feature_tables(), ["quiz_sessions", "attendance_sessions"])

    def test_detection_reads_information_schema_once(self):
        conn = FakeConn({"schema.columns": BASELINE})
        schema.detect(conn)
        self.assertEqual(conn.tags(), ["schema.columns"])
        self.assertIn("information_schema.columns", conn.sql_for("schema.columns")[0])

    def test_group_by_falls_back_when_the_column_is_absent(self):
        cols = [c for c in BASELINE if c != ("users", "school_name")]
        f = schema.detect(FakeConn({"schema.columns": cols}))
        self.assertEqual(f.resolve_group_by("school_name"), "region")
        self.assertIsNone(schema.detect(FakeConn({"schema.columns": [c for c in cols if c[0] != "users" or c[1] not in ("region", "organization")]})).resolve_group_by("school_name"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
