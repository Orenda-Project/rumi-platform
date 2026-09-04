"""The manifest is the contract with the Node sender and the dashboard; the storage mirror is
best-effort and never breaks a render."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from brief import publish  # noqa: E402


def fake_panels(d):
    files = {}
    for i, pid in enumerate(["cover", "registration"]):
        p = os.path.join(d, f"{i:02d}_{pid}.png")
        with open(p, "wb") as fh:
            fh.write(b"\x89PNG fake")
        files[pid] = p
    return files


class Manifest(unittest.TestCase):
    def test_writes_latest_and_archive_with_the_contract_fields(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as src:
            files = fake_panels(src)
            posts = [{"id": "cover", "image": files["cover"], "caption": "lead text", "alt": "cover"},
                     {"id": "registration", "image": files["registration"], "caption": "cap", "alt": "reg"}]
            man = publish.write(out, kind="daily", day="2026-09-03", dateline="yesterday · Thu 03 Sep",
                                cohort={"teachers": 640, "label": "all registered teachers"},
                                posts=posts, closer="In short", live_url=None)
            latest = json.load(open(os.path.join(out, "latest", "daily", "manifest.json")))
            archive = json.load(open(os.path.join(out, "archive", "daily", "2026-09-03", "manifest.json")))
            for m in (latest, archive):
                self.assertEqual(m["version"], 1)
                self.assertEqual(m["kind"], "daily")
                self.assertEqual(m["lead"], "lead text")
                self.assertEqual(m["panels"][0]["file"], "00_cover.png")
                self.assertTrue(m["generated_at"].endswith("Z"))
            self.assertTrue(os.path.exists(os.path.join(out, "latest", "daily", "00_cover.png")))
            self.assertEqual(man["panels"][1]["caption"], "cap")

    def test_latest_is_replaced_not_accumulated(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as src:
            files = fake_panels(src)
            stale = os.path.join(out, "latest", "daily", "99_stale.png")
            os.makedirs(os.path.dirname(stale)); open(stale, "wb").write(b"x")
            publish.write(out, kind="daily", day="2026-09-03", dateline="d", cohort={},
                          posts=[{"id": "cover", "image": files["cover"], "caption": "l", "alt": "a"}],
                          closer="c", live_url=None)
            self.assertFalse(os.path.exists(stale))


class Mirror(unittest.TestCase):
    def test_uploads_every_file_with_upsert_and_never_raises(self):
        sent = []

        def fake_http(method, url, headers, body):
            sent.append((method, url, headers.get("x-upsert")))
            return 200, b"{}"

        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as src:
            files = fake_panels(src)
            publish.write(out, kind="daily", day="2026-09-03", dateline="d", cohort={},
                          posts=[{"id": "cover", "image": files["cover"], "caption": "l", "alt": "a"}],
                          closer="c", live_url=None)
            n = publish.mirror(out, "daily", "2026-09-03", supabase_url="https://x.supabase.co",
                               service_key="k", http=fake_http)
        self.assertEqual(n, 4)     # manifest + png, in latest/ and archive/
        puts = [(u, up) for meth, u, up in sent if meth == "PUT"]
        self.assertEqual(len(puts), 4)
        self.assertTrue(all(u.startswith("https://x.supabase.co/storage/v1/object/brief/") for u, _ in puts))
        self.assertTrue(all(up == "true" for _, up in puts))
        self.assertEqual(sent[0][0], "POST")      # the bucket is ensured first

    def test_mirror_failure_is_reported_not_raised(self):
        def broken(method, url, headers, body):
            raise OSError("network down")
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as src:
            files = fake_panels(src)
            publish.write(out, kind="daily", day="2026-09-03", dateline="d", cohort={},
                          posts=[{"id": "cover", "image": files["cover"], "caption": "l", "alt": "a"}],
                          closer="c", live_url=None)
            n = publish.mirror(out, "daily", "2026-09-03", supabase_url="https://x.supabase.co",
                               service_key="k", http=broken)
        self.assertEqual(n, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
