"""Every panel renders from the synthetic sample, both kinds, at the expected size.

A passing test here is necessary, not sufficient: the layout defects that matter are only ever
caught by opening the PNG. The sample exists so that is cheap to do."""
import os
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import render  # noqa: E402
from brief.config import Config  # noqa: E402
from brief.sample import make_sample  # noqa: E402


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n", path
    return struct.unpack(">II", head[16:24])


class Render(unittest.TestCase):
    def test_daily_and_weekly_render_every_panel(self):
        cfg = Config(programme="Riverside District")
        for kind in ("daily", "weekly"):
            m = make_sample.metrics(kind)
            with tempfile.TemporaryDirectory() as d:
                paths = render.render_all(m, cfg, d)
                self.assertEqual(list(paths)[:4], ["cover", "registration", "lessonplans", "aicoach"])
                self.assertIn("scores", paths); self.assertIn("reading", paths)
                self.assertIn("observations", paths); self.assertEqual(list(paths)[-1], "schoolwise")
                for pid, p in paths.items():
                    w, h = png_size(p)
                    self.assertGreaterEqual(w, 1600, pid)
                    self.assertGreaterEqual(h, 600, pid)
                    self.assertLess(h, 4000, pid)      # the school-wise list stays a readable height
                names = sorted(os.listdir(d))
                self.assertEqual(names[0], "00_cover.png")

    def test_panels_switch_off_with_their_data(self):
        cfg = Config()
        m = make_sample.metrics("daily")
        m["coaching"] = None; m["reading"] = None; m["features"] = []; m["observations"] = None; m["schoolwise"] = []
        with tempfile.TemporaryDirectory() as d:
            paths = render.render_all(m, cfg, d)
            self.assertEqual(list(paths), ["cover", "registration", "lessonplans", "aicoach"])

    def test_no_unit_column_still_renders(self):
        cfg = Config()
        m = make_sample.metrics("daily")
        m["unit_col"] = None; m["units"] = []; m["schoolwise"] = []; m["by_unit_daily"] = {}
        with tempfile.TemporaryDirectory() as d:
            paths = render.render_all(m, cfg, d)
            self.assertIn("registration", paths)


if __name__ == "__main__":
    unittest.main(verbosity=2)
