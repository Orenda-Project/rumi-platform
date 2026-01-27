/**
 * Test Login Credentials
 * Run this to verify your password hash works correctly
 */

const bcrypt = require('bcryptjs');

// The password you want to test (pass as first argument or via env)
const testPassword = process.argv[2] || process.env.ADMIN_PASSWORD || 'admin123';

// The hash from your Railway environment (REQUIRED)
const hashFromRailway = process.env.ADMIN_PASSWORD_HASH;
if (!hashFromRailway) {
  console.error('❌ ADMIN_PASSWORD_HASH env var is required.');
  console.error('   Usage: ADMIN_PASSWORD_HASH=... node test-login.js [password]');
  process.exit(1);
}

console.log('🔐 Testing Login Credentials\n');
console.log('Password to test:', testPassword);
console.log('Hash from env:', hashFromRailway);
console.log('\n--- Test Results ---');

// Test the comparison
const isValid = bcrypt.compareSync(testPassword, hashFromRailway);

if (isValid) {
  console.log('✅ SUCCESS: Password matches hash!');
  console.log('   The credentials should work.\n');
} else {
  console.log('❌ FAILED: Password does NOT match hash!');
  console.log('   There is an issue with the password hash.\n');

  // Generate a new hash
  console.log(`Generating a fresh hash for "${testPassword}"...`);
  const newHash = bcrypt.hashSync(testPassword, 10);
  console.log('New hash:', newHash);
  console.log('\nUse this in Railway:');
  console.log(`ADMIN_PASSWORD_HASH=${newHash}`);
}
