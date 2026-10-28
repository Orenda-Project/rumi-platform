# storage — Tests for the R2/S3 storage client behaviour

<!-- kg:meta repo=rumi-platform dir=tests/storage kg=be407aa9eedc gen=f830ee7fcd06 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `r2-path-style.test.js` — path-style mode for MinIO-like stores
- `r2-key-error-no-url.test.js` — errors never carry the URL
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `r2-key-error-no-url.test.js` | Pins that an R2 key-extraction error never puts the URL in the message (bot r2 and dashboard r2.service) |
| `CLAUDE.md` | (unmapped) |
| `r2-path-style.test.js` | Pins R2_FORCE_PATH_STYLE for MinIO-style stores; off by default so R2 requests are unchanged |

## Who reads this (generated)
- (none)

## Never (human)
- A URL must not appear in an R2 key-extraction error message (r2-key-error-no-url.test.js:2-4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `dashboard/services/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/storage/CLAUDE.md`?
