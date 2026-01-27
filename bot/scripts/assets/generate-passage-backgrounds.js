/**
 * Generate and Upload Passage Background Images
 *
 * Creates child-friendly background patterns for reading passage images.
 * Uses DALL-E 3 to generate unique patterns per level, then uploads to R2.
 *
 * Run with: node scripts/assets/generate-passage-backgrounds.js
 *
 * Alternatively, you can manually:
 * 1. Generate images using Kie/Midjourney with prompts below
 * 2. Save to temp/backgrounds/
 * 3. Run this script with --upload-only flag
 */

require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Initialize clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Background configuration per level
// Each level gets 4-5 unique backgrounds that rotate randomly
const LEVEL_BACKGROUNDS = {
  letters: {
    count: 4,
    color: '#FFF9E6', // Warm cream
    theme: 'alphabet blocks, colorful letters, playful ABC patterns',
    promptStyle: 'cute cartoon style, soft pastel colors, kindergarten classroom vibe'
  },
  words: {
    count: 4,
    color: '#E6F7FF', // Light blue
    theme: 'open books, reading nook, library, cozy corner',
    promptStyle: 'gentle watercolor style, calm blue tones, inviting and peaceful'
  },
  sentences: {
    count: 4,
    color: '#F0FFF0', // Mint green
    theme: 'nature scene, garden, butterflies, sunshine',
    promptStyle: 'soft illustration style, mint and green tones, fresh and encouraging'
  },
  paragraph: {
    count: 4,
    color: '#FFF5F5', // Soft pink
    theme: 'village scene, Pakistani countryside, home, family',
    promptStyle: 'warm illustration style, pink and coral tones, homely and familiar'
  },
  story: {
    count: 4,
    color: '#FFF0F5', // Lavender
    theme: 'adventure, mountain, stars, magical journey',
    promptStyle: 'dreamy illustration style, purple and lavender tones, imaginative and inspiring'
  }
};

/**
 * Generate a background image using DALL-E 3
 */
async function generateBackgroundWithDALLE(level, index) {
  const config = LEVEL_BACKGROUNDS[level];

  const prompt = `Create a subtle, child-friendly background pattern for a reading passage image.

Theme: ${config.theme}
Style: ${config.promptStyle}

CRITICAL REQUIREMENTS:
1. VERY SUBTLE - the pattern should not distract from text overlay
2. Light colors only - no dark areas
3. Elements should be small and scattered, not prominent
4. NO text, NO letters, NO words in the image
5. Abstract/geometric patterns are good
6. Should work as a background with 85% white overlay on top
7. Resolution: 1080x1920 (mobile portrait)
8. The pattern should evoke the theme without being literal

This is image ${index + 1} of ${config.count} for the "${level}" level.
Make each variation unique but within the same theme.`;

  console.log(`🎨 Generating ${level} background ${index + 1}/${config.count}...`);

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1792',
      quality: 'standard',
      style: 'natural'
    });

    const imageUrl = response.data[0].url;
    console.log(`✅ Generated: ${level}_${index + 1}`);

    return imageUrl;
  } catch (error) {
    console.error(`❌ Failed to generate ${level}_${index + 1}:`, error.message);
    return null;
  }
}

/**
 * Download image from URL
 */
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // Delete failed file
      reject(err);
    });
  });
}

/**
 * Upload image to R2
 */
