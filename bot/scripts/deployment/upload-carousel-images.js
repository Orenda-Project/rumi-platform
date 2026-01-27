#!/usr/bin/env node

/**
 * Script to upload carousel service images to WhatsApp
 * Usage: node scripts/upload-carousel-images.js
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

const images = [
  {
    name: 'Classroom Coaching',
    path: path.join(__dirname, '../marketing/Classroom coaching.jpeg')
  },
  {
    name: 'Lesson Plan',
    path: path.join(__dirname, '../marketing/lesson plan.jpeg')
  },
  {
    name: 'Media Library',
    path: path.join(__dirname, '../marketing/Media Library.jpeg')
  },
  {
    name: 'Other',
    path: path.join(__dirname, '../marketing/Other.jpeg')
  }
];

async function uploadImage(imagePath, imageName) {
  try {
    console.log(`\n📤 Uploading: ${imageName}...`);

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath), {
      contentType: 'image/jpeg',
      filename: path.basename(imagePath),
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'image/jpeg');

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders(),
        },
      }
    );

    const mediaId = response.data.id;
    console.log(`✅ ${imageName} uploaded successfully`);
    console.log(`   Media ID: ${mediaId}`);

    return mediaId;
  } catch (error) {
    console.error(`❌ Failed to upload ${imageName}:`, error.response?.data || error.message);
    throw error;
  }
}

async function uploadAllImages() {
  try {
    console.log('🚀 Starting carousel image upload process...\n');
    console.log('━'.repeat(60));

    const mediaIds = {};

    for (const image of images) {
      const mediaId = await uploadImage(image.path, image.name);
      mediaIds[image.name] = mediaId;

      // Wait 1 second between uploads
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 All images uploaded successfully!\n');
    console.log('📋 Media IDs for template creation:\n');

    Object.entries(mediaIds).forEach(([name, id]) => {
      console.log(`${name}: ${id}`);
    });

    console.log('\n💾 Saving to .env format:\n');
    console.log('CAROUSEL_COACHING_IMAGE_ID=' + mediaIds['Classroom Coaching']);
    console.log('CAROUSEL_LESSON_PLAN_IMAGE_ID=' + mediaIds['Lesson Plan']);
    console.log('CAROUSEL_MEDIA_LIBRARY_IMAGE_ID=' + mediaIds['Media Library']);
    console.log('CAROUSEL_OTHER_IMAGE_ID=' + mediaIds['Other']);

    console.log('\n' + '━'.repeat(60));

    return mediaIds;

  } catch (error) {
    console.error('\n❌ Upload process failed:', error.message);
    process.exit(1);
  }
}

// Check for required environment variables
if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure WHATSAPP_TOKEN and PHONE_NUMBER_ID are set in your .env file');
  process.exit(1);
}

uploadAllImages();
