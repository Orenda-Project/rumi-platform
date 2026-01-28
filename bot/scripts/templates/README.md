# Template Scripts and Data

These files are **reference templates** used for the original Taleemabad WABA (WhatsApp Business Account). They contain template creation scripts and JSON data files with WABA-specific values.

## Important: WABA-Specific Values

The JSON data files and scripts in this directory contain **media handles and template IDs** that are tied to the original WABA account:

- `menu-video-media-ids.json` / `menu-video-media-ids-v3.json` -- Media handles for uploaded videos (these are opaque tokens tied to a specific WABA and expire)
- `menu-carousel-template-info.json` / `menu-carousel-template-v3-info.json` -- Template IDs from the original account
- `create-menu-carousel.js` / `create-menu-carousel-v3.js` -- Scripts that reference these IDs
- `upload-menu-videos.js` / `upload-menu-videos-v3.js` -- Scripts that upload video assets

These values **will not work** with a different WABA account.

## For Clone Users

Use `bot/scripts/setup/run-full-setup.js` instead, which handles template creation automatically for your own WABA. It uploads your assets and registers templates in a single step.

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-railway-url.up.railway.app
```

See `bot/scripts/setup/assets/README.md` for asset requirements (image dimensions, video formats, etc.).

## If You Need Custom Templates

If you want to modify the carousel templates:

1. Update the template structure in the `create-menu-carousel-v3.js` script
2. Prepare your own video/image assets per the specs in `bot/scripts/setup/assets/README.md`
3. Upload assets using the Meta Graph API to get your own media handles
4. Update the media IDs in your copy of the script
5. Run the script with your WABA credentials
