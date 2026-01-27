require('dotenv').config();
const readline = require('readline');
const OpenAI = require('openai');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store conversation history
const conversationHistory = [
  {
    role: 'system',
    content: 'You are a helpful AI assistant chatting with users via WhatsApp. Be friendly, concise, and helpful. Keep your responses relatively short as they will be sent via WhatsApp messages.',
  },
];

// Function to send actual WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Function to get AI response
async function getAIResponse(userMessage) {
  try {
    // Add user message to history
    conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationHistory,
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;

    // Add AI response to history
    conversationHistory.push({
      role: 'assistant',
      content: aiResponse,
    });

    return { success: true, response: aiResponse };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      response: 'Sorry, I encountered an error processing your message.'
    };
  }
}

// Main interactive chat
async function startChat() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 WhatsApp AI Bot - Local Testing Mode');
  console.log('='.repeat(60));
  console.log('\nChoose a mode:');
  console.log('1. Console Chat (test AI responses locally)');
  console.log('2. Send to WhatsApp (test actual message sending)');
  console.log('\nType "exit" to quit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Select mode (1 or 2): ', async (mode) => {
    if (mode === '1') {
      // Console chat mode
      console.log('\n✅ Console Chat Mode - Testing AI responses locally');
      console.log('Type your messages and see AI responses in the console\n');

      const chatLoop = () => {
        rl.question('You: ', async (userInput) => {
          if (userInput.toLowerCase() === 'exit') {
            console.log('\n👋 Goodbye!\n');
            rl.close();
            return;
          }

          if (!userInput.trim()) {
            chatLoop();
            return;
          }

          // Get AI response
          console.log('\n🤔 Bot is thinking...\n');
          const result = await getAIResponse(userInput);

          if (result.success) {
            console.log(`Bot: ${result.response}\n`);
          } else {
            console.log(`❌ Error: ${result.error}\n`);
          }

          chatLoop();
        });
      };

      chatLoop();
    } else if (mode === '2') {
      // Send to WhatsApp mode
      console.log('\n✅ WhatsApp Sending Mode - Messages will be sent to real numbers');

      rl.question('\nEnter recipient phone number (with country code, no +): ', async (phoneNumber) => {
        if (!phoneNumber) {
          console.log('❌ Phone number is required');
          rl.close();
          return;
        }

        console.log(`\n📱 Chatting with ${phoneNumber}`);
        console.log('Messages will be sent via WhatsApp!\n');

        const whatsappChatLoop = () => {
          rl.question('You: ', async (userInput) => {
            if (userInput.toLowerCase() === 'exit') {
              console.log('\n👋 Goodbye!\n');
              rl.close();
              return;
            }

            if (!userInput.trim()) {
              whatsappChatLoop();
              return;
            }

            // Get AI response
            console.log('\n🤔 Bot is thinking...\n');
            const aiResult = await getAIResponse(userInput);

            if (aiResult.success) {
              console.log(`Bot response: ${aiResult.response}\n`);

              // Send to WhatsApp
              console.log('📤 Sending to WhatsApp...\n');
              const sendResult = await sendWhatsAppMessage(phoneNumber, aiResult.response);

              if (sendResult.success) {
                console.log('✅ Message sent successfully!\n');
              } else {
                console.log('❌ Failed to send to WhatsApp');
                console.log('Error:', JSON.stringify(sendResult.error, null, 2), '\n');
              }
            } else {
              console.log(`❌ AI Error: ${aiResult.error}\n`);
            }

            whatsappChatLoop();
          });
        };

        whatsappChatLoop();
      });
    } else {
      console.log('❌ Invalid mode selected');
      rl.close();
    }
  });
}

// Check if OpenAI key is set
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.log('\n⚠️  OpenAI API Key not set!');
  console.log('Please add your OpenAI API key to the .env file');
  console.log('Get one at: https://platform.openai.com/api-keys\n');
  process.exit(1);
}

startChat();
