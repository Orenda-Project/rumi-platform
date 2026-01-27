#!/usr/bin/env node

/**
 * Script to upload the loading sticker to WhatsApp and get a permanent media ID
 * Run this script once to get the media ID, then add it to your .env file
 *
 * Usage: node scripts/upload-loading-sticker.js
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';
const WEBP_STICKER_PATH = path.join(__dirname, '../marketing/new rumi blinking.webp');

async function uploadLoadingSticker() {
  try {
    console.log('🚀 Starting loading sticker upload process...\n');

    // Step 1: Check if WebP file exists
    if (!fs.existsSync(WEBP_STICKER_PATH)) {
      console.error('❌ Error: WebP file not found at:', WEBP_STICKER_PATH);
      console.error('   Please ensure the file exists before running this script');
      process.exit(1);
    }

    console.log('✅ Found WebP sticker:', WEBP_STICKER_PATH);

    // Check file size
    const stats = fs.statSync(WEBP_STICKER_PATH);
    const fileSizeKB = stats.size / 1024;
    console.log(`📦 File size: ${fileSizeKB.toFixed(2)} KB (max: 500 KB)\n`);

    if (fileSizeKB > 500) {
      console.error('❌ Error: File exceeds 500 KB limit for animated stickers');
      process.exit(1);
    }

    // Step 2: Upload to WhatsApp
    console.log('Step 2: Uploading sticker to WhatsApp...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(WEBP_STICKER_PATH), {
      contentType: 'image/webp',
      filename: path.basename(WEBP_STICKER_PATH),
    });
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/media`,
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

    // Step 3: Display the media ID
    console.log('━'.repeat(60));
    console.log('🎉 SUCCESS! Your loading sticker media ID is:\n');
    console.log(`   ${mediaId}\n`);
    console.log('📋 Next steps:');
    console.log('   1. Add this line to your .env file:');
    console.log(`      LOADING_STICKER_MEDIA_ID=${mediaId}`);
    console.log('   2. Update Railway environment variables with the same value');
    console.log('   3. Restart your application\n');
    console.log('💡 This media ID is permanent and can be reused indefinitely');
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error uploading sticker:');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
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

// Run the upload
uploadLoadingSticker();
