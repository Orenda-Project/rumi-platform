/**
 * "Who did you observe?"
 *
 * An observation only records WHO was observed when the coach goes through the
 * visit picker. A coach who skips it — or has no roster yet — leaves the row
 * with no teacher, so the pending list can only show a date and the report has
 * nobody to go to.
 *
 * So when a capture comes in unbound we simply ask, straight after the
 * recording is received. Two hard constraints shaped this:
 *
 *   1. It must NEVER block or restart the capture. Re-recording 20-30 minutes
 *      of lesson is the worst thing this feature could ask of a coach. The
 *      prompt is fire-and-forget: analysis continues regardless, the observe
 *      state machine is untouched, and ignoring the question changes nothing.
 *   2. It must not invent a new place to keep identity. The answer is written
 *      as an observation_schedules row (status 'done') — the table already
 *      carries teacher/school and links to the session — and the session is
 *      re-owned to the teacher, exactly as if they had been picked beforehand.
 *
 * Candidate teachers are held in Redis under a key of this service's own, NOT
 * in observe state — sharing that key is how a stray tap could corrupt a
 * capture.
 */

// Requires are LAZY on purpose: config/supabase.js exits when its env is
// absent, so a top-level require would make the pure helpers below untestable.
const { t, observeLang } = require('./observe-strings');
const { logToFile } = require('../../utils/logger');

const WHO_PREFIX = 'observe_who_';
const TTL_SECONDS = 7200;          // matches the observe-state TTL
const MAX_TEACHER_ROWS = 9;        // +1 escape hatch = a 10-row list, the tightest channel cap
const TITLE_CAP = 24;
const DESC_CAP = 72;

const key = (userId) => `observe:who:${userId}`;
const clip = (s, n) => (s == null ? '' : String(s)).slice(0, n);

/** One row per roster teacher, plus "someone else" so the coach is never trapped. */
function buildWhoPayload(teachers, lang, sessionId) {
  const rows = (teachers || []).slice(0, MAX_TEACHER_ROWS).map((teacher, i) => ({
    id: `${WHO_PREFIX}${sessionId}_${i}`,
    title: clip(teacher.name, TITLE_CAP),
    description: clip(teacher.school_name || '', DESC_CAP),
  }));
  rows.push({
    id: `${WHO_PREFIX}${sessionId}_other`,
    title: clip(t(lang, 'who_other'), TITLE_CAP),
    description: clip(t(lang, 'who_other_desc'), DESC_CAP),
  });
  return {
    type: 'list',
    header: '',
    body: t(lang, 'who_body'),
    action: {
      button: clip(t(lang, 'who_button'), 20),
      sections: [{ title: clip(t(lang, 'who_section'), 24), rows }],
    },
  };
}

/** `observe_who_<sessionId>_<idx|other>` → parts, or null when not ours. */
function parseWhoId(listId) {
  if (!listId || typeof listId !== 'string' || !listId.startsWith(WHO_PREFIX)) return null;
  const rest = listId.slice(WHO_PREFIX.length);
  const cut = rest.lastIndexOf('_');
  if (cut <= 0) return null;
  const sessionId = rest.slice(0, cut);
  const tail = rest.slice(cut + 1);
  if (tail === 'other') return { sessionId, index: null, other: true };
  if (!/^\d+$/.test(tail)) return null;
  return { sessionId, index: parseInt(tail, 10), other: false };
}

/** The observation_schedules row recording a visit that already happened. */
function buildObservationRecord({ leaderUserId, sessionId, teacher, today }) {
  if (!leaderUserId) throw new Error('observe-who: leaderUserId required');
  if (!sessionId) throw new Error('observe-who: sessionId required');
  if (!teacher) throw new Error('observe-who: teacher required');
  return {
    leader_user_id: leaderUserId,
    session_id: sessionId,
    school_id: teacher.school_id || null,
    teacher_ext_id: teacher.teacher_ext_id,
    teacher_name: teacher.name || null,
    // school_ext_id is the schedule key; a school imported without an
    // external id is keyed on its own id instead.
    school_ext_id: teacher.school_ext_id || teacher.school_id,
    school_name: teacher.school_name || null,
    scheduled_for: today,
    status: 'done',
  };
}

/**
 * Ask, if there is anyone to offer. Fire-and-forget: every failure is
 * swallowed — not knowing the teacher's name is a far smaller problem than
 * disturbing a capture.
 */
