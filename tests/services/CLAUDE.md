# services — Tests for service-level safety: temp paths, logging and downloads

<!-- kg:meta repo=rumi-platform dir=tests/services kg=fa4ed63fba76 gen=eed25f30409e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `inbound-audio-temp-collision.test.js` — every inbound audio path uses a private temp path
- `gamma-status-not-logged.test.js` — export URLs stay out of logs
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `video/` | → (no door; 1 test files) |
| `inbound-audio-temp-collision.test.js` | Pins that every inbound audio path (voice, reading, attendance, coaching, debrief) writes to a private temp path |
| `CLAUDE.md` | (unmapped) |
| `content-download-pdf.test.js` | Pins ContentService.downloadPDF writing only inside the given private dir despite '/' or '..' in the display name |
| `gamma-status-not-logged.test.js` | Pins that content.service Gamma polling logs status and redacted URLs, never the export URL body |

## Who reads this (generated)
- (none)

## Never (human)
- Signed or public file URLs must not reach logs (gamma-status-not-logged.test.js:2-6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/observe/CLAUDE.index.md`? · `bot/shared/services/observe/CLAUDE.md`? (+5)
