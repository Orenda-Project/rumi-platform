'use strict';
/**
 * deadline-reminder.service — the opt-in list behind Cost Compass reminders.
 *
 * Deliberately the ONLY file in this feature that touches Supabase; the cost
 * maths and formatting stay pure in exam-cost.service.js. Table:
 * `deadline_reminder_optins` (phone, board_id, created_at).
 *
 * Opt-in is explicit and per board — a parent tracking Cambridge never gets
 * BISE dates. Opt-out ("stop reminders") clears every board for that phone in
 * one go, because a person who wants out wants out of all of it.
 *
 * Writes follow the cross-agent-safety rule: fetch → check in JS → plain
 * insert → check `error`, never a chained update+filter+select that can hide a
 * constraint rejection.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

const TABLE = 'deadline_reminder_optins';

/** Is this phone already opted in to this board? */
async function isOptedIn(phone, boardId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('phone, board_id')
    .eq('phone', phone)
    .eq('board_id', boardId);
  if (error) {
    logToFile('❌ deadline-reminder: opt-in lookup failed', { error: error.message, boardId });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Opt a phone in to one board's deadlines.
 * @returns {Promise<{ok:boolean, already?:boolean, error?:string}>}
 */
async function optIn(phone, boardId) {
  if (!phone || !boardId) return { ok: false, error: 'missing_phone_or_board' };

  if (await isOptedIn(phone, boardId)) return { ok: true, already: true };

  const { error } = await supabase.from(TABLE).insert({ phone, board_id: boardId });
  if (error) {
    logToFile('❌ deadline-reminder: opt-in insert failed', { error: error.message, boardId });
    return { ok: false, error: error.message };
  }
  return { ok: true, already: false };
}

/** Opt a phone out of every board. `boardId` narrows it to one. */
async function optOut(phone, boardId = null) {
  if (!phone) return { ok: false, error: 'missing_phone' };

  let query = supabase.from(TABLE).delete().eq('phone', phone);
  if (boardId) query = query.eq('board_id', boardId);

  const { error } = await query;
  if (error) {
    logToFile('❌ deadline-reminder: opt-out failed', { error: error.message, boardId });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Every phone opted in to `boardId`. */
async function listOptIns(boardId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('phone, board_id')
    .eq('board_id', boardId);
  if (error) {
    logToFile('❌ deadline-reminder: list failed', { error: error.message, boardId });
    return [];
  }
  return data || [];
}

/** The whole opt-in list, for the reminder run. */
async function listAllOptIns() {
  const { data, error } = await supabase.from(TABLE).select('phone, board_id');
  if (error) {
    logToFile('❌ deadline-reminder: list-all failed', { error: error.message });
    return [];
  }
  return data || [];
}

module.exports = { TABLE, isOptedIn, optIn, optOut, listOptIns, listAllOptIns };
