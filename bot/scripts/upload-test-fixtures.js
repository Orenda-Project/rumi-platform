#!/usr/bin/env node
/**
 * Upload Test Fixtures to R2
 * Uploads Bugbuster test audio files to R2 storage
 *
 * Created: January 24, 2026
 * Bead: bd-075
 *
 * Usage:
 *   node scripts/upload-test-fixtures.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadBuffer, buildR2PublicUrl } = require('../shared/storage/r2');

// Fixtures directory
const FIXTURES_DIR = path.join(__dirname, '../bugbuster/fixtures/attendance');

async function uploadFixtures() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Upload Test Fixtures to R2                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Check R2 credentials
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID) {
    console.error('\n❌ Error: R2 credentials not set in environment');
    console.error('   Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
    process.exit(1);
  }

  // List all files in fixtures directory
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.mp3'));
  console.log(`\n📁 Found ${files.length} fixture files to upload`);

  const results = [];
  for (const file of files) {
    const filePath = path.join(FIXTURES_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const key = `bugbuster/fixtures/attendance/${file}`;

    try {
      console.log(`\n📤 Uploading: ${file}`);
      const url = await uploadBuffer(buffer, key, 'audio/mpeg');
      results.push({ file, success: true, url });
      console.log(`   ✅ Uploaded: ${url}`);
    } catch (error) {
      results.push({ file, success: false, error: error.message });
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Uploaded: ${successful.length}/${results.length} files`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}`);
    failed.forEach(f => console.log(`   - ${f.file}: ${f.error}`));
  }

  // Output base URL for Bugbuster config
  const baseUrl = buildR2PublicUrl('bugbuster/fixtures/attendance');
  console.log(`\n📋 FIXTURES_URL for Bugbuster config:`);
  console.log(`   ${baseUrl}`);

  process.exit(failed.length > 0 ? 1 : 0);
}

uploadFixtures().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