async function uploadToR2(filepath, level, index) {
  const key = `reading_backgrounds/${level}/${level}_bg_${index + 1}.png`;
  const fileBuffer = fs.readFileSync(filepath);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: 'image/png',
    Metadata: {
      level,
      index: String(index + 1),
      generatedAt: new Date().toISOString()
    }
  });

  await r2Client.send(command);

  console.log(`📤 Uploaded: ${key}`);
  return key;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const uploadOnly = args.includes('--upload-only');
  const singleLevel = args.find(arg => !arg.startsWith('--'));

  const tempDir = path.join(__dirname, '../../temp/backgrounds');

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log('🎨 Passage Background Generator');
  console.log('================================\n');

  const levels = singleLevel ? [singleLevel] : Object.keys(LEVEL_BACKGROUNDS);
  const results = { success: [], failed: [] };

  for (const level of levels) {
    if (!LEVEL_BACKGROUNDS[level]) {
      console.log(`⚠️ Unknown level: ${level}`);
      continue;
    }

    const config = LEVEL_BACKGROUNDS[level];
    console.log(`\n📚 Level: ${level} (${config.count} images)`);
    console.log(`   Theme: ${config.theme}`);

    for (let i = 0; i < config.count; i++) {
      const localPath = path.join(tempDir, `${level}_bg_${i + 1}.png`);

      try {
        // Skip generation if upload-only and file exists
        if (uploadOnly && fs.existsSync(localPath)) {
          console.log(`📁 Using existing: ${level}_bg_${i + 1}.png`);
        } else if (!uploadOnly) {
          // Generate with DALL-E
          const imageUrl = await generateBackgroundWithDALLE(level, i);

          if (imageUrl) {
            await downloadImage(imageUrl, localPath);
            console.log(`💾 Saved: ${localPath}`);
          } else {
            results.failed.push(`${level}_${i + 1}`);
            continue;
          }
        } else {
          console.log(`⚠️ File not found: ${localPath}`);
          results.failed.push(`${level}_${i + 1}`);
          continue;
        }

        // Upload to R2
        const key = await uploadToR2(localPath, level, i);
        results.success.push(key);

        // Rate limit for DALL-E (avoid hitting limits)
        if (!uploadOnly) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`❌ Error processing ${level}_${i + 1}:`, error.message);
        results.failed.push(`${level}_${i + 1}`);
      }
    }
  }

  // Summary
  console.log('\n================================');
  console.log('📊 SUMMARY');
  console.log('================================');
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);

  if (results.success.length > 0) {
    console.log('\n📁 R2 Keys:');
    results.success.forEach(key => console.log(`   - ${key}`));
  }

  if (results.failed.length > 0) {
    console.log('\n⚠️ Failed:');
    results.failed.forEach(f => console.log(`   - ${f}`));
  }

  // Generate manifest file for the service to use
  const manifest = {
    generatedAt: new Date().toISOString(),
    levels: {}
  };

  for (const level of Object.keys(LEVEL_BACKGROUNDS)) {
    manifest.levels[level] = [];
    const config = LEVEL_BACKGROUNDS[level];
    for (let i = 0; i < config.count; i++) {
      manifest.levels[level].push(`reading_backgrounds/${level}/${level}_bg_${i + 1}.png`);
    }
  }

  const manifestPath = path.join(__dirname, '../../shared/config/passage-backgrounds.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest saved: ${manifestPath}`);
}

// For testing without DALL-E, generate simple colored backgrounds
async function generatePlaceholderBackgrounds() {
  const { createCanvas } = require('canvas');

  const tempDir = path.join(__dirname, '../../temp/backgrounds');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log('🎨 Generating placeholder backgrounds (no DALL-E)...\n');

  for (const [level, config] of Object.entries(LEVEL_BACKGROUNDS)) {
    console.log(`📚 Level: ${level}`);

    for (let i = 0; i < config.count; i++) {
      const canvas = createCanvas(1080, 1920);
      const ctx = canvas.getContext('2d');

      // Fill with level color
      ctx.fillStyle = config.color;
      ctx.fillRect(0, 0, 1080, 1920);

      // Add subtle pattern (different for each variation)
      ctx.fillStyle = `rgba(0, 0, 0, 0.02)`;

      // Pattern based on index
      if (i === 0) {
        // Circles pattern
        for (let y = 0; y < 1920; y += 100) {
          for (let x = 0; x < 1080; x += 100) {
            ctx.beginPath();
            ctx.arc(x + 50, y + 50, 20, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (i === 1) {
        // Dots pattern
        for (let y = 0; y < 1920; y += 50) {
          for (let x = 0; x < 1080; x += 50) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (i === 2) {
        // Diagonal lines
        ctx.strokeStyle = `rgba(0, 0, 0, 0.03)`;
        ctx.lineWidth = 2;
        for (let y = -1920; y < 1920; y += 80) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(1080, y + 1080);
          ctx.stroke();
        }
      } else {
        // Wave pattern
        ctx.strokeStyle = `rgba(0, 0, 0, 0.03)`;
        ctx.lineWidth = 3;
        for (let y = 0; y < 1920; y += 120) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x < 1080; x += 10) {
            ctx.lineTo(x, y + Math.sin(x / 50) * 20);
          }
          ctx.stroke();
        }
      }

      const filepath = path.join(tempDir, `${level}_bg_${i + 1}.png`);
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(filepath, buffer);

      console.log(`   ✅ ${level}_bg_${i + 1}.png`);
    }
  }

  console.log('\n✅ Placeholder backgrounds generated!');
  console.log('   Run with --upload-only to upload to R2');
}

// Check command line args
if (process.argv.includes('--placeholders')) {
  generatePlaceholderBackgrounds().catch(console.error);
} else {
  main().catch(console.error);
}
