# reports — Tests for PDF and HTML report rendering and temp-file safety

<!-- kg:meta repo=rumi-platform dir=tests/reports kg=c138c2ee040f gen=0bc28fa5293e overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `html-to-pdf-untrusted.test.js` — untrusted mode blocks scripts and network
- `report-temp-collision.test.js` — concurrent sends never share a temp PDF
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `report-temp-collision.test.js` | Pins that concurrent report, quiz and reading sends never share a temp PDF path, so each person gets their own report |
| `mewaka-report.test.js` | Pins the MEWAKA report transformer, HTML template and report-transformer-dispatch wiring |
| `CLAUDE.md` | (unmapped) |
| `reading-report-service.test.js` | Pins reading report.service routing: Playwright HTML-to-PDF primary, PDFKit fallback |
| `reading-report-template.test.js` | Pins reading-report HTML template structure, fonts, Urdu RTL and no leaked placeholders |
| `html-to-pdf-untrusted-network.test.js` | Proves in real Chromium that untrusted mode opens no connection to a local listener for PNG or PDF |
| `html-to-pdf-untrusted.test.js` | Pins html-to-pdf untrusted option: no page script, every non data:/about: request aborted |
| `html-to-pdf.test.js` | Pins the html-to-pdf Playwright wrapper with playwright-core mocked (no Chromium needed) |

## Who reads this (generated)
- (none)

## Never (human)
- Untrusted pages must open no network connection, proven in real Chromium (html-to-pdf-untrusted-network.test.js:2-6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.index.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? · `bot/shared/services/pic-to-lp/CLAUDE.index.md`? · `bot/shared/services/quiz/CLAUDE.index.md`? · `bot/shared/services/reading/CLAUDE.index.md`? (+5)
