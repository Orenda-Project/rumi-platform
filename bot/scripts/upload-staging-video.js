/**
 * Upload Registration Video to Staging WABA
 *
 * Run: node scripts/upload-staging-video.js
 *
 * This uploads the registration video to the staging WABA and outputs
 * the media ID to set in Railway staging environment.
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// WABA credentials from environment
require('dotenv').config();
const STAGING_PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const STAGING_WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

// Video path (pass as argument or set default)
const VIDEO_PATH = process.argv[2] || './registrationvideo.mp4';

async function uploadVideo() {
  console.log('=== Uploading Registration Video to Staging WABA ===\n');

  // Check video exists
  if (!fs.existsSync(VIDEO_PATH)) {
    console.error('ERROR: Video not found at:', VIDEO_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(VIDEO_PATH);
  console.log('Video file:', VIDEO_PATH);
  console.log('File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB\n');

  try {
    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(VIDEO_PATH));
    formData.append('type', 'video/mp4');
    formData.append('messaging_product', 'whatsapp');

    console.log('Uploading to WhatsApp Cloud API...\n');

    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${STAGING_PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${STAGING_WHATSAPP_TOKEN}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const mediaId = response.data.id;

    console.log('SUCCESS! Video uploaded to Staging WABA\n');
    console.log('='.repeat(60));
    console.log('\nMEDIA ID:', mediaId);
    console.log('\n='.repeat(60));
    console.log('\nNow set this in Railway staging environment:');
    console.log('\n  REGISTRATION_VIDEO_MEDIA_ID=' + mediaId);
    console.log('\nSteps:');
    console.log('1. Go to Railway Dashboard → your staging service');
    console.log('2. Click "Variables" tab');
    console.log('3. Add or update REGISTRATION_VIDEO_MEDIA_ID');
    console.log('4. Railway will auto-redeploy\n');

  } catch (error) {
    console.error('ERROR uploading video:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.error?.message || error.message);
    console.error('Details:', JSON.stringify(error.response?.data, null, 2));
    process.exit(1);
  }
}

uploadVideo();
