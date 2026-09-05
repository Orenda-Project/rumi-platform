"""The calendar discipline — which day a brief is ABOUT, and whether it may fire at all.

A morning brief covers the previous WORKING day (Monday's brief is about Friday); an evening
brief covers the same day; the weekly is the 7 days ending on the covered day; and a code-level
day guard, never only the cron, decides whether a brief goes out."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import calendar as cal  # noqa: E402


class PreviousWorkingDay(unittest.TestCase):
    def test_monday_covers_the_friday_before(self):
        self.assertEqual(cal.previous_working_day(dt.date(2026, 9, 7)), dt.date(2026, 9, 4))  # Mon -> Fri

    def test_tuesday_covers_monday(self):
        self.assertEqual(cal.previous_working_day(dt.date(2026, 9, 8)), dt.date(2026, 9, 7))

    def test_sunday_also_lands_on_friday(self):
        self.assertEqual(cal.previous_working_day(dt.date(2026, 9, 6)), dt.date(2026, 9, 4))


class CoveredDay(unittest.TestCase):
    def test_lag_zero_is_the_same_day(self):
        now = dt.datetime(2026, 9, 3, 21, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(cal.covered_day(lag=0, now=now, tz="UTC"), dt.date(2026, 9, 3))

    def test_lag_one_is_the_previous_working_day_in_the_local_zone(self):
        # 03:30 UTC on Friday 4 Sep is already 08:30 Friday in Karachi -> covers Thursday 3 Sep
        now = dt.datetime(2026, 9, 4, 3, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(cal.covered_day(lag=1, now=now, tz="Asia/Karachi"), dt.date(2026, 9, 3))

    def test_timezone_moves_the_date_across_midnight(self):
        # 22:30 UTC on Thu 3 Sep is 03:30 Fri 4 Sep in Karachi
        now = dt.datetime(2026, 9, 3, 22, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(cal.fire_day(now=now, tz="Asia/Karachi"), dt.date(2026, 9, 4))
        self.assertEqual(cal.fire_day(now=now, tz="UTC"), dt.date(2026, 9, 3))

    def test_pinned_day_overrides_everything(self):
        os.environ["BRIEF_TODAY"] = "2026-08-12"
        try:
            self.assertEqual(cal.covered_day(lag=1, tz="UTC"), dt.date(2026, 8, 12))
        finally:
            del os.environ["BRIEF_TODAY"]


class Windows(unittest.TestCase):
    def test_weekly_window_is_seven_days_ending_on_the_covered_day(self):
        lo, hi = cal.weekly_window(dt.date(2026, 9, 3))
        self.assertEqual((lo, hi), (dt.date(2026, 8, 28), dt.date(2026, 9, 3)))

    def test_working_days_divisor_skips_weekends_and_never_returns_zero(self):
        self.assertEqual(cal.working_days(dt.date(2026, 8, 28), dt.date(2026, 9, 3)), 5)   # Fri..Thu
        self.assertEqual(cal.working_days(dt.date(2026, 9, 5), dt.date(2026, 9, 6)), 1)    # Sat..Sun -> 1, not 0

    def test_may_fire_guards_the_fire_day(self):
        self.assertTrue(cal.may_fire(dt.date(2026, 9, 7), (0, 1, 2, 3)))    # Monday, daily set
        self.assertFalse(cal.may_fire(dt.date(2026, 9, 5), (0, 1, 2, 3)))   # Saturday
        self.assertTrue(cal.may_fire(dt.date(2026, 9, 4), (4,)))            # Friday, weekly


class Dateline(unittest.TestCase):
    def test_daily_names_the_day_word_and_the_date(self):
        self.assertEqual(cal.dateline(dt.date(2026, 9, 3), "daily", lag=1), "yesterday · Thu 03 Sep")
        self.assertEqual(cal.dateline(dt.date(2026, 9, 3), "daily", lag=0), "today · Thu 03 Sep")

    def test_weekly_names_the_range(self):
        self.assertEqual(cal.dateline(dt.date(2026, 9, 3), "weekly"), "Fri 28 Aug – Thu 03 Sep")

    def test_decide_kind_from_the_fire_day(self):
        self.assertEqual(cal.decide_kind(dt.date(2026, 9, 4)), "weekly")   # Friday
        self.assertEqual(cal.decide_kind(dt.date(2026, 9, 7)), "daily")    # Monday
        self.assertIsNone(cal.decide_kind(dt.date(2026, 9, 5)))            # Saturday
        self.assertEqual(cal.decide_kind(dt.date(2026, 9, 5), daily_dows=(0, 1, 2, 3, 4, 5, 6), weekly_dow=6), "daily")


if __name__ == "__main__":
    unittest.main(verbosity=2)
