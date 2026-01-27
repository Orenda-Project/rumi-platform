#!/usr/bin/env node

/**
 * Upload Feature Menu Videos v3 (4 videos) to WhatsApp
 *
 * Uses Meta's Resumable Upload API to get header_handles for template creation.
 *
 * Videos (in carousel order):
 *   1. Lesson Plans
 *   2. Video Generation
 *   3. Classroom Coaching
 *   4. Reading Assessment
 *
 * Usage:
 *   STAGING=true node scripts/templates/upload-menu-videos-v3.js
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const isStaging = process.env.STAGING === 'true';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const META_APP_ID = isStaging
  ? process.env.META_APP_ID_STAGING || ''  // Staging Meta app ID
  : process.env.META_APP_ID || ''; // Your Meta app ID
const API_VERSION = 'v21.0';

// Video paths - all 4 feature videos
const videos = [
  {
    name: 'Lesson Plan',
    key: 'lesson_plan',
    localPath: path.join(__dirname, '../../..', '06_Logs & Misc/Reports/Active/Onboarding Flow 18 Dec 2025/Feature_Videos/01_Lesson_Plan_Feature/v6/lesson_plan_feature_v6_2.5x.mp4')
  },
  {
    name: 'Video Generation',
    key: 'video_generation',
    localPath: path.join(__dirname, '../../..', '06_Logs & Misc/Reports/Active/Onboarding Flow 18 Dec 2025/Feature_Videos/04_Video_Generation_Feature/v1/output/video_generation_feature.mp4')
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
  return response.data.id;
}

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
  return response.data.h;
}

async function uploadVideo(videoPath, videoName) {
  console.log(`\n📤 Uploading: ${videoName}...`);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const stats = fs.statSync(videoPath);
  const fileSize = stats.size;
  const fileName = path.basename(videoPath);
  console.log(`   Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  console.log('   Starting upload session...');
  const sessionId = await startUploadSession(fileSize, fileName);
  console.log(`   Session ID: ${sessionId}`);

  console.log('   Uploading file...');
  const fileBuffer = fs.readFileSync(videoPath);
  const handle = await uploadToSession(sessionId, fileBuffer);

  console.log(`✅ ${videoName} uploaded successfully`);
  console.log(`   Handle: ${handle.substring(0, 50)}...`);

  return handle;
}

async function uploadAllVideos() {
  try {
    console.log('🎬 Feature Menu Video Upload Script v3 (4 videos)\n');
    console.log('━'.repeat(60));
    console.log(`Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
    console.log(`Meta App ID: ${META_APP_ID}`);
    console.log('━'.repeat(60));

    const handles = {};

    for (const video of videos) {
      try {
        const handle = await uploadVideo(video.localPath, video.name);
        handles[video.key] = handle;
      } catch (error) {
        console.error(`❌ Failed to upload ${video.name}:`);
        if (error.response?.data) {
          console.error('   Error:', JSON.stringify(error.response.data, null, 2));
        } else {
          console.error('   Error:', error.message);
        }
        throw error;
      }

      console.log('   Waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 All 4 videos uploaded successfully!\n');

    // Save handles
    const outputPath = path.join(__dirname, 'menu-video-media-ids-v3.json');
    fs.writeFileSync(outputPath, JSON.stringify(handles, null, 2));
    console.log(`📁 Saved to: ${outputPath}`);

    console.log('\n📋 Header handles:');
    Object.entries(handles).forEach(([key, handle]) => {
      console.log(`   ${key}: ${handle.substring(0, 40)}...`);
    });

    console.log('\n💡 Next: Run create-menu-carousel-v3.js');
    console.log('━'.repeat(60));

    return handles;

  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  }
}

if (!WHATSAPP_TOKEN) {
  console.error('❌ Missing WHATSAPP_TOKEN');
  process.exit(1);
}

uploadAllVideos();
