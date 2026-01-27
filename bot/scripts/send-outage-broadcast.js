/**
 * Targeted Broadcast Script - Active Users Today
 * Sends outage notification to users who were active on 2025-12-11
 *
 * Usage: node scripts/send-outage-broadcast.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// WhatsApp API configuration
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

// The message in Rumi's brand voice (first person, English only)
const MESSAGE = `Hey there 👋

I had a brief hiccup earlier today and wasn't working quite right for a bit.

Everything's back to normal now - I'm here whenever you need me!

Thanks for your patience.

— Rumi`;

async function sendWhatsAppMessage(phoneNumber) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: MESSAGE },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send message');
  }

  return data;
}

async function getActiveUsersToday() {
  const today = '2025-12-11';

  // Step 1: Get all user_ids from today's sessions
  const { data: sessions, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('user_id')
    .gte('created_at', `${today} 00:00:00`)
    .lt('created_at', '2025-12-12 00:00:00');

  if (sessionError) throw sessionError;

  // Step 2: Get unique user IDs
  const userIds = [...new Set(sessions.map(s => s.user_id))];

  if (userIds.length === 0) {
    console.log('No active users found for today');
    return [];
  }

  // Step 3: Get user details
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, phone_number, first_name')
    .in('id', userIds)
    .not('phone_number', 'is', null);

  if (userError) throw userError;
  return users;
}

async function main() {
  console.log('🚀 Starting targeted outage broadcast...\n');
  console.log('📝 Message to send:');
  console.log('─'.repeat(50));
  console.log(MESSAGE);
  console.log('─'.repeat(50));
  console.log('');

  // Get active users from today
  const users = await getActiveUsersToday();

  console.log(`📊 Found ${users.length} users active today\n`);

  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (const user of users) {
    const displayName = user.first_name || 'Unknown';

    try {
      await sendWhatsAppMessage(user.phone_number);
      successCount++;
      console.log(`✅ Sent to ${displayName} (${user.phone_number})`);

      // Rate limiting: 80 messages per second is WhatsApp limit, but let's be safe
      await new Promise(resolve => setTimeout(resolve, 100)); // 10 per second

    } catch (error) {
      failCount++;
      failures.push({ user, error: error.message });
      console.log(`❌ Failed for ${displayName} (${user.phone_number}): ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 BROADCAST COMPLETE');
  console.log('═'.repeat(50));
  console.log(`✅ Successfully sent: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  if (failures.length > 0) {
    console.log('\n⚠️ Failed deliveries:');
    failures.forEach(f => {
      console.log(`   - ${f.user.first_name || 'Unknown'} (${f.user.phone_number}): ${f.error}`);
    });
  }
}

main().catch(console.error);
