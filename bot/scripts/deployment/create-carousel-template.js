#!/usr/bin/env node

/**
 * Script to create the services carousel template
 * Usage: node scripts/create-carousel-template.js
 */

require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WABA_ID = process.env.WABA_ID;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

// Media IDs from upload
const MEDIA_IDS = {
  coaching: '1342285060098790',
  lessonPlan: '834965685673276',
  mediaLibrary: '1604031214304203',
  other: '3012031555649511'
};

async function createCarouselTemplate() {
  try {
    console.log('🚀 Creating services carousel template...\n');

    const templatePayload = {
      name: 'rumi_services_carousel_v1',
      language: 'en_US',
      category: 'marketing',
      components: [
        {
          type: 'body',
          text: 'Welcome to Rumi! I\'m here to support you in your teaching journey. Explore what I can help you with:'
        },
        {
          type: 'carousel',
          cards: [
            // Card 1: Classroom Coaching
            {
              components: [
                {
                  type: 'header',
                  format: 'image',
                  example: {
                    header_handle: [MEDIA_IDS.coaching]
                  }
                },
                {
                  type: 'body',
                  text: 'Share classroom audio. Get supportive feedback on what\'s working and gentle ideas for growth.'
                },
                {
                  type: 'buttons',
                  buttons: [
                    {
                      type: 'quick_reply',
                      text: 'Coach Me'
                    }
                  ]
                }
              ]
            },
            // Card 2: Generate Content
            {
              components: [
                {
                  type: 'header',
                  format: 'image',
                  example: {
                    header_handle: [MEDIA_IDS.lessonPlan]
                  }
                },
                {
                  type: 'body',
                  text: 'From topic to full lesson plan in minutes. Presentations too. More time for what matters.'
                },
                {
                  type: 'buttons',
                  buttons: [
                    {
                      type: 'quick_reply',
                      text: 'Create Now'
                    }
                  ]
                }
              ]
            },
            // Card 3: Media Library
            {
              components: [
                {
                  type: 'header',
                  format: 'image',
                  example: {
                    header_handle: [MEDIA_IDS.mediaLibrary]
                  }
                },
                {
                  type: 'body',
                  text: 'Curated resources for teachers and students. Find what you need, when you need it.'
                },
                {
                  type: 'buttons',
                  buttons: [
                    {
                      type: 'quick_reply',
                      text: 'Browse Library'
                    }
                  ]
                }
              ]
            },
            // Card 4: Other
            {
              components: [
                {
                  type: 'header',
                  format: 'image',
                  example: {
                    header_handle: [MEDIA_IDS.other]
                  }
                },
                {
                  type: 'body',
                  text: 'Whatever\'s on your mind. Big questions, small worries, creative ideas - I\'m here'
                },
                {
                  type: 'buttons',
                  buttons: [
                    {
                      type: 'quick_reply',
                      text: 'Ask Me Anything'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    console.log('📋 Template details:');
    console.log(`   Name: ${templatePayload.name}`);
    console.log(`   Language: ${templatePayload.language}`);
    console.log(`   Category: ${templatePayload.category}`);
    console.log(`   Cards: 4\n`);

    // Use PHONE_NUMBER_ID for template creation
    const endpoint = PHONE_NUMBER_ID;
    console.log(`Using endpoint ID: ${endpoint} (PHONE_NUMBER_ID)\n`);

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${endpoint}/message_templates`,
      templatePayload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Template created successfully!\n');
    console.log('📊 Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n' + '━'.repeat(60));
    console.log('⏳ Template Status: PENDING REVIEW');
    console.log('\n💡 Next steps:');
    console.log('   1. Template is now pending Meta approval');
    console.log('   2. Approval typically takes 1-24 hours');
    console.log('   3. Check status with: node scripts/check-template-status.js');
    console.log('   4. Once approved, you can send it to users');
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error creating template:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Check for required environment variables
if (!WHATSAPP_TOKEN || (!WABA_ID && !PHONE_NUMBER_ID)) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure WHATSAPP_TOKEN and WABA_ID (or PHONE_NUMBER_ID) are set in your .env file');
  process.exit(1);
}

createCarouselTemplate();
