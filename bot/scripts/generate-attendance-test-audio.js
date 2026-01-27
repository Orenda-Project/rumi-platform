#!/usr/bin/env node
/**
 * Generate Test Audio for Attendance E2E Tests
 * Uses ElevenLabs API to generate voice messages for Bugbuster scenarios
 *
 * Created: January 24, 2026
 * Bead: bd-075
 *
 * Usage:
 *   node scripts/generate-attendance-test-audio.js
 *
 * Output:
 *   - bugbuster/fixtures/attendance/voice-rollcall-en.ogg
 *   - bugbuster/fixtures/attendance/voice-rollcall-ur.ogg
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ElevenLabsService = require('../shared/services/elevenlabs.service');
const { logToFile } = require('../shared/utils/logger');

// Output directory
const FIXTURES_DIR = path.join(__dirname, '../bugbuster/fixtures/attendance');

// Test scripts
const TEST_SCRIPTS = {
  'voice-rollcall-en': {
    text: 'Zara present, Ahmed present, Fatima absent, Usman present, Ayesha absent.',
    language: 'en',
    description: 'English roll call with 3 present, 2 absent'
  },
  'voice-rollcall-ur': {
    text: 'زارا حاضر، احمد حاضر، فاطمہ غیر حاضر۔',
    language: 'ur',
    description: 'Urdu roll call with 2 present, 1 absent'
  },
  'voice-rollcall-mixed': {
    text: 'Zara hazir, Ahmed hazir, Fatima ghair hazir, Usman present, Ayesha absent.',
    language: 'en',
    description: 'Mixed Urdu/English roll call (code-switching)'
  },
  'voice-everyone-present': {
    text: 'Everyone is present today. Sab hazir hain.',
    language: 'en',
    description: 'Everyone present statement'
  },
  'voice-absent-only': {
    text: 'Ahmed and Fatima are absent today. Baqi sab present hain.',
    language: 'en',
    description: 'Only mentions absent students (common pattern)'
  }
};

async function generateAudioFile(name, script) {
  try {
    console.log(`\n📊 Generating: ${name}`);
    console.log(`   Language: ${script.language}`);
    console.log(`   Text: ${script.text.substring(0, 50)}...`);

    // Generate speech using ElevenLabs
    let audioBuffer;

    if (script.language === 'ur') {
      // Use OpenAI TTS for Urdu (ElevenLabs doesn't have native Urdu)
      audioBuffer = await ElevenLabsService.generateSpeechOpenAI(script.text, 'ur');
    } else {
      // Use ElevenLabs for English
      audioBuffer = await ElevenLabsService.generateSpeech(script.text);
    }

    // Save as MP3 (ElevenLabs returns MP3)
    const mp3Path = path.join(FIXTURES_DIR, `${name}.mp3`);
    fs.writeFileSync(mp3Path, audioBuffer);
    console.log(`   ✅ Saved: ${mp3Path} (${audioBuffer.length} bytes)`);

    return { success: true, path: mp3Path, size: audioBuffer.length };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Generate Attendance Test Audio (ElevenLabs)                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Create fixtures directory
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    console.log(`\n📁 Created directory: ${FIXTURES_DIR}`);
  }

  // Check API keys
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('\n❌ Error: ELEVENLABS_API_KEY not set in environment');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('\n❌ Error: OPENAI_API_KEY not set in environment');
    process.exit(1);
  }

  console.log('\n📝 Test scripts to generate:');
  Object.entries(TEST_SCRIPTS).forEach(([name, script]) => {
    console.log(`   - ${name}: ${script.description}`);
  });

  // Generate all audio files
  const results = [];
  for (const [name, script] of Object.entries(TEST_SCRIPTS)) {
    const result = await generateAudioFile(name, script);
    results.push({ name, ...result });

    // Rate limiting - wait between API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Generated: ${successful.length}/${results.length} files`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}`);
    failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
  }

  // Output total size
  const totalSize = successful.reduce((acc, r) => acc + (r.size || 0), 0);
  console.log(`📦 Total size: ${(totalSize / 1024).toFixed(1)} KB`);

  console.log('\n📋 Next steps:');
  console.log('   1. Upload fixtures to R2 bucket');
  console.log('   2. Set FIXTURES_URL in bugbuster environment');
  console.log('   3. Run: npm start -- --scenario ATT-HAPPY-VOICE-EN');

  // Create a corrupted audio file for error testing
  const corruptedPath = path.join(FIXTURES_DIR, 'corrupted-audio.mp3');
  fs.writeFileSync(corruptedPath, Buffer.from('not valid audio data'));
  console.log(`\n📝 Created corrupted test file: ${corruptedPath}`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
