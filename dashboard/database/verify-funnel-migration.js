require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMigration() {
  console.log('\n🔍 Verifying Funnel Analysis Migration...\n');

  const results = {
    tables: [],
    userColumns: null,
    success: true
  };

  // Check each funnel table
  const tables = ['website_visits', 'cta_clicks', 'chat_starts'];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ Table '${table}': NOT FOUND`);
        console.log(`   Error: ${error.message}\n`);
        results.tables.push({ table, exists: false, error: error.message });
        results.success = false;
      } else {
        console.log(`✅ Table '${table}': EXISTS (${count} rows)\n`);
        results.tables.push({ table, exists: true, count });
      }
    } catch (err) {
      console.log(`❌ Table '${table}': ERROR`);
      console.log(`   ${err.message}\n`);
      results.tables.push({ table, exists: false, error: err.message });
      results.success = false;
    }
  }

  // Check users table for new columns
  console.log('📋 Checking users table for new columns...\n');
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, phone_number, source, session_id, first_message_at, registered_at')
      .limit(1);

    if (error) {
      console.log(`❌ Users table: New columns NOT FOUND`);
      console.log(`   Error: ${error.message}\n`);
      results.userColumns = { exists: false, error: error.message };
      results.success = false;
    } else {
      console.log(`✅ Users table: New columns added successfully`);
      if (data && data.length > 0) {
        console.log(`   Sample row:`)
        console.log(`   - source: ${data[0].source || 'NULL'}`);
        console.log(`   - session_id: ${data[0].session_id || 'NULL'}`);
        console.log(`   - first_message_at: ${data[0].first_message_at || 'NULL'}`);
        console.log(`   - registered_at: ${data[0].registered_at || 'NULL'}\n`);
      }
      results.userColumns = { exists: true };
    }
  } catch (err) {
    console.log(`❌ Users table: ERROR`);
    console.log(`   ${err.message}\n`);
    results.userColumns = { exists: false, error: err.message };
    results.success = false;
  }

  // Summary
  console.log('═'.repeat(50));
  if (results.success) {
    console.log('✨ Migration verification PASSED');
    console.log('All funnel tracking tables are ready to use!\n');
  } else {
    console.log('❌ Migration verification FAILED');
    console.log('Some tables or columns are missing.\n');
    console.log('📝 To fix this:');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the SQL from: database/migrations/001_create_funnel_tables.sql\n');
  }

  return results;
}

// Run verification
verifyMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
