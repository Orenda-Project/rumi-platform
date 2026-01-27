require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';
const STICKER_PATH = path.join(__dirname, '../marketing/Listening Animation.webp');

async function uploadListeningAnimation() {
  try {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  UPLOAD LISTENING ANIMATION TO WHATSAPP                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    if (!WHATSAPP_TOKEN) {
      console.error('❌ Error: WHATSAPP_TOKEN is not set in environment variables');
      process.exit(1);
    }

    if (!PHONE_NUMBER_ID) {
      console.error('❌ Error: PHONE_NUMBER_ID is not set in environment variables');
      process.exit(1);
    }

    if (!fs.existsSync(STICKER_PATH)) {
      console.error(`❌ Error: Listening animation not found at: ${STICKER_PATH}`);
      process.exit(1);
    }

    console.log('📁 File path:', STICKER_PATH);
    console.log('📱 Phone number ID:', PHONE_NUMBER_ID);
    console.log('');

    // Check file size
    const stats = fs.statSync(STICKER_PATH);
    const fileSizeInBytes = stats.size;
    const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
    console.log(`📊 File size: ${fileSizeInKB} KB`);

    if (fileSizeInBytes > 500000) {
      console.warn('⚠️  Warning: File size is larger than recommended 500KB');
    }

    console.log('\n⏳ Uploading listening animation to WhatsApp...\n');

    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(STICKER_PATH));
    formData.append('type', 'image/webp');
    formData.append('messaging_product', 'whatsapp');

    // Upload to WhatsApp
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        }
      }
    );

    const mediaId = response.data.id;

    console.log('✅ Upload successful!\n');
    console.log('═'.repeat(60));
    console.log('\n📋 Media ID:', mediaId);
    console.log('\n═'.repeat(60));
    console.log('\n🔧 NEXT STEPS:\n');
    console.log('   1. Add this to your .env file:\n');
    console.log(`      LISTENING_ANIMATION_MEDIA_ID=${mediaId}`);
    console.log('\n   2. Add to Railway environment variables (both bot and worker services):\n');
    console.log(`      LISTENING_ANIMATION_MEDIA_ID=${mediaId}`);
    console.log('\n✨ You can now use this media ID to send the listening animation!\n');

  } catch (error) {
    console.error('\n❌ Upload failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

uploadListeningAnimation();
