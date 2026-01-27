#!/usr/bin/env node

/**
 * Script to update WhatsApp Business display name
 * Usage: node scripts/update-display-name.js
 */

require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

// New display name (already approved by Meta)
const NEW_DISPLAY_NAME = 'Rumi - Teaching Assistant by Taleemabad';

async function updateDisplayName() {
  try {
    console.log('🔄 Updating WhatsApp Business display name...\n');
    console.log(`📝 New display name: "${NEW_DISPLAY_NAME}"\n`);

    // Step 1: Update display name
    console.log('Step 1: Registering display name with WhatsApp...');
    const updateResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}?new_display_name=${encodeURIComponent(NEW_DISPLAY_NAME)}`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );

    console.log('✅ Display name update request sent successfully!');
    console.log('Response:', JSON.stringify(updateResponse.data, null, 2));
    console.log('');

    // Step 2: Check verification status
    console.log('Step 2: Checking verification status...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const statusResponse = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}?fields=new_display_name,new_name_status,verified_name,name_status`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );

    console.log('📊 Current status:');
    console.log(JSON.stringify(statusResponse.data, null, 2));
    console.log('');

    // Interpret status
    const { new_display_name, new_name_status, verified_name, name_status } = statusResponse.data;

    console.log('━'.repeat(60));
    console.log('📋 Display Name Status:');
    console.log('');

    if (verified_name === NEW_DISPLAY_NAME && name_status === 'APPROVED') {
      console.log('✅ Display name is ACTIVE:');
      console.log(`   "${verified_name}"`);
      console.log('   Status: APPROVED');
    } else if (new_name_status === 'PENDING_REVIEW') {
      console.log('⏳ Display name update is pending review:');
      console.log(`   Pending: "${new_display_name}"`);
      console.log('   Status: PENDING_REVIEW');
      console.log('');
      console.log('💡 You will receive a webhook notification when approved.');
      console.log('   Check WhatsApp Manager for updates.');
    } else if (new_name_status === 'APPROVED') {
      console.log('✅ New display name APPROVED:');
      console.log(`   "${new_display_name}"`);
      console.log('   It should be active shortly.');
    } else {
      console.log('Current verified name:', verified_name);
      console.log('Current status:', name_status);
      if (new_display_name) {
        console.log('New display name:', new_display_name);
        console.log('New status:', new_name_status);
      }
    }
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error updating display name:');
    console.error('Status:', error.response?.status);
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

updateDisplayName();
