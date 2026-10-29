# workflows — CI/CD gates: tests, secret scan, graph check, smoke, deploy, Android build

<!-- kg:meta repo=rumi-platform dir=.github/workflows kg=f6ece3f142cd gen=56264a80ec91 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `ci.yml` — Node 22/24 tests, credential grep, Python brief and curriculum tests, lint
- `secret-scan.yml` — gitleaks on every push and PR (config in ../../.gitleaks.toml)
- `deploy.yml` — Railway deploy on push to main
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `portal-android-debug.yml` | Builds a debug Android APK of portal/ on PRs touching it, checks app-mode bundle, uploads artifact |
| `ci.yml` | CI on push/PR to main: Node 22/24 unit tests, no-hardcoded-credentials check, Python brief+curriculum tests, lint |
| `deploy.yml` | Deploys the bot to Railway on push to main; step-level gated so forks without RAILWAY_TOKEN stay green |
| `fresh-clone-smoke.yml` | Weekly/manual smoke: fresh clone, install, run tests, cold-boot with empty env must exit 78 cleanly |
| `kg-check.yml` | PR gate: rebuilds the knowledge graph, fails on stale doors, edited vendored kg tools or secret-pattern hits |
| `secret-scan.yml` | Runs the gitleaks binary on every push/PR to block committed credentials |

## Who reads this (generated)
- (none)

## Never (human)
- Never gate deploy at job level; it stays at step level so forks without a token stay green (deploy.yml:13-17)
- Never edit vendored kg/kg.py, kg/doors.py or kg/heal.py in place; kg-check fails on it (kg-check.yml:6)
- Never give portal-android-debug.yml secrets or a release keystore (portal-android-debug.yml:6-7)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `.github/CLAUDE.md`? · `CHANGELOG.md`? · `docs/railway-operations.md`? · `portal/ANDROID.md`?
