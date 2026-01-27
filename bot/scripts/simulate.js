/**
 * CLI Simulator for Local Testing
 *
 * Simulates WhatsApp message flow without needing an actual WhatsApp connection.
 * Creates properly-structured webhook payloads from text input.
 *
 * Interactive mode: node bot/scripts/simulate.js
 * Programmatic: const { simulateMessage } = require('./simulate');
 */

const readline = require('readline');

const SIMULATOR_PHONE = '15550001234';
const SIMULATOR_NAME = 'Simulator User';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || 'simulator-phone-id';

/**
 * Create a WhatsApp webhook payload from a text message.
 */
function simulateMessage(text, options = {}) {
  const from = options.from || SIMULATOR_PHONE;
  const name = options.name || SIMULATOR_NAME;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'simulator-entry',
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
                  profile: { name },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id: `sim_${Date.now()}`,
                  timestamp,
                  text: { body: text },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

/**
 * Check if a message is a quit command.
 */
function isQuitCommand(text) {
  const cmd = text.trim().toLowerCase();
  return cmd === '/quit' || cmd === '/exit';
}

/**
 * Create an interactive simulator (for CLI use).
 */
function createSimulator(options = {}) {
  const rl = readline.createInterface({
    input: options.input || process.stdin,
    output: options.output || process.stdout,
    prompt: 'You: ',
  });

  return {
    rl,
    start() {
      console.log(`
╭─────────────────────────────────────────────╮
│  Rumi Local Simulator                       │
│  Type messages as if you were on WhatsApp   │
│  Type /quit to exit                         │
╰─────────────────────────────────────────────╯
`);
      rl.prompt();
      rl.on('line', (line) => {
        const text = line.trim();
        if (!text) {
          rl.prompt();
          return;
        }
        if (isQuitCommand(text)) {
          console.log('\nGoodbye!');
          rl.close();
          return;
        }
        const payload = simulateMessage(text);
        // In production, this would be POSTed to the webhook handler
        console.log(`[Simulated payload for: "${text}"]`);
        console.log(`Bot: [Connect to message handler to get response]\n`);
        rl.prompt();
      });
    },
  };
}

// Interactive mode when run directly
if (require.main === module) {
  const sim = createSimulator();
  sim.start();
}

module.exports = {
  simulateMessage,
  isQuitCommand,
  createSimulator,
};
