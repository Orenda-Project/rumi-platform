/**
 * Register WhatsApp Conversational Commands with Meta API
 *
 * This script registers slash commands that appear when users type "/" in chat
 * Commands are discoverable by users and make interactions easier
 *
 * API Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers/conversational-components/
 *
 * Commands to register:
 * 1. /register - Unlock lesson plans & coaching in 30 seconds
 * 2. /menu - See everything I can help you with
 * 3. /portal - View all your lesson plans & reports online
 * 4. /reading test - Assess student reading fluency (NEW)
 */

require('dotenv').config();
const axios = require('axios');

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;
const API_VERSION = 'v21.0'; // Using latest version

// Define all commands
const COMMANDS = [
  {
    command_name: 'register',
    command_description: 'Unlock lesson plans & coaching in 30 seconds'
  },
  {
    command_name: 'menu',
    command_description: 'See everything I can help you with'
  },
  {
    command_name: 'portal',
    command_description: 'View all your lesson plans & reports online'
  },
  {
    command_name: 'reading test',
    command_description: 'Assess student reading fluency'
  },
  {
    command_name: 'language',
    command_description: 'Change your preferred language'
  },
  {
    command_name: 'video',
    command_description: 'Generate an animated educational video (1 per day)'
  }
];

// BUG-001 FIX: Ice breakers for Android users (slash menu doesn't work on all Android devices)
// Max 4 ice breakers, max 80 chars each, NO emojis
const ICE_BREAKERS = [
  "Show Menu - See all features I can help with",
  "Plan Lesson - Create PDF lesson plans instantly",
  "Create Video - Make animated educational videos",
  "Get Coaching - Classroom audio feedback & tips"
];

/**
 * Get current conversational automation configuration
 * @returns {Promise<object>} Current configuration
 */
async function getCurrentConfig() {
  try {
    console.log('📥 Fetching current conversational automation config...');

    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        },
        params: {
          fields: 'conversational_automation'
        }
      }
    );

    console.log('✅ Current configuration retrieved:');
    console.log(JSON.stringify(response.data, null, 2));

    return response.data.conversational_automation || {};
  } catch (error) {
    if (error.response?.status === 404 || !error.response?.data?.conversational_automation) {
      console.log('⚠️  No existing configuration found (this is okay for first-time setup)');
      return {};
    }
    console.error('❌ Error fetching current config:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Register commands with Meta API
 * @returns {Promise<boolean>} Success status
 */
async function registerCommands() {
  try {
    console.log('\n📤 Registering commands AND ice breakers with Meta API...');
    console.log(`Phone Number ID: ${PHONE_NUMBER_ID}`);
    console.log(`Commands to register: ${COMMANDS.length}`);
    console.log(`Ice breakers to register: ${ICE_BREAKERS.length}`);

    console.log('\nCommands:');
    COMMANDS.forEach((cmd, index) => {
      console.log(`  ${index + 1}. /${cmd.command_name} - ${cmd.command_description}`);
    });

    console.log('\nIce Breakers (appear automatically on new chat):');
    ICE_BREAKERS.forEach((ib, index) => {
      console.log(`  ${index + 1}. "${ib}" (${ib.length} chars)`);
    });

    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/conversational_automation`,
      {
        enable_welcome_message: true,
        commands: COMMANDS,
        prompts: ICE_BREAKERS  // BUG-001: Add ice breakers for Android
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Commands and ice breakers registered successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    return true;
  } catch (error) {
    console.error('\n❌ Error registering commands:');
    console.error('Status:', error.response?.status);
    console.error('Error Details:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

/**
 * Verify commands were registered correctly
 * @returns {Promise<void>}
 */
async function verifyCommands() {
  try {
    console.log('\n🔍 Verifying commands and ice breakers were registered...');

    const config = await getCurrentConfig();

    if (config.commands && config.commands.length > 0) {
      console.log(`✅ Found ${config.commands.length} registered commands:`);
      config.commands.forEach((cmd, index) => {
        console.log(`  ${index + 1}. /${cmd.command_name} - ${cmd.command_description}`);
      });
    } else {
      console.log('⚠️  No commands found in configuration (may take a few moments to update)');
    }

    if (config.prompts && config.prompts.length > 0) {
      console.log(`\n✅ Found ${config.prompts.length} registered ice breakers:`);
      config.prompts.forEach((prompt, index) => {
        console.log(`  ${index + 1}. "${prompt}"`);
      });
    } else {
      console.log('⚠️  No ice breakers found in configuration (may take a few moments to update)');
    }

    console.log(`\n✅ Welcome message enabled: ${config.enable_welcome_message || false}`);
  } catch (error) {
    console.error('❌ Error verifying commands:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 WhatsApp Conversational Commands Registration\n');
  console.log('='.repeat(60));

  // Validate environment variables
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.error('❌ Missing required environment variables:');
    console.error('  PHONE_NUMBER_ID:', PHONE_NUMBER_ID ? '✓' : '✗');
    console.error('  WHATSAPP_TOKEN:', ACCESS_TOKEN ? '✓' : '✗');
    process.exit(1);
  }

  try {
    // Step 1: Get current configuration
    await getCurrentConfig();

    // Step 2: Register commands
    await registerCommands();

    // Step 3: Verify registration
    await verifyCommands();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Command and ice breaker registration complete!');
    console.log('\nNext steps:');
    console.log('  1. Delete existing WhatsApp chat thread completely');
    console.log('  2. Start a NEW chat with your business number');
    console.log('  3. Ice breakers should appear automatically at bottom of chat');
    console.log('  4. On iPhone, typing "/" should show command popup');
    console.log('  5. Android: Ice breakers work even if "/" popup doesn\'t');
    console.log('  6. Changes may take a few minutes to propagate');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Command registration failed');
    console.error('See error details above');
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run script
main();
