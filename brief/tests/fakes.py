"""A DB-API-shaped fake connection for offline tests.

Every query the brief runs carries a leading `/* tag */` comment naming what it is for. The fake
routes on that tag: `FakeConn({"lp_daily": rows, ...})`. Unknown tags return an empty result so a
new query cannot silently pass by matching the wrong canned rows."""
import re


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._rows = []
        self.description = None

    def execute(self, sql, params=None):
        m = re.match(r"\s*/\*\s*([\w.-]+)\s*\*/", sql)
        tag = m.group(1) if m else None
        self.conn.calls.append({"tag": tag, "sql": sql, "params": params})
        rows = self.conn.canned.get(tag, [])
        self._rows = list(rows() if callable(rows) else rows)

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeConn:
    def __init__(self, canned=None):
        self.canned = canned or {}
        self.calls = []

    def cursor(self):
        return FakeCursor(self)

    def tags(self):
        return [c["tag"] for c in self.calls]

    def sql_for(self, tag):
        return [c["sql"] for c in self.calls if c["tag"] == tag]

    def params_for(self, tag):
        return [c["params"] for c in self.calls if c["tag"] == tag]
