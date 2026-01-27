#!/usr/bin/env node
/**
 * Setup WhatsApp Flow Encryption
 *
 * This script:
 * 1. Generates RSA-2048 key pair for flow encryption
 * 2. Registers the public key with Meta/WhatsApp
 * 3. Outputs the private key for Railway env vars
 *
 * Usage:
 *   node scripts/setup-flow-encryption.js [--production]
 *
 * Bead: bd-186
 * Created: January 25, 2026
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Determine environment
const isProduction = process.argv.includes('--production');

// Get credentials from environment
// NOTE: Use PHONE_NUMBER_ID, not WABA_ID - the encryption API requires phone number ID
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
  console.error('ERROR: Missing PHONE_NUMBER_ID or WHATSAPP_TOKEN in environment variables');
  process.exit(1);
}

console.log(`\n${'='.repeat(60)}`);
console.log('WHATSAPP FLOW ENCRYPTION SETUP');
console.log('='.repeat(60));
console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'STAGING'}`);
console.log(`Phone Number ID: ${PHONE_NUMBER_ID}`);
console.log('');

/**
 * Generate RSA-2048 key pair
 */
function generateKeyPair() {
  console.log('Generating RSA-2048 key pair...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  console.log('✅ Key pair generated');
  return { publicKey, privateKey };
}

/**
 * Register public key with Meta
 */
async function registerPublicKey(publicKey) {
  console.log('\nRegistering public key with Meta...');

  const url = `${BASE_URL}/${PHONE_NUMBER_ID}/whatsapp_business_encryption`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      business_public_key: publicKey,
    }),
  });

  const data = await response.json();

  if (data.error) {
    console.error('❌ Failed to register public key:', data.error.message);
    throw new Error(data.error.message);
  }

  console.log('✅ Public key registered with Meta');
  console.log('   Response:', JSON.stringify(data, null, 2));

  return data;
}

/**
 * Save keys to files
 */
function saveKeys(publicKey, privateKey) {
  const keysDir = path.join(__dirname, '../keys');

  // Create keys directory if it doesn't exist
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  const suffix = isProduction ? 'production' : 'staging';

  // Save public key
  const publicKeyPath = path.join(keysDir, `flow_public_${suffix}.pem`);
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log(`\n✅ Public key saved to: ${publicKeyPath}`);

  // Save private key
  const privateKeyPath = path.join(keysDir, `flow_private_${suffix}.pem`);
  fs.writeFileSync(privateKeyPath, privateKey);
  console.log(`✅ Private key saved to: ${privateKeyPath}`);

  return { publicKeyPath, privateKeyPath };
}

/**
 * Output Railway env var format
 */
function outputEnvVars(publicKey, privateKey) {
  console.log('\n' + '='.repeat(60));
  console.log('RAILWAY ENVIRONMENT VARIABLES');
  console.log('='.repeat(60));
  console.log('\nAdd these to Railway:');
  console.log('');

  // Private key needs newlines escaped for env var
  const escapedPrivateKey = privateKey.replace(/\n/g, '\\n');
  console.log(`FLOW_PRIVATE_KEY="${escapedPrivateKey}"`);
  console.log('');

  const escapedPublicKey = publicKey.replace(/\n/g, '\\n');
  console.log(`FLOW_PUBLIC_KEY="${escapedPublicKey}"`);
  console.log('');
  console.log('='.repeat(60));
}

/**
 * Main function
 */
async function main() {
  try {
    // Generate key pair
    const { publicKey, privateKey } = generateKeyPair();

    // Register public key with Meta
    await registerPublicKey(publicKey);

    // Save keys to files
    saveKeys(publicKey, privateKey);

    // Output env vars
    outputEnvVars(publicKey, privateKey);

    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Copy the FLOW_PRIVATE_KEY and FLOW_PUBLIC_KEY to Railway');
    console.log('2. Update the marking flow with endpoint_uri');
    console.log('3. Publish the marking flow');
    console.log('');
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
