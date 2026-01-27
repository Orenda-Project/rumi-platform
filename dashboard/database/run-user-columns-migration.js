require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('\n🚀 Running User Funnel Columns Migration...\n');

  try {
    // Read migration SQL file
    const sqlPath = path.join(__dirname, 'migrations', '002_add_user_funnel_columns.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Migration SQL:');
    console.log('─'.repeat(50));
    console.log(sqlContent);
    console.log('─'.repeat(50));
    console.log();

    // Split by semicolons and filter out comments/empty lines
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^COMMENT ON/));

    console.log(`Found ${statements.length} ALTER TABLE statements to execute\n`);

    // Execute each statement using raw SQL via Supabase RPC
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'; // Add semicolon back

      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${statement.substring(0, 80)}...`);

      try {
        // Use .rpc to execute raw SQL
        // Note: This requires a stored function in Supabase
        // Alternative: Use direct ALTER TABLE via client
        const { data, error } = await supabase.rpc('exec', { query: statement });

        if (error) {
          // If RPC doesn't exist, try alternative approach
          console.log(`   ⚠️  RPC method not available, trying alternative...`);

          // For ALTER TABLE, we need to use the Supabase REST API directly
          // Let's just run them individually
          const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: statement })
          });

          if (!response.ok) {
            console.log(`   ⚠️  Alternative method also failed`);
            console.log(`   Skipping statement (may already exist)`);
            continue;
          }
        }

        console.log(`   ✅ Statement ${i + 1} executed\n`);
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        console.log(`   Continuing with next statement...\n`);
      }
    }

    console.log('\n📋 Manual migration required!');
    console.log('─'.repeat(50));
    console.log('\nSince Supabase client cannot execute DDL statements directly,');
    console.log('please run the migration manually:');
    console.log('\n1. Go to your Supabase Dashboard SQL Editor');
    console.log('2. Click "+ New Query"');
    console.log('3. Copy and paste the SQL from:');
    console.log('   database/migrations/002_add_user_funnel_columns.sql');
    console.log('4. Click "Run" (or press Cmd+Enter)');
    console.log('\n✨ Then verify with:');
    console.log('   node database/verify-funnel-migration.js\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
runMigration();
