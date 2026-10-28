# console — Tests for the operator console: auth gate, secret redaction, live feed, switches

<!-- kg:meta repo=rumi-platform dir=tests/console kg=f41ad30a106a gen=bdf2211aa156 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `redaction.test.js` — default-deny secret classification; the most important suite here
- `auth-gate.test.js` — password-free only when loopback-only is positively proven
- `event-ring.test.js` — allowlist keeping private data out of the live feed
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `channel-cards.test.js` | Pins one console card per additive channel with its own name, setup pointer and "when off" line |
| `CLAUDE.md` | (unmapped) |
| `auth-gate.test.js` | Pins the console's fail-closed auth matrix: password-free only when positively loopback-only |
| `feature-overrides.test.js` | Pins operator feature switches only ever subtracting; no switches means a deployment behaves as before |
| `boot-independence.test.js` | Pins that the console never requires a boot-blocking module (supabase.js exits 78) so it opens on a broken deploy |
| `redaction.test.js` | Pins the console's default-deny secret classification and masking so no live key reaches a screen |
| `event-ring.test.js` | Pins the console live-feed allowlist: no phone numbers, message text, student names or stack traces reach a browser |
| `no-inline-styles.test.js` | Pins console.js using no inline styles, since the style-src 'self' CSP silently drops them |
| `overview-probes-attribute.test.js` | Pins the overview's data-probes attribute being entity-escaped and parsing back to the probe list via ejs |

## Who reads this (generated)
- env read here: `CI`

## Never (human)
- Env names must be classified default-deny: an unknown name is a secret (tests/console/redaction.test.js:6)
- console.js must stay free of inline styles; style-src 'self' drops them silently (tests/console/no-inline-styles.test.js:2)
- Feature overrides may only subtract, never enable (tests/console/feature-overrides.test.js:4)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/console/CLAUDE.index.md`? · `bot/console/CLAUDE.md`? · `bot/shared/config/CLAUDE.index.md`? · `docs/CLAUDE.index.md`? (+4)
