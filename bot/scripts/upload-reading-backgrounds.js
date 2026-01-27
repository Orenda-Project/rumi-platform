/**
 * Upload reading passage backgrounds to R2
 * Run from: 02_Main Rumi Bot directory (needs .env)
 */

const envPath = '/Users/haroonyasin/Documents/Projects/Rumi 12 Dec 2025/02_Main Rumi Bot/.env';
require('dotenv').config({ path: envPath });
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const SOURCE_DIR = '/Users/haroonyasin/Documents/Projects/Rumi 12 Dec 2025/06_Logs & Misc/Reports/Active/Reading Bugs';

const LEVELS = ['letters', 'words', 'sentences', 'paragraph', 'story'];

async function uploadFile(localPath, r2Key) {
  const fileBuffer = fs.readFileSync(localPath);
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key,
    Body: fileBuffer,
    ContentType: 'image/png',
  });
  await r2Client.send(command);
  return r2Key;
}

async function main() {
  console.log('Uploading reading passage backgrounds to R2...\n');
  console.log('Endpoint: ' + process.env.R2_ENDPOINT);
  console.log('Bucket: ' + BUCKET_NAME);
  console.log('');

  const uploaded = [];

  for (const level of LEVELS) {
    const levelDir = path.join(SOURCE_DIR, level);
    if (!fs.existsSync(levelDir)) {
      console.log('Warning: Directory not found: ' + levelDir);
      continue;
    }

    const files = fs.readdirSync(levelDir).filter(f => f.endsWith('.png'));
    console.log('\n' + level.toUpperCase() + ' (' + files.length + ' files)');

    for (const file of files) {
      const localPath = path.join(levelDir, file);
      const r2Key = 'reading_backgrounds/' + level + '/' + file;

      try {
        await uploadFile(localPath, r2Key);
        console.log('   OK: ' + file + ' -> ' + r2Key);
        uploaded.push(r2Key);
      } catch (err) {
        console.log('   FAIL: ' + file + ': ' + err.message);
      }
    }
  }

  console.log('\n========================================');
  console.log('UPLOAD SUMMARY');
  console.log('========================================');
  console.log('Uploaded: ' + uploaded.length + ' files');
  console.log('\nR2 Public URL (for passage-backgrounds.json):');
  console.log(process.env.R2_PUBLIC_URL || process.env.R2_ENDPOINT);
}

main().catch(console.error);
