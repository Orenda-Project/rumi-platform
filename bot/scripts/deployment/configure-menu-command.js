#!/usr/bin/env node

/**
 * Configure /menu command in WhatsApp Conversational Components
 * This makes the command appear when users type "/" in WhatsApp
 */

require('dotenv').config();
const axios = require('axios');

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function configureMenuCommand() {
  try {
    console.log('📋 Configuring /menu command...\n');

    const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/conversational_automation`;

    const payload = {
      commands: [
        {
          command_name: "menu",
          command_description: "Show available options and features"
        }
      ]
    };

    console.log('Request URL:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('\n⏳ Sending request to WhatsApp API...\n');

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success! Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📱 Test it now:');
    console.log('1. Open WhatsApp');
    console.log('2. Go to your business number chat');
    console.log('3. Type "/" in the message box');
    console.log('4. You should see "/menu - Show available options and features"');

  } catch (error) {
    console.error('❌ Error configuring command:');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);

    if (error.response?.status === 400) {
      console.error('\n💡 Tip: Make sure your PHONE_NUMBER_ID and WHATSAPP_TOKEN are correct');
    }
  }
}

configureMenuCommand();
