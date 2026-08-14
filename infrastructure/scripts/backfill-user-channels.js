/**
 * Backfill script — one row per existing user in `user_channels`.
 *
 * Every `users` row created before this migration has a phone_number and no
 * user_channels row at all. This script gives each one a
 * {channel: 'whatsapp', channel_user_id: phone_number, is_primary: true} row,
 * so every existing user is immediately shaped for multi-homing (Slack,
 * Discord, ...) at zero behavior change — bot-helpers.js's
 * getOrCreateUserByChannel also lazily backfills any row this script misses
 * (e.g. a user created between a partial run and a re-run), so this script is
 * safe to re-run and is not the only place the backfill can happen.
 *
 * Uses raw fetch against Supabase's PostgREST endpoint (same convention as
 * infrastructure/scripts/test-connections.js) rather than
 * @supabase/supabase-js, which lives only in bot/'s dependencies and does not
 * reliably resolve from a script invoked at the repo root.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node infrastructure/scripts/backfill-user-channels.js
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {
  /* .env is optional — real env vars may already be set */
}

const PAGE_SIZE = 500;

function restHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** One page of users that have a phone_number but no user_channels row yet. */
async function fetchUnbackfilledPage(url, key, offset) {
  // PostgREST left-join-is-null idiom: user_channels is fetched embedded and
  // filtered to is.null on its id, meaning "no matching child row".
  const query =
    'select=id,phone_number,user_channels!left(id)' +
    '&phone_number=not.is.null' +
    '&user_channels.id=is.null' +
    `&limit=${PAGE_SIZE}&offset=${offset}&order=id.asc`;

  const response = await fetch(`${url}/rest/v1/users?${query}`, {
    headers: restHeaders(key),
  });
  if (!response.ok) {
    throw new Error(`Fetch users page failed: HTTP ${response.status} — ${await response.text()}`);
  }
  const rows = await response.json();
  // The embedded left-join returns user_channels: [] for a genuine "no child"
  // row (PostgREST quirk with !left + is.null on the child) — filter
  // defensively in case any row's fetch shape slips through.
  return rows.filter((r) => !r.user_channels || r.user_channels.length === 0);
}

async function insertUserChannelsBatch(url, key, rows) {
  if (rows.length === 0) return;
  const nowIso = new Date().toISOString();
  const payload = rows.map((r) => ({
    user_id: r.id,
    channel: 'whatsapp',
    channel_user_id: r.phone_number,
    is_primary: true,
    created_at: nowIso,
    last_message_at: nowIso,
  }));

  const response = await fetch(`${url}/rest/v1/user_channels`, {
    method: 'POST',
    headers: restHeaders(key, {
      // on_conflict + resolution=ignore-duplicates: safe to re-run — a row
      // already backfilled (by this script or by getOrCreateUserByChannel's
      // lazy path) is silently skipped rather than erroring on the UNIQUE
      // (channel, channel_user_id) constraint.
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Insert user_channels batch failed: HTTP ${response.status} — ${await response.text()}`);
  }
}

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  let offset = 0;
  let totalBackfilled = 0;

  // Re-querying from offset 0 each pass (rather than advancing offset) is
  // deliberate: once a page is backfilled, those rows drop out of the
  // "no user_channels row yet" filter, so the next fetch naturally surfaces
  // the next unbackfilled page at the same offset. This also makes an
  // interrupted run trivially resumable.
  for (;;) {
    const page = await fetchUnbackfilledPage(url, key, 0);
    if (page.length === 0) break;

    await insertUserChannelsBatch(url, key, page);
    totalBackfilled += page.length;
    console.log(`  backfilled ${totalBackfilled} users so far...`);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE; // defensive — not expected to be reached given the above
  }

  console.log(`✅ Backfill complete — ${totalBackfilled} user_channels row(s) created.`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error('❌ Backfill failed:', error.message);
    process.exit(1);
  });
}

module.exports = { run };
