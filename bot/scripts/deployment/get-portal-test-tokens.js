/**
 * Generate Portal Test Invitation Tokens
 *
 * This script creates invitation tokens for test accounts so the frontend
 * developer can test the portal setup and login flows.
 *
 * Usage:
 *   node scripts/get-portal-test-tokens.js
 *
 * Output:
 *   - Invitation URLs for each test account
 *   - Expiry dates
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../shared/config/supabase');

const TEST_ACCOUNTS = [
  {
    phoneNumber: '923001234567',
    firstName: 'Ahmed',
    lastName: 'Khan',
    description: 'Primary test account with full sample data'
  },
  {
    phoneNumber: '923009876543',
    firstName: 'Fatima',
    lastName: 'Ali',
    description: 'Secondary test account with limited data (for empty state testing)'
  }
];

async function generateTestTokens() {
  console.log('\n' + '='.repeat(80));
  console.log('🔑 Generating Portal Test Invitation Tokens');
  console.log('='.repeat(80) + '\n');

  const results = [];

  for (const account of TEST_ACCOUNTS) {
    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id, first_name, last_name, portal_activated')
        .eq('phone_number', account.phoneNumber)
        .single();

      if (fetchError || !existingUser) {
        console.log(`⚠️  User not found: ${account.phoneNumber}`);
        console.log(`   Creating user account...\n`);

        // Create user if doesn't exist
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            phone_number: account.phoneNumber,
            first_name: account.firstName,
            last_name: account.lastName,
            preferred_language: 'en',
            registration_state: 'REGISTERED',
            registration_completed: true
          })
          .select()
          .single();

        if (createError) {
          console.error(`❌ Failed to create user: ${createError.message}\n`);
          continue;
        }

        console.log(`✅ User created: ${newUser.first_name} ${newUser.last_name}\n`);
      }

      // Generate token and expiry
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      // Update user with invitation token
      const { error: updateError } = await supabase
        .from('users')
        .update({
          portal_invite_token: token,
          portal_invite_expires_at: expiresAt.toISOString(),
          // Reset portal activation for testing (so they can go through setup again)
          portal_activated: false,
          portal_password_hash: null
        })
        .eq('phone_number', account.phoneNumber);

      if (updateError) {
        console.error(`❌ Failed to generate token: ${updateError.message}\n`);
        continue;
      }

      const setupUrl = `${process.env.PORTAL_URL || 'https://your-portal-domain.com'}/setup/${token}`;
      const localUrl = `http://localhost:5173/portal/setup/${token}`;

      results.push({
        name: `${account.firstName} ${account.lastName}`,
        phoneNumber: account.phoneNumber,
        description: account.description,
        token,
        setupUrl,
        localUrl,
        expiresAt
      });

      console.log(`✅ ${account.firstName} ${account.lastName} (${account.phoneNumber})`);
      console.log(`   ${account.description}`);
      console.log(`   Production: ${setupUrl}`);
      console.log(`   Local Dev:  ${localUrl}`);
      console.log(`   Expires:    ${expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      console.log('');

    } catch (error) {
      console.error(`❌ Error processing ${account.phoneNumber}:`, error.message);
      console.log('');
    }
  }

  // Summary for easy copy-paste
  console.log('='.repeat(80));
  console.log('📋 Quick Reference - Send This to Developer:');
  console.log('='.repeat(80) + '\n');

  console.log('**Test Account Credentials for Portal**\n');

  results.forEach((result, index) => {
    console.log(`**Account ${index + 1}: ${result.name}**`);
    console.log(`Phone: \`${result.phoneNumber}\``);
    console.log(`Setup URL (Local): \`${result.localUrl}\``);
    console.log(`Setup URL (Prod):  \`${result.setupUrl}\``);
    console.log(`Expires: ${result.expiresAt.toLocaleDateString()}`);
    console.log('');
    console.log(`Instructions:`);
    console.log(`1. Open the setup URL in your browser`);
    console.log(`2. Set a password (e.g., "TestPass123")`);
    console.log(`3. After setup, use phone + password to login`);
    console.log('');
  });

  console.log('='.repeat(80) + '\n');

  return results;
}

// Run the script
generateTestTokens()
  .then(() => {
    console.log('✅ All tokens generated successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
