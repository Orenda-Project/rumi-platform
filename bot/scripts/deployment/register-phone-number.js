require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

// Two-step verification PIN
// If your number already has 2FA enabled, this should be your existing PIN
// If not, this will be set as your new PIN
const TWO_STEP_PIN = process.env.WHATSAPP_2FA_PIN || '123456'; // Change this!

async function registerPhoneNumber() {
  try {
    console.log('📱 Registering WhatsApp Business Phone Number...\n');
    console.log(`   Phone Number ID: ${PHONE_NUMBER_ID}`);
    console.log(`   Display Name: ${process.env.BOT_NAME || 'Rumi'}\n`);

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      console.error('❌ Missing required environment variables!');
      console.log('   Please ensure WHATSAPP_TOKEN and PHONE_NUMBER_ID are set in .env\n');
      return;
    }

    if (!process.env.WHATSAPP_2FA_PIN) {
      console.warn('⚠️  No WHATSAPP_2FA_PIN found in .env');
      console.log(`   Using default PIN: ${TWO_STEP_PIN}`);
      console.log('   To set a custom PIN, add to .env: WHATSAPP_2FA_PIN=your_6_digit_pin\n');
    }

    // Make registration request
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/register`,
      {
        messaging_product: 'whatsapp',
        pin: TWO_STEP_PIN
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Registration successful!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📝 Important Notes:');
    console.log('   1. Your phone number is now registered');
    console.log('   2. Two-step verification is enabled with PIN:', TWO_STEP_PIN);
    console.log('   3. Keep this PIN safe - you\'ll need it for future registrations');
    console.log('   4. You can now send messages using this number\n');

  } catch (error) {
    console.error('❌ Registration failed!\n');

    if (error.response?.data) {
      const errorData = error.response.data;
      console.error('Error details:', JSON.stringify(errorData, null, 2));

      // Check for specific error codes
      if (errorData.error?.code === 133016) {
        console.log('\n⚠️  Rate limit exceeded!');
        console.log('   You have made 10+ registration requests in the last 72 hours.');
        console.log('   Please wait before trying again.\n');
      } else if (errorData.error?.message?.includes('pin')) {
        console.log('\n⚠️  PIN issue detected!');
        console.log('   If your number already has 2FA enabled, use your existing PIN.');
        console.log('   Update .env with: WHATSAPP_2FA_PIN=your_existing_pin\n');
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Optional: Function to deregister (if needed)
async function deregisterPhoneNumber() {
  try {
    console.log('🔄 Deregistering phone number...\n');

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/deregister`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );

    console.log('✅ Deregistration successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📝 You can now register again with updated settings.\n');

  } catch (error) {
    console.error('❌ Deregistration failed!');
    if (error.response?.data) {
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('--deregister')) {
  deregisterPhoneNumber();
} else if (args.includes('--help')) {
  console.log('WhatsApp Phone Number Registration Script\n');
  console.log('Usage:');
  console.log('  node scripts/register-phone-number.js           # Register phone number');
  console.log('  node scripts/register-phone-number.js --deregister   # Deregister first');
  console.log('\nEnvironment Variables:');
  console.log('  WHATSAPP_TOKEN      - Your WhatsApp API token');
  console.log('  PHONE_NUMBER_ID     - Your phone number ID');
  console.log('  WHATSAPP_2FA_PIN    - Your 6-digit two-factor PIN (optional)\n');
} else {
  registerPhoneNumber();
}