async function maybeAskObservedTeacher(user, from, sessionId) {
  try {
    if (!user || !sessionId) return false;
    const Roster = require('./observe-roster.service');
    const WhatsAppService = require('../whatsapp.service');
    const redisService = require('../cache/railway-redis.service');
    const teachers = await Roster.listTeachers(user.id).catch(() => []);
    if (!teachers || !teachers.length) return false;   // nothing to offer — stay silent

    const shortlist = teachers.slice(0, MAX_TEACHER_ROWS);
    await redisService.setexWithCeiling(key(user.id), TTL_SECONDS, JSON.stringify({ sessionId, teachers: shortlist }));
    await WhatsAppService.sendInteractiveMessage(from, buildWhoPayload(shortlist, observeLang(user), sessionId));
    logToFile('🔭 observe-who: asked who was observed', { userId: user.id, sessionId, offered: shortlist.length });
    return true;
  } catch (err) {
    logToFile('⚠️ observe-who: ask failed (non-blocking)', { userId: user && user.id, sessionId, error: err.message });
    return false;
  }
}

/** A tap on one of our rows. Returns true when consumed. */
async function handleObservedTeacherPick(user, from, listId) {
  const parsed = parseWhoId(listId);
  if (!parsed || !user) return false;
  const supabase = require('../../config/supabase');
  const WhatsAppService = require('../whatsapp.service');
  const redisService = require('../cache/railway-redis.service');
  const lang = observeLang(user);

  if (parsed.other) {
    await WhatsAppService.sendMessage(from, t(lang, 'who_other_ack'));
    return true;
  }

  let stash = null;
  try {
    const raw = await redisService.get(key(user.id));
    stash = raw && typeof raw === 'object' ? raw : (raw ? JSON.parse(raw) : null);
  } catch (_) { stash = null; }

  const teacher = stash && stash.sessionId === parsed.sessionId && Array.isArray(stash.teachers)
    ? stash.teachers[parsed.index] : null;
  if (!teacher) {
    // Stale list (expired stash) — say so plainly rather than guessing a teacher.
    await WhatsAppService.sendMessage(from, t(lang, 'who_stale'));
    return true;
  }

  try {
    // Bind first, conditionally — the list lives 2 h, so a second tap can come
    // long after the first one bound the row (and a report went out). Only the
    // coach's own observation; only while it is still bare (owned by the
    // coach) or already bound to this same teacher (an idempotent re-tap); and
    // never once the report has gone. In the predicate, not just a read, so
    // two taps racing cannot both win.
    const owners = [user.id, teacher.user_id].filter(Boolean);
    const { data: bound, error: bindError } = await supabase.from('coaching_sessions')
      .update({ ...(teacher.user_id ? { user_id: teacher.user_id } : {}), updated_at: new Date().toISOString() })
      .eq('id', parsed.sessionId)
      .eq('observer_user_id', user.id)
      .in('user_id', owners)
      .is('analysis_data->teacher_delivery->>status', null)
      .select('id');
    if (bindError) throw new Error(bindError.message);
    if (!bound || !bound.length) {
      await WhatsAppService.sendMessage(from, t(lang, 'who_already_bound'));
      logToFile('🚫 observe-who: re-tap refused — already bound or reported', { userId: user.id, sessionId: parsed.sessionId });
      return true;
    }

    const today = new Date().toISOString().slice(0, 10);
    const record = buildObservationRecord({ leaderUserId: user.id, sessionId: parsed.sessionId, teacher, today });
    // One record per session: replace rather than accumulate if the coach re-answers.
    await supabase.from('observation_schedules').delete()
      .eq('session_id', parsed.sessionId).eq('leader_user_id', user.id).eq('status', 'done');
    // An object literal: the schema column check reads the first `{` after an
    // insert, which would otherwise be the ack's `{ name }` below.
    const { error } = await supabase.from('observation_schedules').insert({ ...record });
    if (error) throw new Error(error.message);
    await WhatsAppService.sendMessage(from, t(lang, 'who_ack', { name: record.teacher_name || '' }));
    logToFile('🔭 observe-who: observed teacher recorded', { userId: user.id, sessionId: parsed.sessionId });
    // The teacher is only known now, so only now can their plans be offered
    // (Section B). It never throws; the who-answer above already stands.
    await require('./observe-plan.service').maybeAskForPlan(user, from, parsed.sessionId);
  } catch (err) {
    logToFile('❌ observe-who: failed to record observed teacher', {
      userId: user.id, sessionId: parsed.sessionId, error: err.message,
    });
    await WhatsAppService.sendMessage(from, t(lang, 'who_stale'));
  }
  return true;
}

module.exports = {
  buildWhoPayload, parseWhoId, buildObservationRecord, maybeAskObservedTeacher, handleObservedTeacherPick, WHO_PREFIX,
};
