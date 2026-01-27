require('dotenv').config();
const supabase = require('../config/supabase');

async function verifyTables() {
  console.log('🔍 Verifying funnel tracking tables...\n');

  const tables = ['website_visits', 'cta_clicks', 'chat_starts'];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(`✅ ${table}: Table exists (${count} rows)`);
    }
  }

  console.log('\n✅ Verification complete!\n');
  process.exit(0);
}

verifyTables();
