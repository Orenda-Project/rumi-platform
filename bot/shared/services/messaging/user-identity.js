/**
 * Where a person can be reached.
 *
 * users.phone_number is a channel identity only on WhatsApp. A person who
 * first reached Rumi on Matrix, Slack or Discord has NO phone number — their
 * identities are user_channels rows (channel, channel_user_id), one per
 * channel (see the schema note on user_channels). Replying to whoever just
 * wrote is easy (the inbound `from` is the address); observe and the portal
 * also have to reach people who did NOT just write: the coach, from a worker
 * job; the observed teacher, with their report; a coach, from a sweep; a
 * teacher who asked the portal for a password reset code. Those addresses are
 * resolved here, once, instead of every caller reading phone_number and
 * silently getting null (or a number no channel reaches) for everyone off
 * WhatsApp.
 *
 * The wire identity is what messaging/index.js routes on: a bare number for
 * WhatsApp, "<prefix>:<id>" for an additive channel. Matrix has two shapes —
 * "mtx:<digits>" for a phone-number username and "matrix:@user:server"
 * otherwise — and both are produced (and parsed) here.
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

// Wire prefix → user_channels.channel. Kept here (not read from the channel
// registry) so the shape is known even on a build whose registry predates a
// channel; an unknown prefix is taken to be the channel's own name.
const PREFIX_CHANNEL = { mtx: 'matrix', matrix: 'matrix', slack: 'slack', discord: 'discord' };

/** The routable address for one user_channels row. */
function wireIdentity(channel, channelUserId) {
  const id = String(channelUserId == null ? '' : channelUserId).trim();
  if (!id) return null;
  const ch = String(channel || '').toLowerCase();
  if (ch === 'whatsapp') return id;
  if (ch === 'matrix') return /^\d+$/.test(id) ? `mtx:${id}` : `matrix:${id}`;
  return `${ch}:${id}`;
}

/** "mtx:155…" → { channel: 'matrix', id: '155…' }; a bare number → whatsapp. */
function parseIdentity(identity) {
  const s = String(identity || '').trim();
  if (!s) return null;
  const cut = s.indexOf(':');
  if (cut < 0) return { channel: 'whatsapp', id: s.replace(/^\+/, '') };
  const prefix = s.slice(0, cut).toLowerCase();
  return { channel: PREFIX_CHANNEL[prefix] || prefix, id: s.slice(cut + 1) };
}

function newestFirst(a, b) {
  return String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''));
}

/**
 * @param {string[]} userIds
 * @returns {Promise<Map<string,string>>} userId → identity (users with none are absent)
 */
async function identitiesForUsers(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  try {
    // Where they last talked wins: someone on two channels is reached on the
    // one they use, not on a phone number merely because one is on file.
    const { data: links } = await supabase
      .from('user_channels')
      .select('user_id, channel, channel_user_id, last_message_at')
      .in('user_id', ids);
    for (const link of (links || []).slice().sort(newestFirst)) {
      if (out.has(link.user_id)) continue;
      const wire = wireIdentity(link.channel, link.channel_user_id);
      if (wire) out.set(link.user_id, wire);
    }
    // A WhatsApp-only row written before user_channels existed has no link: its
    // phone number is the address.
    const rest = ids.filter((id) => !out.has(id));
    if (rest.length) {
      const { data: users } = await supabase.from('users').select('id, phone_number').in('id', rest);
      for (const u of users || []) if (u.phone_number) out.set(u.id, u.phone_number);
    }
  } catch (err) {
    logToFile('⚠️ user-identity: lookup failed', { count: ids.length, error: err.message });
  }
  return out;
}

/** @returns {Promise<string|null>} where this user can be reached */
async function identityForUser(userId) {
  if (!userId) return null;
  return (await identitiesForUsers([userId])).get(userId) || null;
}

/** @returns {Promise<string|null>} the users.id behind an address, on any channel */
async function userIdForIdentity(identity) {
  const parsed = parseIdentity(identity);
  if (!parsed) return null;
  try {
    // A phone_number on file in exactly this shape (any channel may have
    // written one), and for WhatsApp the "+" variant too.
    const shapes = parsed.channel === 'whatsapp' ? [parsed.id, `+${parsed.id}`] : [String(identity).trim()];
    const { data } = await supabase.from('users').select('id').in('phone_number', shapes).limit(1);
    if (data && data[0]) return data[0].id;
    const { data: links } = await supabase.from('user_channels').select('user_id')
      .eq('channel', parsed.channel).eq('channel_user_id', parsed.id).limit(1);
    return links && links[0] ? links[0].user_id : null;
  } catch (err) {
    logToFile('⚠️ user-identity: reverse lookup failed', { error: err.message });
    return null;
  }
}

/**
 * The addresses a number typed by a coach could mean: the WhatsApp number
 * (with and without "+") and the Matrix phone-number account. No
 * country-specific rules — 7 to 15 digits, E.164's own bounds.
 */
function candidatesForTypedNumber(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return [];
  return [digits, `+${digits}`, `mtx:${digits}`];
}

module.exports = {
  wireIdentity, parseIdentity, identitiesForUsers, identityForUser, userIdForIdentity, candidatesForTypedNumber,
};
