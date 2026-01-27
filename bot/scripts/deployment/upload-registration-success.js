/**
 * Upload Registration Success Animation to WhatsApp
 * This script uploads the registration success sticker and returns the media ID
 */

require('dotenv').config();
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const STICKER_PATH = path.join(__dirname, '../marketing/Registration Succesful.webp');

async function uploadRegistrationSuccess() {
  try {
    console.log('\n📤 Uploading Registration Success Animation to WhatsApp...\n');

    // Check if file exists
    if (!fs.existsSync(STICKER_PATH)) {
      throw new Error(`File not found: ${STICKER_PATH}`);
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(STICKER_PATH), {
      contentType: 'image/webp',
      filename: 'registration_success.webp'
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'sticker');

    // Upload to WhatsApp
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        }
      }
    );

    const mediaId = response.data.id;

    console.log('✅ Upload successful!');
    console.log('\n📋 Add this to your .env file:\n');
    console.log(`REGISTRATION_SUCCESS_STICKER_MEDIA_ID=${mediaId}`);
    console.log('\n✨ You can now use this media ID to send the registration success sticker!\n');

    return mediaId;
  } catch (error) {
    console.error('❌ Error uploading registration success sticker:', error.response?.data || error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  uploadRegistrationSuccess()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { uploadRegistrationSuccess };
