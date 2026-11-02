/**
 * Supabase driver: the original supabase-js client (PostgREST over HTTPS)
 * with the service-role key.
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
