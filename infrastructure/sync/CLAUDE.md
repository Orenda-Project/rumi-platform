# sync — Maintainer-only config for syncing internal code into this public repo

<!-- kg:meta repo=rumi-platform dir=infrastructure/sync kg=ec60b6ae04e5 gen=2c97b81aac1b overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `README.md` — what manifest.json and exclude.txt do
- `manifest.json` — path mappings, exclude, publicOnly
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `README.md` | Maintainer-only note on how manifest.json and exclude.txt drive internal-to-public syncing; ignorable for forks |
| `manifest.json` | Canonical sync map: internal-to-public path mappings, exclude and publicOnly rules for the sync script |
| `exclude.txt` | Human-readable list of paths never synced to the public repo; mirrors manifest.json exclude |

## Who reads this (generated)
- (none)

## Never (human)
- Never edit exclude.txt without manifest.json (or the reverse); change both together (exclude.txt:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `SETUP.md`? · `infrastructure/CLAUDE.md`? · `infrastructure/scripts/CLAUDE.md`? · `infrastructure/sync/README.md`?
