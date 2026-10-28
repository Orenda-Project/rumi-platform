# sync — Maintainer-only config for syncing internal code into this public repo

<!-- kg:meta repo=rumi-platform dir=infrastructure/sync kg=2c6ff4091db3 gen=cc1e74f2d52b overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `README.md` — what manifest.json and exclude.txt do
- `manifest.json` — path mappings, exclude, publicOnly
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
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
- docs: `SETUP.md`? · `infrastructure/CLAUDE.index.md`? · `infrastructure/CLAUDE.md`? · `infrastructure/scripts/CLAUDE.index.md`? · `infrastructure/scripts/CLAUDE.md`? · `infrastructure/sync/CLAUDE.md`? (+1)
