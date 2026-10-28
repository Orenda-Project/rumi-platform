# whatsapp — Tests for the Meta WhatsApp driver's send methods

<!-- kg:meta repo=rumi-platform dir=tests/whatsapp kg=c60e0eb01b84 gen=4e5321daab23 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `send-temp-collision.test.js` — media sends never share a temp file
- `send-template.test.js` — template sends for closed windows
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `send-temp-collision.test.js` | Pins that Meta driver media sends never share a temp file between concurrent calls |
| `send-image-from-url.test.js` | Pins WhatsAppService.sendImageFromUrl, once missing, which the coaching commitment-card path called with an R2 URL |
| `send-document-missing-path.test.js` | Pins Meta sendDocument returning false quietly for a missing path instead of an unhandled stream ENOENT |
| `send-template.test.js` | Pins WhatsAppService.sendTemplate for out-of-window quiz invites, once missing so every invite threw |
| `CLAUDE.md` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/whatsapp/CLAUDE.md`?
