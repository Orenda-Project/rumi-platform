require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

// New PIN to set
const NEW_PIN = '030411';

async function changePin() {
  try {
    console.log('🔐 Changing WhatsApp Two-Step Verification PIN...\n');
    console.log(`   Phone Number ID: ${PHONE_NUMBER_ID}`);
    console.log(`   New PIN: ${NEW_PIN}\n`);

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      {
        pin: NEW_PIN
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ PIN changed successfully!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📝 Important:');
    console.log(`   Your new PIN is: ${NEW_PIN}`);
    console.log('   Update your .env file with: WHATSAPP_2FA_PIN=030411');
    console.log('   Keep this PIN safe for future registrations!\n');

  } catch (error) {
    console.error('❌ Failed to change PIN!\n');
    if (error.response?.data) {
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

changePin();
