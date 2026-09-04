"""Morning Brief — the programme-health brief a team wakes up to.

Same charts, same cohort, same window, every morning, so drift is visible at a glance. The
package is credential-free but for one read-only Postgres URL: `calendar` decides which day a
brief is about, `schema` reads the live database to see which panels can exist, `pull` runs the
metric definitions, `render` draws the panels, `compose` writes the captions, `publish` writes the
manifest the bot's channel drivers deliver. The whole pipeline is `cli.py render`."""

__version__ = "1.0.0"
