# fonts — Bundled fonts loaded by file name by PDF, card and image renderers

<!-- kg:meta repo=rumi-platform dir=bot/fonts kg=b69de76f0067 gen=80ff642ea9e9 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `NotoNastaliqUrdu.ttf` — Urdu Nastaliq font registered by exam-checker annotation and a quiz template
- `NotoSansArabic.ttf` — Arabic-script font used by pdf-report.service and reading report.service
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `ScheherazadeNew-4.000/` | Upstream Scheherazade New font package with its licence and docs; no bot code uses it → `ScheherazadeNew-4.000/CLAUDE.md` |
| `NotoNastaliqUrdu.ttf` | (unmapped) |
| `NotoSansArabic-Regular.ttf` | (unmapped) |
| `NotoSansArabic.ttf` | (unmapped) |
| `ScheherazadeNew-Regular.ttf` | (unmapped) |

## Who reads this (generated)
- (none)

## Never (human)
- Do not rename the Noto files: renderers open them by exact path (bot/shared/services/exam-checker/annotation.service.js:32, bot/shared/services/pdf-report.service.js:82)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.md`?
