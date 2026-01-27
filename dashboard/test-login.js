/**
 * Test Login Credentials
 * Run this to verify your password hash works correctly
 */

const bcrypt = require('bcryptjs');

// The password you want to use
const testPassword = 'admin123';

// The hash from your Railway environment
const hashFromRailway = process.env.ADMIN_PASSWORD_HASH || '$2b$10$NZmPOSAhcI4LbNYQMP8jS.wBGvr.B3CxS3cYm5IWfTAcq8kL14ejG';

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
  console.log('Generating a fresh hash for "admin123"...');
  const newHash = bcrypt.hashSync(testPassword, 10);
  console.log('New hash:', newHash);
  console.log('\nUse this in Railway:');
  console.log(`ADMIN_PASSWORD_HASH=${newHash}`);
}
