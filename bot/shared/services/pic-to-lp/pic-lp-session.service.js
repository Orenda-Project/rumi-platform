/**
 * pic_lp_sessions CRUD wrapper
 *
 * Thin layer over Supabase for the pic_lp_sessions table. Mirrors the shape
 * of the coaching-session service so anyone familiar with that flow can read
 * this without context switching.
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

const TABLE = 'pic_lp_sessions';
const ACTIVE_STATUSES = [
  'awaiting_intent',
  'collecting_pages',
  'awaiting_form_submit',
  'generating',
];

// Per-status TTL on pic_lp_sessions. Each step has a different real-world
// duration, so the TTL window matches user intent. The stale-session sweeper
// marks expired non-terminal rows `timed_out` (or `failed` for `generating` —
// an engineering-side issue, distinct from teacher drop-off).
//
// Tight TTLs surface abandoned forms quickly: once a form sits idle past its
// window, the teacher has usually moved on, so a long window just delays the
// "your previous request timed out" nudge. `generating` is short because a
// concise plan completes in ~90s and a detailed one in ~5 min — anything past
// ~10 min is a pipeline crash, not slow generation.
const TTL_MINUTES_BY_STATUS = {
  awaiting_intent: 10,        // user said something LP-ish, never replied
  collecting_pages: 30,       // active upload window; extends on each page
  awaiting_form_submit: 15,   // Flow form opened; surfaces abandoned forms fast
  generating: 10,             // past 10 min = crashed (Detailed = ~5 min)
};

const TERMINAL_STATUSES = ['cancelled', 'timed_out', 'failed', 'handed_off'];

function ttlExpiryIsoForStatus(status) {
  const minutes = TTL_MINUTES_BY_STATUS[status];
  if (!minutes) return null; // terminal status → no expiry
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Look up the most recent active session for a user, or null.
 */
async function getActiveSession(userId) {
  // Filter rows whose expires_at has passed. Pre-migration rows
  // (expires_at IS NULL) remain queryable for backwards compatibility;
  // any new write populates expires_at, so this filter is sufficient
  // going forward.
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .or(`expires_at.gt.${nowIso()},expires_at.is.null`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logToFile('⚠️ pic_lp_sessions getActiveSession failed', { error: error.message, userId });
    return null;
  }
  return data || null;
}

async function getById(id) {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) {
    logToFile('⚠️ pic_lp_sessions getById failed', { error: error.message, id });
    return null;
  }
  return data;
}

async function getByFlowToken(flowToken) {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('flow_token', flowToken).maybeSingle();
  if (error) {
    logToFile('⚠️ pic_lp_sessions getByFlowToken failed', { error: error.message });
    return null;
  }
  return data;
}

/**
 * Create a fresh session. Caller passes the first page already.
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.correlationId
 * @param {string} args.caption
 * @param {{url: string, mime: string, uploaded_at: string}} args.firstPage
 */
async function create({ userId, correlationId, caption, firstPage }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      status: 'awaiting_intent',
      pages: firstPage ? [firstPage] : [],
      caption: caption || null,
      correlation_id: correlationId,
      expires_at: ttlExpiryIsoForStatus('awaiting_intent'),
    })
    .select()
    .single();
  if (error) {
    logToFile('❌ pic_lp_sessions create failed', { error: error.message, userId });
    throw error;
  }
  return data;
}

async function appendPage(sessionId, page) {
  const session = await getById(sessionId);
  if (!session) return null;
  const pages = Array.isArray(session.pages) ? session.pages : [];
  pages.push(page);

  // Each page upload extends the active-upload window — teacher is engaging.
  const { data, error } = await supabase
    .from(TABLE)
    .update({ pages, expires_at: ttlExpiryIsoForStatus('collecting_pages') })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) {
    logToFile('❌ pic_lp_sessions appendPage failed', { error: error.message, sessionId });
    throw error;
  }
  return data;
}

async function updateStatus(sessionId, status, extras = {}) {
  // Maintain the expires_at invariant. Terminal statuses clear it
  // (the row is no longer trap-eligible). Non-terminal statuses set the
  // window from TTL_MINUTES_BY_STATUS. Caller can override via extras.expires_at.
  const update = { status, ...extras };
  if (!('expires_at' in extras)) {
    update.expires_at = TERMINAL_STATUSES.includes(status)
      ? null
      : ttlExpiryIsoForStatus(status);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) {
    logToFile('❌ pic_lp_sessions updateStatus failed', { error: error.message, sessionId, status });
    throw error;
  }
  return data;
}

async function updateDetected(sessionId, detected) {
  return updateStatus(sessionId, 'awaiting_form_submit', { detected });
}

async function attachFlowToken(sessionId, flowToken) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ flow_token: flowToken })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) {
    logToFile('❌ pic_lp_sessions attachFlowToken failed', { error: error.message, sessionId });
    throw error;
  }
  return data;
}

async function cancelActiveForUser(userId, reason = 'cancelled') {
  const validReasons = ['cancelled', 'timed_out', 'failed'];
  const status = validReasons.includes(reason) ? reason : 'cancelled';
  const { error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES);
  if (error) {
    logToFile('⚠️ pic_lp_sessions cancelActiveForUser failed', { error: error.message, userId });
  }
}

module.exports = {
  ACTIVE_STATUSES,
  TTL_MINUTES_BY_STATUS,
  TERMINAL_STATUSES,
  ttlExpiryIsoForStatus,
  getActiveSession,
  getById,
  getByFlowToken,
  create,
  appendPage,
  updateStatus,
  updateDetected,
  attachFlowToken,
  cancelActiveForUser,
};
