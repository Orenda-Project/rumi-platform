/**
 * Supabase client singleton — also the bot's cold-boot env-gate.
 *
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are REQUIRED for any code path
 * that touches the DB (i.e. essentially all of them). When either is missing,
 * we exit with a structured, action-oriented message that points the
 * operator at `npm run doctor` for the full missing-vars matrix. Exit code
 * 78 (EX_CONFIG per sysexits.h) lets process supervisors and CI know this
 * was a configuration error, not a code crash.
 *
 * This file is the canonical entry-point check — most other env vars only
 * matter at runtime when their specific feature fires, but Supabase is
 * touched at the top of every handler and worker. Failing fast here means a
 * cloner who skipped reading SETUP.md gets a useful pointer at second one
 * instead of a 12-line node stack at line 9.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  const message = [
    '',
    '┌─ Rumi bot — boot aborted ──────────────────────────────────────────────',
    '│ Missing REQUIRED env var(s): ' + missing.join(', '),
    '│',
    '│ Next steps:',
    "│   1. If you haven't yet, copy the template:   cp .env.template .env",
    '│   2. Fill in the REQUIRED block (see SETUP.md §2 — Supabase).',
    '│   3. Confirm everything is set:               npm run doctor',
    '│',
    '│ `npm run doctor` prints a presence-checked matrix of every key the bot',
    '│ understands, with a `where to get it` link per missing key. It exits',
    '│ cleanly and shows exactly what still needs to be filled in.',
    '└────────────────────────────────────────────────────────────────────────',
    '',
  ].join('\n');

  process.stderr.write(message);
  process.exit(78); // sysexits.h EX_CONFIG — "configuration error"
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = supabase;
