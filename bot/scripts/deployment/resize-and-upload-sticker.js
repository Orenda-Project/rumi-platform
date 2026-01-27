#!/usr/bin/env node

/**
 * Script to resize the sticker to 512x512 and upload to WhatsApp
 * Usage: node scripts/resize-and-upload-sticker.js
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const INPUT_STICKER = path.join(__dirname, '../marketing/Blinking Rumi.webp');
const OUTPUT_STICKER = path.join(__dirname, '../marketing/Blinking Rumi 512x512.webp');

async function resizeAndUpload() {
  try {
    console.log('🚀 Starting sticker resize and upload process...\n');

    // Step 1: Check if input file exists
    if (!fs.existsSync(INPUT_STICKER)) {
      console.error('❌ Error: Input sticker not found at:', INPUT_STICKER);
      process.exit(1);
    }

    console.log('✅ Found input sticker:', INPUT_STICKER);

    // Step 2: Resize to 512x512 using sips (macOS built-in tool)
    console.log('📐 Resizing sticker to 512x512 pixels...');

    // sips can resize and pad to maintain aspect ratio
    // First, let's resize maintaining aspect ratio, then pad to 512x512
    await execAsync(`sips -z 512 512 --padToHeightWidth 512 512 "${INPUT_STICKER}" --out "${OUTPUT_STICKER}"`);

    console.log('✅ Sticker resized successfully:', OUTPUT_STICKER);

    // Check file size
    const stats = fs.statSync(OUTPUT_STICKER);
    const fileSizeKB = stats.size / 1024;
    console.log(`📦 File size: ${fileSizeKB.toFixed(2)} KB (max: 500 KB)\n`);

    if (fileSizeKB > 500) {
      console.error('❌ Error: Resized file exceeds 500 KB limit');
      process.exit(1);
    }

    // Step 3: Upload to WhatsApp
    console.log('☁️  Uploading sticker to WhatsApp...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(OUTPUT_STICKER), {
      contentType: 'image/webp',
      filename: path.basename(OUTPUT_STICKER),
    });
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders(),
        },
      }
    );

    const mediaId = uploadResponse.data.id;
    console.log('✅ Sticker uploaded successfully!\n');

    // Step 4: Display the media ID
    console.log('━'.repeat(60));
    console.log('🎉 SUCCESS! Your new 512x512 sticker media ID is:\n');
    console.log(`   ${mediaId}\n`);
    console.log('📋 Next steps:');
    console.log('   1. Update your .env file:');
    console.log(`      LOADING_STICKER_MEDIA_ID=${mediaId}`);
    console.log('   2. Update Railway environment variables with the same value');
    console.log('   3. Test sending the sticker again\n');
    console.log('💡 The issue was: Previous sticker was 800x450, but WhatsApp');
    console.log('   requires stickers to be exactly 512x512 pixels!');
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stderr) {
      console.error('Command error:', error.stderr);
    }
    process.exit(1);
  }
}

// Check for required environment variables
if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure WHATSAPP_TOKEN and PHONE_NUMBER_ID are set in your .env file');
  process.exit(1);
}

resizeAndUpload();
