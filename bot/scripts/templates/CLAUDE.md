# templates — Reference scripts and JSON for the /menu carousel templates on the original WABA

<!-- kg:meta repo=rumi-platform dir=bot/scripts/templates kg=b1c1fb72b7e4 gen=0ac6b3b19bf0 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `README.md` — states the ids and handles here are tied to one account
- `create-menu-carousel-v3.js` — current 4-card template creator
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `create-menu-carousel.js` | One-off: creates the original 3-card /menu carousel template with video headers |
| `CLAUDE.md` | (unmapped) |
| `README.md` | Warns the template scripts and JSON are original-WABA reference data with tied ids; clones must regenerate |
| `create-menu-carousel-v3.js` | One-off: creates the 4-card feature_menu_carousel_v3 template from header handles in the v3 JSON |
| `menu-carousel-template-info.json` | Record of the staging feature_menu_carousel_v2 template id and PENDING status from Dec 2025 |
| `menu-carousel-template-v3-info.json` | Record of the staging feature_menu_carousel_v3 template id, status and its four card names |
| `menu-video-media-ids-v3.json` | Holds Meta resumable-upload header handles for the 4 v3 carousel videos; read by create-menu-carousel-v3 |
| `menu-video-media-ids.json` | Holds Meta resumable-upload header handles for the 3 original carousel videos; read by create-menu-carousel |
| `upload-menu-videos-v3.js` | One-off: uploads the 4 feature videos via Meta's resumable API and saves header handles to JSON |
| `upload-menu-videos.js` | One-off: uploads the 3 feature videos via Meta's resumable API and saves header handles to JSON |

## Who reads this (generated)
- env read here: `META_APP_ID` · `META_APP_ID_STAGING` · `PHONE_NUMBER_ID` · `STAGING` · `STAGING_WABA_ID` · `WABA_ID` · `WHATSAPP_TOKEN`

## Never (human)
- Never reuse the JSON handles and template ids; regenerate them for your own WABA, they are not portable (bot/scripts/templates/README.md:5)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.md`? · `bot/scripts/setup/assets/README.md`? · `bot/scripts/templates/CLAUDE.md`? (+2)
