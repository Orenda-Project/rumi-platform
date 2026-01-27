#!/usr/bin/env node

/**
 * Upload Feature Menu Videos to WhatsApp (Resumable Upload API)
 *
 * This script uploads the 3 feature intro videos using Meta's Resumable Upload API
 * to get header_handles needed for carousel TEMPLATE creation.
 *
 * IMPORTANT: Template creation requires Resumable Upload API handles (strings like "4:...")
 * NOT regular media IDs from the standard upload API.
 *
 * Usage:
 *   STAGING=true node scripts/templates/upload-menu-videos.js
 *
 * For production:
 *   node scripts/templates/upload-menu-videos.js
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Environment-specific config
const isStaging = process.env.STAGING === 'true';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_APP_ID = process.env.META_APP_ID || ''; // Your Meta app ID
const API_VERSION = 'v21.0';

// Feature videos to upload
const videos = [
  {
    name: 'Lesson Plan',
    key: 'lesson_plan',
    localPath: path.join(__dirname, '../../..', '06_Logs & Misc/Reports/Active/Onboarding Flow 18 Dec 2025/Feature_Videos/01_Lesson_Plan_Feature/v6/lesson_plan_feature_v6_2.5x.mp4')
  },
  {
    name: 'Coaching',
    key: 'coaching',
    localPath: path.join(__dirname, '../../..', '06_Logs & Misc/Reports/Active/Onboarding Flow 18 Dec 2025/Feature_Videos/02_Coaching_Feature/v3/coaching_feature_video.mp4')
  },
  {
    name: 'Reading Assessment',
    key: 'reading',
    localPath: path.join(__dirname, '../../..', '06_Logs & Misc/Reports/Active/Onboarding Flow 18 Dec 2025/Feature_Videos/03_Reading_Feature/v1/videos/reading_feature_video_2.5x.mp4')
  }
];

/**
 * Start a resumable upload session
 * Returns the upload session ID
 */
async function startUploadSession(fileSize, fileName) {
  const response = await axios.post(
    `https://graph.facebook.com/${API_VERSION}/${META_APP_ID}/uploads`,
    null,
    {
      params: {
        file_length: fileSize,
        file_type: 'video/mp4',
        file_name: fileName,
        access_token: WHATSAPP_TOKEN
      }
    }
  );
  return response.data.id; // Returns upload session ID
}

/**
 * Upload file to the session and get the handle
 * Returns the header_handle needed for template creation
 */
async function uploadToSession(sessionId, fileBuffer) {
  const response = await axios.post(
    `https://graph.facebook.com/${API_VERSION}/${sessionId}`,
    fileBuffer,
    {
      headers: {
        'Authorization': `OAuth ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'file_offset': 0
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );
  return response.data.h; // Returns the handle string (e.g., "4:...")
}

/**
 * Upload a video using Resumable Upload API to get header_handle
 */
async function uploadVideo(videoPath, videoName) {
  try {
    console.log(`\n📤 Uploading: ${videoName}...`);

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video not found: ${videoPath}`);
    }

    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;
    const fileName = path.basename(videoPath);
    console.log(`   Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Step 1: Start upload session
    console.log('   Starting upload session...');
    const sessionId = await startUploadSession(fileSize, fileName);
    console.log(`   Session ID: ${sessionId}`);

    // Step 2: Read file and upload
    console.log('   Uploading file...');
    const fileBuffer = fs.readFileSync(videoPath);
    const handle = await uploadToSession(sessionId, fileBuffer);

    console.log(`✅ ${videoName} uploaded successfully`);
    console.log(`   Header Handle: ${handle.substring(0, 50)}...`);

    return handle;
  } catch (error) {
    console.error(`❌ Failed to upload ${videoName}:`);
    if (error.response?.data) {
      console.error('   Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error:', error.message);
    }
    throw error;
  }
}

/**
 * Main upload function
 */
async function uploadAllVideos() {
  try {
    console.log('🎬 Feature Menu Video Upload Script (Resumable Upload API)\n');
    console.log('━'.repeat(60));
    console.log(`Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
    console.log(`Meta App ID: ${META_APP_ID}`);
    console.log('━'.repeat(60));

    const handles = {};

    for (const video of videos) {
      const handle = await uploadVideo(video.localPath, video.name);
      handles[video.key] = handle;

      // Wait 2 seconds between uploads (larger files)
      console.log('   Waiting 2s before next upload...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 All videos uploaded successfully!\n');
    console.log('📋 Header Handles for template creation:\n');

    console.log('const MENU_VIDEO_HANDLES = {');
    Object.entries(handles).forEach(([key, handle]) => {
      // Show truncated handle for display
      const displayHandle = handle.length > 60 ? handle.substring(0, 60) + '...' : handle;
      console.log(`  ${key}: '${displayHandle}',`);
    });
    console.log('};');

    console.log('\n💡 These handles will be used by create-menu-carousel.js');
    console.log('━'.repeat(60));

    // Save to file for reference (full handles)
    const outputPath = path.join(__dirname, 'menu-video-media-ids.json');
    fs.writeFileSync(outputPath, JSON.stringify(handles, null, 2));
    console.log(`\n📁 Saved to: ${outputPath}`);

    return handles;

  } catch (error) {
    console.error('\n❌ Upload process failed:', error.message);
    process.exit(1);
  }
}

// Check for required environment variables
if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure WHATSAPP_TOKEN and PHONE_NUMBER_ID are set in your .env file');
  console.error('\n   For staging, run with: STAGING=true node scripts/templates/upload-menu-videos.js');
  process.exit(1);
}

uploadAllVideos();
