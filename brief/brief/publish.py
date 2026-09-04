"""The manifest — the contract between the renderer and whoever delivers or displays the brief.

    out/latest/<kind>/manifest.json (+ the PNGs)     always the newest brief of that kind
    out/archive/<kind>/<day>/…                       history, one folder per covered day

`mirror()` copies the same paths into the deployment's Supabase Storage bucket `brief` (public),
so a dashboard or a wall display running on another machine can read them. It is best-effort:
a storage failure is reported, never raised — the brief must still go out."""
from __future__ import annotations

import datetime as dt
import json
import mimetypes
import os
import shutil
import urllib.error
import urllib.request

BUCKET = "brief"


def write(out_dir: str, *, kind: str, day: str, dateline: str, cohort: dict, posts: list,
          closer: str, live_url) -> dict:
    latest = os.path.join(out_dir, "latest", kind)
    archive = os.path.join(out_dir, "archive", kind, day)
    if os.path.isdir(latest):
        shutil.rmtree(latest)
    os.makedirs(latest, exist_ok=True)
    os.makedirs(archive, exist_ok=True)
    panels = []
    for p in posts:
        img = p.get("image")
        if not img or not os.path.exists(img):
            continue
        name = os.path.basename(img)
        shutil.copy2(img, os.path.join(latest, name))
        shutil.copy2(img, os.path.join(archive, name))
        panels.append({"id": p["id"], "file": name, "caption": p["caption"], "alt": p.get("alt", p["id"])})
    manifest = {
        "version": 1, "kind": kind, "day": day, "dateline": dateline,
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cohort": cohort, "lead": posts[0]["caption"] if posts else "", "closer": closer,
        "live_url": live_url, "panels": panels,
    }
    for d in (latest, archive):
        with open(os.path.join(d, "manifest.json"), "w") as fh:
            json.dump(manifest, fh, indent=1, ensure_ascii=False)
    return manifest


def _default_http(method, url, headers, body):
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def mirror(out_dir: str, kind: str, day: str, *, supabase_url: str, service_key: str, http=None) -> int:
    """Upload latest/<kind>/* and archive/<kind>/<day>/* to the public `brief` bucket. Returns the
    number of files uploaded; 0 (with a printed reason) when anything fails."""
    http = http or _default_http
    base = supabase_url.rstrip("/")
    auth = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
    n = 0
    try:
        # create the bucket if it is missing — a 4xx here just means it already exists
        http("POST", f"{base}/storage/v1/bucket", dict(auth, **{"Content-Type": "application/json"}),
             json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode())
        for rel in (os.path.join("latest", kind), os.path.join("archive", kind, day)):
            d = os.path.join(out_dir, rel)
            for name in sorted(os.listdir(d)):
                path = os.path.join(d, name)
                if not os.path.isfile(path):
                    continue
                ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
                key = "/".join([*rel.split(os.sep), name])
                with open(path, "rb") as fh:
                    payload = fh.read()
                status, body = http("PUT", f"{base}/storage/v1/object/{BUCKET}/{key}",
                                    dict(auth, **{"Content-Type": ctype, "x-upsert": "true"}), payload)
                if status >= 300:
                    print(f"brief: storage upload failed for {key}: {status} {body[:120]!r}")
                    continue
                n += 1
    except Exception as e:  # noqa: BLE001 — best effort by design
        print(f"brief: storage mirror skipped: {e}")
        return 0
    return n


def public_url(supabase_url: str, kind: str, name: str = "manifest.json") -> str:
    return f"{supabase_url.rstrip('/')}/storage/v1/object/public/{BUCKET}/latest/{kind}/{name}"
