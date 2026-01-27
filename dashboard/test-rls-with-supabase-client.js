/**
 * Test RLS using Supabase JavaScript client (how Express app actually works)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function test() {
  console.log('🧪 Testing RLS with Supabase Client...\n');

  try {
    // Create test partner
    const partnerEmail = `test-partner-${uuidv4()}@test.com`;
    const { data: partner, error: partnerError } = await supabase
      .from('dashboard_users')
      .insert({
        email: partnerEmail,
        username: `test_partner_${Date.now()}`,
        password_hash: '$2a$10$test',
        role: 'partner_admin',
        is_active: true
      })
      .select()
      .single();

    if (partnerError) throw partnerError;
    console.log('✅ Created partner:', partner.id);

    // Create scope for partner
    await supabase.from('access_scopes').insert({
      dashboard_user_id: partner.id,
      scope_type: 'country',
      scope_value: { country_codes: ['+94'] }
    });
    console.log('✅ Created +94 country scope');

    // Count total users
    const { count: totalCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    console.log(`\nTotal users in database: ${totalCount}`);

    // Now use RPC to set context and query
    console.log('\n📊 Testing with partner context...');

    // Set context
    const { error: rpcError } = await supabase.rpc('set_portal_user_context', {
      p_portal_user_id: partner.id
    });

    if (rpcError) {
      console.error('❌ RPC error:', rpcError);
    } else {
      console.log('✅ Context set to:', partner.id);
    }

    // Query users after setting context
    const { data: filteredUsers, count: filteredCount, error: queryError } = await supabase
      .from('users')
      .select('id, phone_number', { count: 'exact' })
      .limit(5);

    if (queryError) {
      console.error('❌ Query error:', queryError);
    } else {
      console.log(`\nUsers visible after setting context: ${filteredCount}`);
      console.log('Sample users:');
      filteredUsers.forEach(u => {
        console.log(`  - ${u.phone_number}`);
      });

      const expectedSriLankanCount = 381; // Approximately
      const passed = filteredCount >= 350 && filteredCount <= 400; // Roughly Sri Lankan users
      console.log(`\n${passed ? '✅ LIKELY PASS' : '❌ LIKELY FAIL'} - Expected ~${expectedSriLankanCount}, got ${filteredCount}`);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await supabase.from('dashboard_users').delete().eq('id', partner.id);
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

test();
