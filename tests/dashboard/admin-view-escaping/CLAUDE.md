# admin-view-escaping — jsdom tests that admin EJS views render hostile API values as text, not markup

<!-- kg:meta repo=rumi-platform dir=tests/dashboard/admin-view-escaping kg=abdc8c9a093c gen=abb5ef98df1c overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `html-sinks.test.js` — scans every view's inline script for unescaped HTML building
- `escape-html.test.js` — the shared escapeHtml and safeUrl helpers
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `CLAUDE.md` | (unmapped) |
| `transcript-enhanced.test.js` | Renders transcript-enhanced.ejs with the coaching transcript route's locals; hostile text stays text |
| `users.test.js` | Renders users.ejs with a fully hostile sign-up and checks list and chat view show it as text |
| `admin-invitations.test.js` | Renders admin-invitations.ejs in jsdom and checks hostile API values stay text, not markup |
| `admin-users.test.js` | Renders admin-users.ejs (scope editor) in jsdom and checks hostile values stay text, not markup |
| `html-sinks.test.js` | Scans inline scripts of every admin EJS view so HTML they build escapes interpolations, with a reviewed allowlist |
| `ama.test.js` | Renders ama.ejs (admin and own-chat views) in jsdom and checks hostile chat text stays text |
| `api-health.test.js` | Renders api-health.ejs in jsdom and checks third-party service status text is escaped |
| `broadcast.test.js` | Renders broadcast.ejs in jsdom and checks composer values and country counts stay text |
| `byof-session.test.js` | Renders byof-session.ejs in jsdom and checks BYOF chat messages cannot become markup |
| `escape-html.test.js` | Pins the shared public/js/escape-html.js helpers window.escapeHtml and window.safeUrl |

## Who reads this (generated)
- (none)

## Never (human)
- Views must be rendered through ../helpers/render-admin-view.js, the real view in jsdom (tests/dashboard/admin-view-escaping/users.test.js)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/dashboard/views/CLAUDE.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/README.md`? · `dashboard/services/CLAUDE.index.md`? · `dashboard/views/CLAUDE.index.md`? (+6)
