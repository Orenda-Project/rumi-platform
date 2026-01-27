require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

async function getWABAId() {
  try {
    console.log('🔍 Fetching WhatsApp Business Account ID (WABA ID)...\n');
    console.log(`   Phone Number ID: ${PHONE_NUMBER_ID}\n`);

    // Try to get phone number details which should include the WABA ID
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        },
        params: {
          fields: 'id,verified_name,display_phone_number,quality_rating,account_mode'
        }
      }
    );

    console.log('📋 Phone Number Details:');
    console.log(JSON.stringify(response.data, null, 2));

    // The WABA ID might be in the response, or we need to query differently
    console.log('\n💡 To find your WABA ID manually:');
    console.log('   1. Go to https://developers.facebook.com/apps');
    console.log('   2. Select your app');
    console.log('   3. Click WhatsApp → API Setup');
    console.log('   4. Look for "WhatsApp Business Account ID" in Step 1');
    console.log('\nOR:');
    console.log('   1. Go to https://business.facebook.com');
    console.log('   2. Business Settings → Accounts → WhatsApp Business Accounts');
    console.log('   3. Find your account ID there');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);

    console.log('\n💡 Manual steps to find WABA ID:');
    console.log('   1. Go to https://developers.facebook.com/apps');
    console.log('   2. Select your app');
    console.log('   3. Click WhatsApp → API Setup');
    console.log('   4. Look for "WhatsApp Business Account ID" or "From" field in Step 1');
  }
}

getWABAId();
