"""Every knob the brief has, read from the environment once. Nothing here is a credential except
the database URL, and that is only ever read from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _dows(raw: str | None, default):
    if not raw:
        return tuple(default)
    return tuple(int(x) for x in raw.replace(" ", "").split(",") if x != "")


@dataclass
class Config:
    tz: str = "UTC"                       # IANA zone the programme lives in (day boundaries, datelines)
    group_by: str = "school_name"         # the organising unit: school_name | region | organization
    region: str | None = None             # optional cohort filter on users.region
    organization: str | None = None       # optional cohort filter on users.organization
    lag: int = 1                          # 1 = morning brief about the previous working day; 0 = evening, same day
    daily_dows: tuple = (0, 1, 2, 3)      # fire days for the daily (Mon=0)
    weekly_dow: int = 4                   # fire day for the weekly
    brand: str = "Rumi"                   # the name on the cover
    programme: str = ""                   # the programme/region name on the cover ("" -> "Our programme")
    obs_target_daily: int = 2             # observations per observer per day (target-and-stars panel)
    obs_target_weekly: int = 10
    out_dir: str = "brief/out"
    live_url: str | None = None
    db_url: str | None = None
    supabase_url: str | None = None
    supabase_key: str | None = None
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls, env=None) -> "Config":
        e = env if env is not None else os.environ
        g = lambda k, d=None: (e.get(k) or "").strip() or d  # noqa: E731
        return cls(
            tz=g("BRIEF_TZ", "UTC"),
            group_by=g("BRIEF_GROUP_BY", "school_name"),
            region=g("BRIEF_REGION"),
            organization=g("BRIEF_ORGANIZATION"),
            lag=int(g("BRIEF_LAG", "1")),
            daily_dows=_dows(g("BRIEF_DAILY_DOWS"), (0, 1, 2, 3)),
            weekly_dow=int(g("BRIEF_WEEKLY_DOW", "4")),
            brand=g("BRIEF_BRAND_NAME", "Rumi"),
            programme=g("BRIEF_PROGRAMME_NAME", ""),
            obs_target_daily=int(g("BRIEF_OBS_TARGET_DAILY", "2")),
            obs_target_weekly=int(g("BRIEF_OBS_TARGET_WEEKLY", "10")),
            out_dir=g("BRIEF_OUT_DIR", "brief/out"),
            live_url=g("BRIEF_LIVE_URL"),
            db_url=g("BRIEF_DATABASE_URL") or g("DATABASE_URL"),
            supabase_url=g("SUPABASE_URL"),
            supabase_key=g("SUPABASE_SERVICE_ROLE_KEY"),
        )

    @property
    def programme_label(self) -> str:
        return self.programme or "Our programme"
