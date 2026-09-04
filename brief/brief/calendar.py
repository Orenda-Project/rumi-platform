"""Which day does a brief REPORT ON, and may it fire at all?

Two dates, and conflating them is the trap:

    fire_day      the local date the job actually ran on
    covered_day   the date the brief is about  =  the previous WORKING day (morning brief)
                                                  or the same day (evening brief)

A morning brief fired on Monday is legitimately about the Friday before — nobody teaches at the
weekend, so "yesterday" would be empty. The day guard therefore watches the FIRE day (daily
Mon–Thu, weekly Fri by default); the covered day is derived from it. The guard lives in code, not
only in the cron: a mis-synced scheduler cannot produce an off-day brief this way.

`BRIEF_TODAY=YYYY-MM-DD` pins the covered day for review renders and replays."""
from __future__ import annotations

import datetime as dt
import os

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover — Python < 3.9
    ZoneInfo = None

WEEKEND = (5, 6)                    # Sat, Sun — never the day a brief is about
WORKING_DOW = (0, 1, 2, 3, 4)       # Mon–Fri
WEEKLY_SPAN_DAYS = 7                # the weekly window, inclusive of both ends
DAILY_DOWS = (0, 1, 2, 3)           # fire days for the daily: Mon–Thu (Monday covers Friday)
WEEKLY_DOW = 4                      # fire day for the weekly: Friday -> last Fri to this Thu


def _zone(tz: str):
    if tz in (None, "", "UTC", "utc"):
        return dt.timezone.utc
    if ZoneInfo is None:
        return dt.timezone.utc
    return ZoneInfo(tz)


def fire_day(now: dt.datetime | None = None, tz: str = "UTC") -> dt.date:
    """The local date this run started on."""
    now = now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)
    return now.astimezone(_zone(tz)).date()


def previous_working_day(d: dt.date) -> dt.date:
    """The most recent Mon–Fri strictly before `d`."""
    d -= dt.timedelta(days=1)
    while d.weekday() in WEEKEND:
        d -= dt.timedelta(days=1)
    return d


def covered_day(lag: int = 1, now: dt.datetime | None = None, tz: str = "UTC") -> dt.date:
    """The day the brief reports on. `lag=0` is same-day (an evening brief); any positive lag
    means the previous WORKING day (a morning brief). `BRIEF_TODAY` overrides it outright."""
    pinned = os.environ.get("BRIEF_TODAY")
    if pinned:
        return dt.date.fromisoformat(pinned)
    today = fire_day(now, tz)
    return previous_working_day(today) if lag else today


def may_fire(day: dt.date, allowed_dow) -> bool:
    """Whether a brief may run on FIRE day `day` (Python weekdays, Mon=0)."""
    return day.weekday() in tuple(allowed_dow)


def decide_kind(day: dt.date, daily_dows=DAILY_DOWS, weekly_dow=WEEKLY_DOW):
    """'weekly' on the weekly fire day, 'daily' on a daily fire day, None on an off-day."""
    if day.weekday() == weekly_dow:
        return "weekly"
    if day.weekday() in tuple(daily_dows):
        return "daily"
    return None


def weekly_window(day: dt.date):
    """(first, last) of the week a weekly brief covers — the 7 days ENDING on the covered day."""
    return day - dt.timedelta(days=WEEKLY_SPAN_DAYS - 1), day


def working_days(lo: dt.date, hi: dt.date) -> int:
    """Working days in [lo, hi] inclusive — the honest divisor for a per-person-per-day rate.
    Every Saturday and Sunday is a structural zero, so dividing by calendar days understates
    the rate by two sevenths. Never returns 0."""
    n = sum(1 for i in range((hi - lo).days + 1)
            if (lo + dt.timedelta(days=i)).weekday() in WORKING_DOW)
    return n or 1


def day_word(lag: int = 1) -> str:
    return "today" if lag == 0 else "yesterday"


def dateline(day: dt.date, kind: str = "daily", lag: int = 1) -> str:
    """The period a brief covers, in words, for its lead line.
        daily  -> "yesterday · Thu 03 Sep"   (or "today · …" for a same-day evening brief)
        weekly -> "Fri 28 Aug – Thu 03 Sep" """
    if kind == "weekly":
        lo, hi = weekly_window(day)
        return f"{lo:%a %d %b} – {hi:%a %d %b}"
    return f"{day_word(lag)} · {day:%a %d %b}"
