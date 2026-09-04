"""Captions are templated from the metrics — plain language, honest deltas, statements not questions."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import compose  # noqa: E402
from brief.sample import make_sample  # noqa: E402


class Delta(unittest.TestCase):
    def test_counts_are_relative_above_twenty_and_absolute_below(self):
        self.assertEqual(compose.delta_text(120, 100, "count"), "▲ 20%")
        self.assertEqual(compose.delta_text(18, 6, "count"), "▲ 12")
        self.assertEqual(compose.delta_text(6, 18, "count"), "▼ 12")
        self.assertEqual(compose.delta_text(100, 100, "count"), "no change")

    def test_percentages_are_points(self):
        self.assertEqual(compose.delta_text(48.2, 44.0, "pct"), "▲ 4pt")
        self.assertEqual(compose.delta_text(40.0, 44.6, "pct"), "▼ 5pt")

    def test_missing_baseline_is_stated_not_faked(self):
        self.assertEqual(compose.delta_text(12, None, "count"), "no earlier data")


class Posts(unittest.TestCase):
    def setUp(self):
        self.m = make_sample.metrics("daily")

    def test_lead_names_the_dateline_and_the_cohort(self):
        posts = compose.posts(self.m, {"cover": "00_cover.png"}, brand="Rumi")
        lead = posts[0]["caption"]
        self.assertIn(self.m["dateline"], lead)
        self.assertIn(str(self.m["cohort"]["teachers"]), lead.replace(",", ""))
        self.assertIn("Same charts every", lead)

    def test_no_post_ends_with_a_question(self):
        posts = compose.posts(self.m, {}, brand="Rumi")
        for p in posts:
            self.assertFalse(p["caption"].rstrip().endswith("?"), p["id"])

    def test_closer_is_a_one_line_tally(self):
        c = compose.closer(self.m, live_url="https://example.org/brief")
        self.assertIn("lesson plans", c)
        self.assertIn("https://example.org/brief", c)

    def test_panel_order_is_fixed(self):
        posts = compose.posts(make_sample.metrics("weekly"), {}, brand="Rumi")
        ids = [p["id"] for p in posts]
        self.assertEqual(ids[:3], ["cover", "registration", "lessonplans"])
        self.assertIn("schoolwise", ids)
        self.assertEqual(ids.index("schoolwise"), len(ids) - 1)   # attention list is always last


if __name__ == "__main__":
    unittest.main(verbosity=2)
