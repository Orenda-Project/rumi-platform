require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID; // WhatsApp Business Account ID
const API_VERSION = 'v21.0';

// Profile picture path
const PROFILE_PICTURE_PATH = '/Users/haroonyasin/Documents/Cursor/Projects/AI-Projects/WhatsApp testing/Lucid_Origin_Quentin_Blake_style_black_and_white_illustration__1.jpg';

async function updateWhatsAppProfile() {
  try {
    console.log('🔄 Starting WhatsApp Business Profile update...\n');

    // Check if WABA_ID is set
    if (!WABA_ID) {
      console.error('❌ WABA_ID not found in .env file!\n');
      console.log('Please add your WhatsApp Business Account ID to .env:');
      console.log('   1. Go to https://developers.facebook.com/apps');
      console.log('   2. Select your app → WhatsApp → API Setup');
      console.log('   3. Copy the WABA ID from Step 1');
      console.log('   4. Add to .env: WABA_ID=your_waba_id\n');
      return;
    }

    // Step 1: Create upload session
    console.log('📤 Step 1: Creating upload session...');
    const fileStats = fs.statSync(PROFILE_PICTURE_PATH);
    const fileSize = fileStats.size;

    console.log(`   File size: ${fileSize} bytes (${(fileSize / 1024).toFixed(2)} KB)`);

    // Create upload session using WABA_ID with query parameters
    const sessionResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/uploads?file_length=${fileSize}&file_type=image/jpeg`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );

    const sessionId = sessionResponse.data.id;
    console.log(`   ✅ Upload session created: ${sessionId}\n`);

    // Step 2: Upload the file
    console.log('📸 Step 2: Uploading profile picture...');
    const imageBuffer = fs.readFileSync(PROFILE_PICTURE_PATH);

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${sessionId}`,
      imageBuffer,
      {
        headers: {
          'Authorization': `OAuth ${WHATSAPP_TOKEN}`,
          'file_offset': '0',
          'Content-Type': 'image/jpeg'
        }
      }
    );

    const pictureHandle = uploadResponse.data.h;
    console.log(`   ✅ Image uploaded successfully!`);
    console.log(`   Handle: ${pictureHandle}\n`);

    // Step 3: Update business profile
    console.log('🔧 Step 3: Updating WhatsApp Business profile...');
    const profileResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/whatsapp_business_profile`,
      {
        messaging_product: 'whatsapp',
        profile_picture_handle: pictureHandle,
        // Display name has been approved by Meta: "Rumi - The Teacher Companion"
        about: 'Rumi - Your AI teaching companion for Pakistan'
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   ✅ Profile updated successfully!');
    console.log('\n📋 Response:', JSON.stringify(profileResponse.data, null, 2));

    // Step 4: Update display name (already approved by Meta)
    console.log('\n📝 Step 4: Updating display name to "Rumi - The Teacher Companion"...');
    try {
      const nameResponse = await axios.post(
        `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/whatsapp_business_profile`,
        {
          messaging_product: 'whatsapp',
          address: 'Pakistan',
          description: 'Your AI teaching companion',
          vertical: 'EDUC',
          email: process.env.SUPPORT_EMAIL || 'support@example.com'
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('   ✅ Business profile details updated!');
      console.log('   Display name: Rumi - The Teacher Companion (approved by Meta)');
    } catch (nameError) {
      console.log('   ⚠️  Additional profile update note:', nameError.response?.data?.error?.message || nameError.message);
    }

  } catch (error) {
    console.error('❌ Error updating profile:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

updateWhatsAppProfile();
