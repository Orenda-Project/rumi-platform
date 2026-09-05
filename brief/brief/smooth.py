"""House-style line smoothing for every trend panel.

Fritsch–Carlson monotone cubic Hermite interpolation (PCHIP), numpy only. Chosen over a cubic
spline because a spline OVERSHOOTS between points and would invent dips or negative percentages
that never happened; PCHIP passes through every real point and never leaves the range of its
neighbours. The curve is presentation — the markers stay on the original points, which are the
data."""
from __future__ import annotations

import numpy as np

try:                                        # matplotlib only needed for datetime axes
    import matplotlib.dates as _mdates
except Exception:                           # pragma: no cover
    _mdates = None


def _monotone_cubic(xs, ys, xd):
    n = len(xs)
    h = np.diff(xs).astype(float)
    delta = np.diff(ys) / h
    m = np.empty(n)
    m[1:-1] = (delta[:-1] + delta[1:]) / 2.0
    m[0], m[-1] = delta[0], delta[-1]
    for i in range(n - 1):
        if delta[i] == 0:
            m[i] = m[i + 1] = 0.0
        else:
            a, b = m[i] / delta[i], m[i + 1] / delta[i]
            s = a * a + b * b
            if s > 9.0:
                t = 3.0 / s ** 0.5
                m[i], m[i + 1] = t * a * delta[i], t * b * delta[i]
    idx = np.clip(np.floor(xd).astype(int), 0, n - 2)
    t = (xd - xs[idx]) / h[idx]
    t2, t3 = t * t, t * t * t
    h00 = 2 * t3 - 3 * t2 + 1
    h10 = t3 - 2 * t2 + t
    h01 = -2 * t3 + 3 * t2
    h11 = t3 - t2
    return h00 * ys[idx] + h10 * h[idx] * m[idx] + h01 * ys[idx + 1] + h11 * h[idx] * m[idx + 1]


def smooth_xy(x, values, density: int = 14):
    """(x, values) -> (x_dense, y_dense) along the PCHIP curve. x may be datetimes or numbers;
    the same kind comes back. Fewer than 3 points, or any numeric trouble, returns the input —
    a straight line beats a crashed brief."""
    try:
        ys = np.asarray([float(v) for v in values], dtype=float)
        n = len(ys)
        if n < 3 or len(x) != n:
            return list(x), list(values)
        xs = np.arange(n, dtype=float)
        xd = np.linspace(0.0, n - 1.0, (n - 1) * density + 1)
        yy = _monotone_cubic(xs, ys, xd)
        first = x[0]
        if hasattr(first, "year") and _mdates is not None:
            xnum = np.asarray([_mdates.date2num(d) for d in x], dtype=float)
            return list(_mdates.num2date(np.interp(xd, xs, xnum))), list(yy)
        xnum = np.asarray([float(v) for v in x], dtype=float)
        return list(np.interp(xd, xs, xnum)), list(yy)
    except Exception:                        # pragma: no cover
        return list(x), list(values)
