/**
 * Upload Rumi Menu Image to WhatsApp
 * Gets permanent media ID for menu image
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

const MENU_IMAGE_PATH = path.join(__dirname, '../marketing/Rumi Menu.png');

async function uploadMenuImage() {
  console.log('🖼️  Uploading Rumi Menu Image to WhatsApp...\n');

  try {
    // Check if image exists
    if (!fs.existsSync(MENU_IMAGE_PATH)) {
      console.error('❌ Menu image not found:', MENU_IMAGE_PATH);
      process.exit(1);
    }

    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(MENU_IMAGE_PATH));
    form.append('type', 'image/png');
    form.append('messaging_product', 'whatsapp');

    // Upload to WhatsApp Media API
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );

    const mediaId = response.data.id;

    console.log('✅ Image uploaded successfully!');
    console.log('\n📋 Media ID:', mediaId);
    console.log('\n🔧 Add this to your .env file:');
    console.log(`   MENU_IMAGE_MEDIA_ID=${mediaId}`);
    console.log('\n💡 Also add to shared/utils/constants.js:');
    console.log(`   MENU_IMAGE_MEDIA_ID: process.env.MENU_IMAGE_MEDIA_ID || '${mediaId}'`);

  } catch (error) {
    console.error('❌ Error uploading menu image:', error.response?.data || error.message);
    process.exit(1);
  }
}

uploadMenuImage();
