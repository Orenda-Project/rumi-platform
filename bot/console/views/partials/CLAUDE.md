# partials — Shared head, nav, foot and credential-row fragments for console pages

<!-- kg:meta repo=rumi-platform dir=bot/console/views/partials kg=9a91be440969 gen=50c7dd2d222e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `head.ejs` — carries the per-request token and mount path in meta tags
- `nav.ejs` — sidebar links and tallies
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `foot.ejs` | Closes the console page layout and loads console.js |
| `head.ejs` | Console page head: title, stylesheet, and the per-request token and mount path in meta tags |
| `keyline.ejs` | Renders one credential row (masked value, Reveal and Set/Replace buttons) for the Setup page |
| `nav.ejs` | Console sidebar navigation with setup and feature tallies and the standalone-mode note |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/console/views/CLAUDE.md`?
