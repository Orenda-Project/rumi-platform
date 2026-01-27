#!/usr/bin/env node
/**
 * Upload Feature Introduction Videos to R2
 * Run: node scripts/onboarding/upload-feature-videos.js
 *
 * Requires R2 credentials in environment:
 * - R2_ENDPOINT
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { uploadFeatureVideo, buildR2PublicUrl } = require('../../shared/storage/r2');

// Video paths - all 3 feature introduction videos
// Video paths - update these to point to your local video files
const FEATURE_VIDEOS = {
  lesson_plan: process.env.LESSON_PLAN_VIDEO_PATH || './videos/lesson_plan_feature.mp4',
  coaching: process.env.COACHING_VIDEO_PATH || './videos/coaching_feature.mp4',
  reading: process.env.READING_VIDEO_PATH || './videos/reading_feature.mp4'
};

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  UPLOADING FEATURE INTRODUCTION VIDEOS TO R2');
  console.log('='.repeat(60) + '\n');

  const results = { success: [], failed: [] };

  for (const [featureName, filePath] of Object.entries(FEATURE_VIDEOS)) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Uploading: ${featureName}`);
    console.log(`Source: ${path.basename(filePath)}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ File not found: ${filePath}`);
      results.failed.push(featureName);
      continue;
    }

    // Get file size
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  Size: ${sizeMB} MB`);

    try {
      const publicUrl = await uploadFeatureVideo(filePath, featureName);
      console.log(`  ✅ Uploaded successfully!`);
      console.log(`  URL: ${publicUrl}`);
      results.success.push({ featureName, url: publicUrl });
    } catch (error) {
      console.error(`  ❌ Upload failed: ${error.message}`);
      results.failed.push(featureName);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  UPLOAD COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nSuccess: ${results.success.length}/3`);

  if (results.success.length > 0) {
    console.log('\n📹 Uploaded Video URLs:');
    results.success.forEach(({ featureName, url }) => {
      console.log(`  ${featureName}: ${url}`);
    });

    // Output constants for use in code
    console.log('\n📋 Copy this to your code:\n');
    console.log('const FEATURE_VIDEO_URLS = {');
    results.success.forEach(({ featureName, url }) => {
      console.log(`  ${featureName}: '${url}',`);
    });
    console.log('};');
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.join(', ')}`);
  }

  console.log('\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
