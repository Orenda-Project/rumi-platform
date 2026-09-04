"""Trend lines are PCHIP curves: through every real point, never overshooting between them."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import smooth  # noqa: E402


class Smooth(unittest.TestCase):
    def test_passes_through_every_real_point(self):
        xs, ys = smooth.smooth_xy([0, 1, 2, 3], [0, 10, 3, 8])
        for x, y in zip([0, 1, 2, 3], [0, 10, 3, 8]):
            i = min(range(len(xs)), key=lambda k: abs(xs[k] - x))
            self.assertAlmostEqual(ys[i], y, places=6)

    def test_never_leaves_the_range_of_its_neighbours(self):
        # a cubic spline would dip below 0 between 0 and 0 here; PCHIP must not
        xs, ys = smooth.smooth_xy([0, 1, 2, 3, 4], [0, 0, 40, 40, 0])
        self.assertGreaterEqual(min(ys), -1e-9)
        self.assertLessEqual(max(ys), 40 + 1e-9)

    def test_short_series_pass_through_unchanged(self):
        self.assertEqual(smooth.smooth_xy([0, 1], [5, 6]), ([0, 1], [5, 6]))

    def test_densifies(self):
        xs, ys = smooth.smooth_xy([0, 1, 2], [1, 2, 3])
        self.assertGreater(len(xs), 3)
        self.assertEqual(len(xs), len(ys))


if __name__ == "__main__":
    unittest.main(verbosity=2)
