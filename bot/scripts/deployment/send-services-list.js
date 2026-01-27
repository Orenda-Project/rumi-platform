#!/usr/bin/env node

/**
 * Script to send interactive list of services (alternative to carousel)
 * This works immediately without template approval
 * Usage: node scripts/send-services-list.js
 */

require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || '15550010001';
const API_VERSION = 'v21.0';

async function sendServicesList() {
  try {
    console.log('🚀 Sending services interactive list...\n');
    console.log(`📱 To: ${TEST_PHONE_NUMBER}\n`);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TEST_PHONE_NUMBER,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: 'Welcome to Rumi! 👋'
        },
        body: {
          text: 'I\'m here to support you in your teaching journey. Explore what I can help you with:'
        },
        footer: {
          text: 'Choose a service to get started'
        },
        action: {
          button: 'See Services',
          sections: [
            {
              title: 'Teaching Support',
              rows: [
                {
                  id: 'classroom_coaching',
                  title: 'Classroom Coaching',
                  description: 'Get feedback on what\'s working and gentle ideas for growth'
                },
                {
                  id: 'generate_content',
                  title: 'Generate Content',
                  description: 'Create lesson plans and presentations in minutes'
                },
                {
                  id: 'media_library',
                  title: 'Media Library',
                  description: 'Curated resources for teachers and students'
                },
                {
                  id: 'ask_anything',
                  title: 'Ask Me Anything',
                  description: 'Big questions, small worries, creative ideas'
                }
              ]
            }
          ]
        }
      }
    };

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Interactive list sent successfully!\n');
    console.log('📊 Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n' + '━'.repeat(60));
    console.log('💡 Check your WhatsApp for the interactive list!');
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error sending list:');
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
  process.exit(1);
}

sendServicesList();
