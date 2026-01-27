#!/usr/bin/env node

/**
 * Create Feature Menu Carousel Template v3
 *
 * 4 cards: Lesson Plans, Video Generation, Coaching, Reading Assessment
 *
 * Prerequisites:
 *   1. Run upload-menu-videos-v3.js first to get header_handles
 *   2. Header handles saved to menu-video-media-ids-v3.json
 *
 * Usage:
 *   STAGING=true node scripts/templates/create-menu-carousel-v3.js
 *
 * For production:
 *   node scripts/templates/create-menu-carousel-v3.js
 *
 * Limits (per Meta docs):
 *   - Cards: 2-10 per carousel
 *   - Button text: max 20 characters
 *   - Body text: max 160 characters per card
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Environment-specific config
const isStaging = process.env.STAGING === 'true';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const STAGING_WABA_ID = '1568780677606684'; // Bug Buster WABA (staging)
const PRODUCTION_WABA_ID = process.env.WABA_ID || '1383233296670749'; // Digital Coach WABA (production)
const WABA_ID = isStaging ? STAGING_WABA_ID : PRODUCTION_WABA_ID;
const API_VERSION = 'v21.0';

// Load header handles from file
let MENU_VIDEO_HANDLES = {};
const handlesPath = path.join(__dirname, 'menu-video-media-ids-v3.json');
if (fs.existsSync(handlesPath)) {
  MENU_VIDEO_HANDLES = JSON.parse(fs.readFileSync(handlesPath, 'utf8'));
  console.log('📁 Loaded header handles from file');
} else {
  console.error('❌ No header handles file found. Run upload-menu-videos-v3.js first.');
  console.error(`   Expected file: ${handlesPath}`);
  process.exit(1);
}

/**
 * Create the v3 carousel template (4 cards)
 */
async function createMenuCarouselTemplateV3() {
  try {
    console.log('\n🚀 Creating Feature Menu Carousel Template v3...\n');
    console.log('━'.repeat(60));
    console.log(`Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
    console.log(`WABA ID: ${WABA_ID}`);
    console.log('━'.repeat(60));

    const templatePayload = {
      name: 'feature_menu_carousel_v3',
      language: 'en',
      category: 'MARKETING',
      components: [
        {
          type: 'BODY',
          text: "Here's what I can help you with! Swipe to explore:"
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
                    header_handle: [MENU_VIDEO_HANDLES.lesson_plan]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Create lesson plans & presentations. Just tell me your topic and grade!'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Lesson Plans'  // 12 chars (max 20)
                    }
                  ]
                }
              ]
            },
            // Card 2: Video Generation
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_HANDLES.video_generation]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Create educational videos on any topic. I generate animated explainers!'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Create Video'  // 12 chars (max 20)
                    }
                  ]
                }
              ]
            },
            // Card 3: Classroom Coaching
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_HANDLES.coaching]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Upload classroom audio and get personalized teaching feedback.'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Coaching'  // 8 chars (max 20)
                    }
                  ]
                }
              ]
            },
            // Card 4: Reading Assessment
            {
              components: [
                {
                  type: 'HEADER',
                  format: 'VIDEO',
                  example: {
                    header_handle: [MENU_VIDEO_HANDLES.reading]
                  }
                },
                {
                  type: 'BODY',
                  text: 'Assess student reading fluency with WCPM scores and feedback.'
                },
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'QUICK_REPLY',
                      text: 'Reading Test'  // 12 chars (max 20)
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
    console.log('\n   Card order:');
    console.log('   1. Lesson Plans');
    console.log('   2. Video Generation');
    console.log('   3. Classroom Coaching');
    console.log('   4. Reading Assessment');

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`,
      templatePayload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('\n✅ Template created successfully!\n');
    console.log('📊 Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n' + '━'.repeat(60));
    console.log('⏳ Template Status: PENDING REVIEW');
    console.log('\n💡 Next steps:');
    console.log('   1. Wait for Meta approval (1-24 hours)');
    console.log('   2. Update whatsapp.service.js to use v3 template');
    console.log('   3. Update menu.service.js button handlers');
    console.log('━'.repeat(60));

    // Save template info
    const templateInfo = {
      name: templatePayload.name,
      id: response.data.id,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      environment: isStaging ? 'staging' : 'production',
      cards: ['lesson_plan', 'video_generation', 'coaching', 'reading']
    };
    const outputPath = path.join(__dirname, 'menu-carousel-template-v3-info.json');
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

// Validation
if (!WHATSAPP_TOKEN || !WABA_ID) {
  console.error('❌ Missing WHATSAPP_TOKEN or WABA_ID');
  process.exit(1);
}

const requiredHandles = ['lesson_plan', 'video_generation', 'coaching', 'reading'];
const missingHandles = requiredHandles.filter(h => !MENU_VIDEO_HANDLES[h]);
if (missingHandles.length > 0) {
  console.error(`❌ Missing header handles: ${missingHandles.join(', ')}`);
  console.error('   Run upload-menu-videos-v3.js first');
  process.exit(1);
}

createMenuCarouselTemplateV3();
