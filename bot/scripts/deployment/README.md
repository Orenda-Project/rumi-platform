# Deployment Scripts

These scripts are **reference implementations** used for the original Taleemabad WABA (WhatsApp Business Account). They demonstrate Meta Graph API patterns for common operations like uploading media, creating templates, updating display names, and registering phone numbers.

## Important: WABA-Specific Values

Many scripts contain **hardcoded media IDs, template IDs, and phone number IDs** that are specific to Taleemabad's WABA account. These IDs will not work with your account.

Examples of WABA-specific values:
- Media IDs in `create-carousel-template.js` (e.g., `1342285060098790`)
- Phone Number IDs and display names in `register-phone-number.js`
- Sticker/image handles in `upload-loading-sticker.js`, `upload-menu-image.js`, etc.

## For Clone Users

**Do not run these scripts directly.** Instead, use the automated setup script which handles template creation and media uploads for your own WABA:

```bash
node bot/scripts/setup/run-full-setup.js \
  --waba-id=$WABA_ID \
  --token=$WHATSAPP_TOKEN \
  --phone-number-id=$PHONE_NUMBER_ID \
  --endpoint-base=https://your-railway-url.up.railway.app
```

See Step 7.6 in `SETUP.md` for full instructions.

## If You Need to Modify

If you need to run individual deployment operations (e.g., updating your display name or uploading custom media), you can use these scripts as templates:

1. Copy the script you need
2. Replace all hardcoded IDs with values from your own WABA account
3. Ensure your `.env` has the correct `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, and `WABA_ID`
