require('dotenv').config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Simulate a webhook payload from WhatsApp
function createWebhookPayload(fromNumber, messageText, messageId = 'test_msg_' + Date.now()) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test_entry_id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: process.env.PHONE_NUMBER || '+1 555 0100',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [
                {
                  profile: {
                    name: 'Test User',
                  },
                  wa_id: fromNumber,
                }
              ],
              messages: [
                {
                  from: fromNumber,
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: {
                    body: messageText,
                  },
                  type: 'text',
                }
              ],
            },
            field: 'messages',
          }
        ],
      }
    ],
  };
}

// Simulate sending webhook to local server
async function sendWebhookToLocalServer(webhookPayload, port = 3000) {
  try {
    console.log('\n📨 Simulating incoming WhatsApp message...\n');
    console.log('Webhook Payload:');
    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log('\n' + '='.repeat(60) + '\n');

    const response = await fetch(`http://localhost:${port}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();

    console.log(`📥 Server Response (${response.status}): ${responseText}\n`);

    if (response.ok) {
      console.log('✅ Webhook delivered successfully!');
      console.log('💡 Check your bot logs to see the AI response\n');
    } else {
      console.log('❌ Webhook delivery failed');
      console.log('💡 Make sure the bot server is running (npm start)\n');
    }
  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
    console.log('\n💡 Is your bot server running? Start it with: npm start\n');
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('\n🧪 WhatsApp Webhook Simulator');
    console.log('='.repeat(60));
    console.log('\nUsage: node simulate-webhook.js <from_number> <message> [port]');
    console.log('\nExample:');
    console.log('  node simulate-webhook.js 923001234567 "Hello bot!" 3000');
    console.log('\nThis will simulate a WhatsApp message from the given number');
    console.log('and send it to your local bot server for testing.');
    console.log('\n💡 Make sure your bot is running first: npm start\n');
    process.exit(1);
  }

  const fromNumber = args[0];
  const messageText = args[1];
  const port = args[2] || 3000;

  const webhookPayload = createWebhookPayload(fromNumber, messageText);
  await sendWebhookToLocalServer(webhookPayload, port);
}

main();
