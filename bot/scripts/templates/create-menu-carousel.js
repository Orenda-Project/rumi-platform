#!/usr/bin/env node

/**
 * Create Feature Menu Carousel Template
 *
 * This script creates the WhatsApp carousel template for the /menu command.
 * It uses video headers to showcase feature intro videos.
 *
 * Prerequisites:
 *   1. Run upload-menu-videos.js first to get media IDs
 *   2. Copy media IDs into MENU_VIDEO_MEDIA_IDS below
 *
 * Usage:
 *   STAGING=true node scripts/templates/create-menu-carousel.js
 *
 * For production:
 *   node scripts/templates/create-menu-carousel.js
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Environment-specific config
const isStaging = process.env.STAGING === 'true';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// Configure via environment variables
const STAGING_WABA_ID = process.env.STAGING_WABA_ID || '';
const PRODUCTION_WABA_ID = process.env.WABA_ID || '';
const WABA_ID = isStaging ? STAGING_WABA_ID : PRODUCTION_WABA_ID;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

// Try to load media IDs from file (output of upload script)
let MENU_VIDEO_MEDIA_IDS = {};
const mediaIdsPath = path.join(__dirname, 'menu-video-media-ids.json');
if (fs.existsSync(mediaIdsPath)) {
  MENU_VIDEO_MEDIA_IDS = JSON.parse(fs.readFileSync(mediaIdsPath, 'utf8'));
  console.log('📁 Loaded media IDs from file');
} else {
  console.error('❌ No media IDs file found. Run upload-menu-videos.js first.');
  console.error(`   Expected file: ${mediaIdsPath}`);
  process.exit(1);
}

/**
 * Create the carousel template
 */
async function createMenuCarouselTemplate() {
  try {
    console.log('\n🚀 Creating Feature Menu Carousel Template...\n');
    console.log('━'.repeat(60));
    console.log(`Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
    console.log(`WABA ID: ${WABA_ID}`);
    console.log('━'.repeat(60));

    const templatePayload = {
      name: 'feature_menu_carousel_v2',
      language: 'en',
      category: 'MARKETING', // Carousel templates require MARKETING category
      components: [
        {
          type: 'BODY',
          text: "Here's what I can help you with! Swipe to explore my features:"
        },
        {
          type: 'CAROUSEL',
          cards: [
            // Card 1: Lesson Plans
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_MEDIA_IDS.lesson_plan]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Create detailed lesson plans in PDF format. Just tell me your topic and grade level!'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Try Lesson Plans'
                    }
                  ]
                }
              ]
            },
            // Card 2: Classroom Coaching
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_MEDIA_IDS.coaching]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Upload your classroom audio and get personalized teaching feedback.'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Try Coaching'
                    }
                  ]
                }
              ]
            },
            // Card 3: Reading Assessment
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_MEDIA_IDS.reading]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Assess student reading fluency with WCPM scores and pronunciation feedback.'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Try Reading Test'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    console.log('\n📋 Template details:');
    console.log(`   Name: ${templatePayload.name}`);
    console.log(`   Language: ${templatePayload.language}`);
    console.log(`   Category: ${templatePayload.category}`);
    console.log(`   Cards: ${templatePayload.components[1].cards.length}`);
    console.log('\n   Media IDs:');
    console.log(`   - Lesson Plan: ${MENU_VIDEO_MEDIA_IDS.lesson_plan}`);
    console.log(`   - Coaching: ${MENU_VIDEO_MEDIA_IDS.coaching}`);
    console.log(`   - Reading: ${MENU_VIDEO_MEDIA_IDS.reading}`);

    // Template creation uses WABA_ID
    const endpoint = WABA_ID;
    console.log(`\nUsing WABA ID: ${endpoint}\n`);

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
    console.log('   3. Check status in Meta Business Manager');
    console.log('   4. Once approved, update menu.service.js to use carousel');
    console.log('━'.repeat(60));

    // Save template ID for reference
    const templateInfo = {
      name: templatePayload.name,
      id: response.data.id,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      environment: isStaging ? 'staging' : 'production'
    };
    const outputPath = path.join(__dirname, 'menu-carousel-template-info.json');
    fs.writeFileSync(outputPath, JSON.stringify(templateInfo, null, 2));
    console.log(`\n📁 Template info saved to: ${outputPath}`);

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
if (!WHATSAPP_TOKEN || !WABA_ID) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure WHATSAPP_TOKEN and WABA_ID are set in your .env file');
  console.error('\n   For staging, run with: STAGING=true node scripts/templates/create-menu-carousel.js');
  process.exit(1);
}

// Check for media IDs
if (!MENU_VIDEO_MEDIA_IDS.lesson_plan || !MENU_VIDEO_MEDIA_IDS.coaching || !MENU_VIDEO_MEDIA_IDS.reading) {
  console.error('❌ Error: Missing media IDs');
  console.error('   Please run upload-menu-videos.js first');
  process.exit(1);
}

createMenuCarouselTemplate();
