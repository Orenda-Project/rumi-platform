/**
 * Sending the teacher their report.
 *
 * Flow: coach-the-coach feedback delivered → "Send report / Later" →
 * recipient resolved (the bound teacher, a roster pick, or typed name +
 * number) → the worker renders a PREVIEW (the scoreless hero report, the
 * kind plan note when Section B was assessed, and the companion note) back
 * to the coach → "Send now / Someone else / Cancel" →
 * delivery.
 *
 * Delivery is channel-aware, decided by the recipient IDENTITY
 * (observe-channel.isMetaRecipient): Matrix, Slack, Discord and a Baileys
 * WhatsApp have no send window, so the report goes straight out. A bare
 * number on a Meta deployment goes straight out while its 24-hour window is
 * open; outside it the approved invite template (OBSERVE_REPORT_TEMPLATE) is
 * sent and the report follows when the teacher taps it. Every outcome —
 * including the ones where nothing could be sent — is told to the coach.
 *
 * Review gate: OBSERVE_REVIEW_MODE=operator reroutes every delivery to
 * OBSERVE_REVIEW_NUMBER (a pilot check). There is no default number.
 *
 * Delivery state lives in analysis_data.teacher_delivery (merge-write, no
 * DDL): { teacher_name, teacher_phone, teacher_user_id, target, status,
 * preview_id, caption, plan_text, companion_text, report_kind,
 * report_key|report_path|report_text, sent_at, ... }. status: previewing →
 * awaiting_confirm → sent | awaiting_teacher_tap | operator_review |
 * send_failed | preview_failed | cancelled.
 *
 * Every preview has its own preview_id, and its "Send now / Someone else /
 * Cancel" buttons carry it (observe_send_confirm_<sessionId>.<previewId>).
 * Choosing a recipient starts a new preview id and clears the previous
 * package in the same write; "Someone else" and Cancel clear the id. So a
 * button from an older preview — or a queued job for one — can never send a
 * package rendered for one teacher to another, or send after a Cancel: the
 * tap is refused, and the worker re-checks the id before it sends anything.
 * Only the observer may press any of the buttons. The id is also the queue
 * job's identity, so a second preview or a retry is never dropped as a
 * duplicate of the first, while a double tap of one button still is.
 *
 * Every teacher-bound text passes the trust firewall
 * (observe-teacher-report) at preview AND again right before it is sent.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { t, observeLang } = require('./observe-strings');
const { isMetaRecipient, displayIdentity } = require('./observe-channel');
const { logToFile } = require('../../utils/logger');

// Requires of supabase / the facade / the state store are lazy so the pure
// helpers below load without a database (config/supabase exits without env).
const db = () => require('../../config/supabase');
const wa = () => require('../whatsapp.service');
const state = () => require('./observe-state.service');
const queue = () => require('../coaching/coaching-job-queue.service');

const BTN = {
  start: 'observe_send_start_',
  later: 'observe_send_later_',
  confirm: 'observe_send_confirm_',
  other: 'observe_send_other_',
  cancel: 'observe_send_cancel_',
};
const PICK_PREFIX = 'observe_pickt_';
// Session ids are UUIDs, so '.' never appears in one and can separate the
// preview id on a button. Button ids stay far below the 256-character cap.
const PREVIEW_ID_SEP = '.';
const PREVIEW_ID_RE = /^[0-9a-f]{6,32}$/;
const newPreviewId = () => crypto.randomBytes(6).toString('hex');
// What a preview writes, and what the sweeps record about an earlier send.
// Cleared whenever a new preview starts: a package rendered for one teacher
// can never be sent to another, and a re-sent report (say, after an invite the
// teacher never opened) is chased afresh rather than born given-up.
const PACKAGE_RESET = Object.freeze({
  report_kind: null, report_key: null, report_path: null, report_text: null, caption: null,
  plan_text: null, companion_text: null, notes: null, previewed_at: null, last_error: null, failed_at: null,
  template_sent_at: null, nudged_at: null, nudge_count: 0, gave_up_at: null, gave_up_reason: null,
  reminded_at: null, reminder_count: 0,
});
// The states a "Send now" may act on: the preview is showing, or the last
// send failed and the coach is retrying it.
const CONFIRMABLE = ['awaiting_confirm', 'send_failed'];
const TEMPLATE_PAYLOAD_PREFIX = 'observe_report_';

// The states in which a TYPED name + number is a valid answer. The pick list
// is an accelerator, not a gate — coaches type the details anyway.
const DETAILS_TEXT_STATES = ['awaiting_teacher_details', 'awaiting_teacher_pick'];

// A list holds 10 rows on the tightest channel: 9 teachers + "New teacher",
// or once paginated 8 + "More…" + "New teacher".
const PICK_LIST_CAP = 9;
const PICK_PAGE = 8;

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// ── Pure helpers ───────────────────────────────────────────────────────

/**
 * One free-text message → { name, phone } or null. The number is found
 * anywhere in the text; what remains is the name. No country rules: any
 * E.164-ish number of 7 to 15 digits, returned as bare digits. Both parts are
 * required — a bare number is not an identity.
 */
function parseTeacherDetails(text) {
  if (!text || typeof text !== 'string') return null;
  const re = /[+(\d][\d\s\-().]{5,}\d/g;
  let span = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 7) { span = m[0]; break; }
  }
  if (!span) return null;
  const phone = span.replace(/\D/g, '');
  if (phone.length > 15) return null;
  const name = text.replace(span, ' ').replace(/[,;\n]+/g, ' ').replace(/[()]/g, ' ')
    .replace(/\s{2,}/g, ' ').trim();
  if (!name || name.length < 2 || !/\p{L}/u.test(name)) return null;
  return { name, phone };
}

function parseSendButtonId(id) {
  if (!id || typeof id !== 'string') return null;
  for (const [action, prefix] of Object.entries(BTN)) {
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    const cut = rest.lastIndexOf(PREVIEW_ID_SEP);
    if (cut > 0 && PREVIEW_ID_RE.test(rest.slice(cut + 1))) {
      return { action, sessionId: rest.slice(0, cut), previewId: rest.slice(cut + 1) };
    }
    return { action, sessionId: rest, previewId: null };
  }
  return null;
}

/** Template quick-reply payload → session id, or null when not ours. */
function matchReportTapPayload(payload) {
  const p = typeof payload === 'string' ? payload.trim() : '';
  if (!p.startsWith(TEMPLATE_PAYLOAD_PREFIX)) return null;
  return p.slice(TEMPLATE_PAYLOAD_PREFIX.length).trim() || null;
}

function buildSendChoiceButtons(sessionId, lang) {
  return {
    body: t(lang, 'send_choice_body'),
    buttons: [
      { id: `${BTN.start}${sessionId}`, title: clip(t(lang, 'btn_send_report'), 20) },
      { id: `${BTN.later}${sessionId}`, title: clip(t(lang, 'btn_send_later'), 20) },
    ],
  };
}

/** The preview's buttons, bound to that preview by its id. */
function buildSendConfirmButtons(sessionId, lang, previewId) {
  const ref = previewId ? `${sessionId}${PREVIEW_ID_SEP}${previewId}` : sessionId;
  return {
    body: t(lang, 'send_confirm_body'),
    buttons: [
      { id: `${BTN.confirm}${ref}`, title: clip(t(lang, 'btn_send_now'), 20) },
      { id: `${BTN.other}${ref}`, title: clip(t(lang, 'btn_send_other'), 20) },
      { id: `${BTN.cancel}${ref}`, title: clip(t(lang, 'btn_send_cancel'), 20) },
    ],
  };
}

/** Row ids carry the GLOBAL index into the one snapshot the coach was shown. */
function buildTeacherPickPayload(teachers, lang, offset = 0) {
  const paginated = teachers.length > PICK_LIST_CAP;
  const page = paginated ? teachers.slice(offset, offset + PICK_PAGE) : teachers;
  const rows = page.map((tch, i) => ({
    id: `${PICK_PREFIX}${offset + i}`,
    title: clip(tch.name, 24),
    description: clip(tch.school_name || displayIdentity(tch.phone), 72),
  }));
  if (paginated && offset + PICK_PAGE < teachers.length) {
    rows.push({
      id: `${PICK_PREFIX}more_${offset + PICK_PAGE}`,
      title: clip(t(lang, 'pick_teacher_more'), 24),
      description: clip(`${offset + PICK_PAGE} / ${teachers.length}`, 72),
    });
  }
  rows.push({
    id: `${PICK_PREFIX}new`,
    title: clip(t(lang, 'pick_teacher_new'), 24),
    description: clip(t(lang, 'pick_teacher_new_desc'), 72),
  });
  return {
    type: 'list',
    header: '',
    body: t(lang, 'pick_teacher_body'),
    action: {
      button: clip(t(lang, 'pick_teacher_button'), 20),
      sections: [{ title: clip(t(lang, 'pick_teacher_section'), 24), rows }],
    },
  };
}

/** "Got it — {name} ({phone})…", with no gap left when the name is empty. */
function fillPreviewComing(lang, name, phone) {
  return t(lang, 'send_preview_coming', { name: String(name || '').trim(), phone: displayIdentity(phone) })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(—|-)\s+\(/, '$1 (');
}

function reportTemplateConfig() {
  return {
    name: (process.env.OBSERVE_REPORT_TEMPLATE || '').trim(),
    lang: (process.env.OBSERVE_REPORT_TEMPLATE_LANG || 'en').trim(),
  };
}

// ── DB helpers ─────────────────────────────────────────────────────────

/**
 * Read-merge-write analysis_data.teacher_delivery — never clobbers siblings.
 * With `ifPreviewId`, writes only while that preview is still the current one
 * and returns null (no write) once it has been superseded or cancelled.
 */
async function mergeTeacherDelivery(sessionId, patch, { ifPreviewId } = {}) {
  const supabase = db();
  const { data: row, error } = await supabase
    .from('coaching_sessions').select('analysis_data').eq('id', sessionId).single();
  if (error || !row) throw new Error(`teacher_delivery merge: load failed: ${error && error.message}`);
  const analysis = row.analysis_data || {};
  if (ifPreviewId !== undefined && ((analysis.teacher_delivery || {}).preview_id || null) !== (ifPreviewId || null)) {
    return null;
  }
  const merged = { ...analysis, teacher_delivery: { ...(analysis.teacher_delivery || {}), ...patch } };
  const { error: upErr } = await supabase
    .from('coaching_sessions').update({ analysis_data: merged }).eq('id', sessionId);
  if (upErr) throw new Error(`teacher_delivery merge: update failed: ${upErr.message}`);
  return merged;
}

async function _loadSession(sessionId) {
  const { data, error } = await db().from('coaching_sessions').select('*').eq('id', sessionId).single();
  if (error || !data) throw new Error(`observe send: session not found: ${error && error.message}`);
  return data;
}

/** The coach, from observer_user_id and nowhere else. */
async function _coachOf(session) {
  if (!session || !session.observer_user_id) return null;
  const { data } = await db().from('users')
    .select('id, name, phone_number, preferred_language').eq('id', session.observer_user_id).maybeSingle();
  if (!data) return null;
  // `identity` is where the coach is reached: their number on WhatsApp, their
  // channel address otherwise (see observe-identity).
  return { ...data, identity: await require('./observe-identity').identityForUser(data.id) };
}

const isBound = (session) => !!(session && session.user_id && session.user_id !== session.observer_user_id);

/**
 * A typed number → the channel identity of the user who owns it, in any
 * stored shape (bare digits, "+digits", "mtx:digits", "matrix:digits"), else
 * the bare digits themselves.
 */
async function resolveTeacherIdentity(digits) {
  const Identity = require('./observe-identity');
  const shapes = Identity.candidatesForTypedNumber(digits);
  if (!shapes.length) return { phone: null, userId: null };
  try {
    // Preference order: a WhatsApp number on file, then a channel account
    // (a Matrix phone-number username) — the person the coach most likely meant.
    for (const shape of shapes) {
      const userId = await Identity.userIdForIdentity(shape);
      if (userId) return { phone: (await Identity.identityForUser(userId)) || shape, userId };
    }
  } catch (err) {
    logToFile('⚠️ observe send: identity lookup failed — using the typed number', { error: err.message });
  }
  return { phone: shapes[0], userId: null };
}

// ── Coach side ─────────────────────────────────────────────────────────

/** Called by the debrief step once the coach-the-coach feedback is delivered. */
async function offerSendReport(coachUser, to, sessionId) {
  await wa().sendInteractiveButtons(to, buildSendChoiceButtons(sessionId, observeLang(coachUser)));
  logToFile('📤 observe send: offered', { sessionId, observerId: coachUser && coachUser.id });
  return true;
}

/**
 * Record the chosen recipient, arm the confirm state, queue the preview. A
 * new recipient is a new preview: a fresh preview id, and the previous
 * package cleared in the same write.
 */
async function _chooseRecipient(user, from, sessionId, recipient, target) {
  const lang = observeLang(user);
  const previewId = newPreviewId();
  try {
    await mergeTeacherDelivery(sessionId, {
      ...PACKAGE_RESET,
      teacher_name: recipient.name || '',
      teacher_phone: recipient.phone,
      teacher_user_id: recipient.userId || null,
      target,
      status: 'previewing',
      preview_id: previewId,
    });
    await state().setState(user.id, 'awaiting_send_confirm', { sessionId });
    await wa().sendMessage(from, fillPreviewComing(lang, recipient.name, recipient.phone));
    await queue().queueObserveTeacherReport(sessionId, { phase: 'preview', from, previewId, dedupNonce: previewId });
    logToFile('📤 observe send: recipient chosen', { sessionId, observerId: user.id, target });
  } catch (err) {
    logToFile('❌ observe send: recipient capture failed', { sessionId, error: err.message });
    await wa().sendMessage(from, t(lang, 'debrief_load_error'));
  }
}

async function _offerPickOrAsk(user, from, sessionId) {
  const lang = observeLang(user);
  const Roster = require('./observe-roster.service');
  const roster = await Roster.listTeachers(user.id).catch(() => []);
  const teachers = (roster || []).filter((r) => r.phone)
    .map((r) => ({ user_id: r.user_id, name: r.name, phone: r.phone, school_name: r.school_name || null }));
  if (!teachers.length) {
    await state().setState(user.id, 'awaiting_teacher_details', { sessionId });
    await wa().sendMessage(from, t(lang, 'send_ask_details'));
    return;
  }
  await state().setState(user.id, 'awaiting_teacher_pick', { sessionId, teachers });
  await wa().sendInteractiveMessage(from, buildTeacherPickPayload(teachers, lang));
}

const deliveryOf = (session) => (session && session.analysis_data && session.analysis_data.teacher_delivery) || {};

/** Already sent, with the reviewer, or the invite is out: say so, true when replied. */
async function _replyIfOnItsWay(delivery, lang, from) {
  if (delivery.status === 'sent') {
    await wa().sendMessage(from, t(lang, 'send_already_sent'));
    return true;
  }
  if (delivery.status === 'operator_review') {
    await wa().sendMessage(from, t(lang, 'send_operator_review_fo'));
    return true;
  }
  // An invite still in its life waits for the tap. One the untapped sweep gave
  // up on is the coach's to send again (send_gave_up_fo says so): not on its way.
  if (delivery.status === 'awaiting_teacher_tap' && !delivery.gave_up_at) {
    const day = delivery.template_sent_at ? String(delivery.template_sent_at).slice(0, 10) : '';
    await wa().sendMessage(from, t(lang, 'send_waiting_tap_info', { name: delivery.teacher_name || '', date: day }));
    return true;
  }
  return false;
}

/**
 * Load the session behind a preview button and check the tapper is its
 * observer — the same check startSendFlow makes. Replies and returns null
 * when the tap must do nothing.
 */
async function _ownedSession(sessionId, from, user, { open = true } = {}) {
  const lang = observeLang(user);
  let session;
  try {
    session = await _loadSession(sessionId);
  } catch (_) {
    await wa().sendMessage(from, t(lang, 'debrief_load_error'));
    return null;
  }
  if (!user || session.observer_user_id !== user.id) {
    logToFile('🚫 observe send: a send button from someone other than the observer — refused', { sessionId, userId: user && user.id });
    await wa().sendMessage(from, t(lang, 'send_not_yours'));
    return null;
  }
  if (open) {
    const { isTerminalStatus } = require('./observe-terminal');
    if (isTerminalStatus(session.status)) {
      await wa().sendMessage(from, t(lang, 'send_session_closed'));
      return null;
    }
    if (deliveryOf(session).status === 'sent') {
      await wa().sendMessage(from, t(lang, 'send_already_sent'));
      return null;
    }
  }
  return session;
}

/** "Send report" — resolve the recipient. */
async function startSendFlow(sessionId, from, user) {
  const lang = observeLang(user);
  let session;
  try {
    session = await _loadSession(sessionId);
  } catch (_) {
    await wa().sendMessage(from, t(lang, 'debrief_load_error'));
    return;
  }
  if (session.observer_user_id !== user.id) {
    await wa().sendMessage(from, t(lang, 'send_not_yours'));
    return;
  }
  const { isTerminalStatus } = require('./observe-terminal');
  if (isTerminalStatus(session.status)) {
    await wa().sendMessage(from, t(lang, 'send_session_closed'));
    return;
  }
  if (await _replyIfOnItsWay(deliveryOf(session), lang, from)) return;

  // The observation already knows whose lesson it was: go straight to the
  // preview with that teacher's own identity rather than asking — asking is
  // how reports reach the wrong person.
  if (isBound(session)) {
    const { data: teacher } = await db().from('users')
      .select('id, name, phone_number').eq('id', session.user_id).maybeSingle();
    const teacherIdentity = teacher && await require('./observe-identity').identityForUser(teacher.id);
    if (teacherIdentity) {
      await _chooseRecipient(user, from, sessionId,
        { name: teacher.name || '', phone: teacherIdentity, userId: teacher.id }, 'session_binding');
      return;
    }
  }
  await _offerPickOrAsk(user, from, sessionId);
}

/** A tap on the pick list. */
async function handleTeacherPick(user, from, listId) {
  const lang = observeLang(user);
  const st = await state().getState(user.id).catch(() => null);
  if (!st || st.state !== 'awaiting_teacher_pick') {
    await wa().sendMessage(from, t(lang, 'send_pick_stale'));
    return true;
  }
  const sessionId = st.sessionId;
  if (listId === `${PICK_PREFIX}new`) {
    await state().setState(user.id, 'awaiting_teacher_details', { sessionId });
    await wa().sendMessage(from, t(lang, 'send_ask_details'));
    return true;
  }
  if (listId.startsWith(`${PICK_PREFIX}more_`)) {
    const offset = parseInt(listId.slice(`${PICK_PREFIX}more_`.length), 10) || 0;
    await wa().sendInteractiveMessage(from, buildTeacherPickPayload(st.teachers || [], lang, offset));
    return true;
  }
  const idx = parseInt(listId.slice(PICK_PREFIX.length), 10);
  const picked = Array.isArray(st.teachers) && Number.isInteger(idx) ? st.teachers[idx] : null;
  if (!picked) {
    // Out of range or stale — re-ask rather than guess a recipient.
    await wa().sendMessage(from, t(lang, 'send_details_reask'));
    return true;
  }
  await _chooseRecipient(user, from, sessionId,
    { name: picked.name, phone: picked.phone, userId: picked.user_id || null }, 'roster_pick');
  return true;
}

/**
 * Text while awaiting_teacher_details (or while the pick list is showing).
 * The ORIGINAL-case text is expected — a teacher's name keeps its capitals.
 * Returns true when consumed.
 */
async function handleTeacherDetailsText(user, from, text, observeState) {
  if (!observeState || !DETAILS_TEXT_STATES.includes(observeState.state)) return false;
  const lang = observeLang(user);
  const parsed = parseTeacherDetails(text);
  if (!parsed) {
    await wa().sendMessage(from, t(lang, 'send_details_reask'));
    return true;   // consumed — stay in the state, never fall through to chat
  }
  const identity = await resolveTeacherIdentity(parsed.phone);
  await _chooseRecipient(user, from, observeState.sessionId,
    { name: parsed.name, phone: identity.phone, userId: identity.userId }, 'typed');
  return true;
}

/**
 * The deliver job's identity: the preview, plus the failure being retried.
 * A double tap in one state is the same job (the queue drops the second); a
 * retry after a failed send is a new one.
 */
function _deliverNonce(previewId, d) {
  const attempt = d.status === 'send_failed' ? String(d.failed_at || 'failed').replace(/[^A-Za-z0-9]/g, '') : '0';
  return `${previewId}-${attempt}`;
}

/** "Send now" — only for the preview the button belongs to, only from its observer. */
async function handleSendConfirm(sessionId, from, user, previewId = null) {
  const lang = observeLang(user);
  const session = await _ownedSession(sessionId, from, user);
  if (!session) return;
  const d = deliveryOf(session);
  if (!CONFIRMABLE.includes(d.status) || !previewId || previewId !== d.preview_id) {
    if (await _replyIfOnItsWay(d, lang, from)) return;
    logToFile('🚫 observe send: a stale "Send now" — refused', { sessionId, status: d.status || null });
    await wa().sendMessage(from, t(lang, 'send_confirm_stale'));
    return;
  }
  try {
    await queue().queueObserveTeacherReport(sessionId, {
      phase: 'deliver', from, previewId, dedupNonce: _deliverNonce(previewId, d),
    });
    await wa().sendMessage(from, t(lang, 'send_delivering'));
    await state().clearState(user.id);
  } catch (err) {
    logToFile('❌ observe send: confirm failed', { sessionId, error: err.message });
    await wa().sendMessage(from, t(lang, 'debrief_load_error'));
  }
}

/** Cancel — whichever preview it came from, the current one dies with it. */
async function handleSendCancel(sessionId, from, user) {
  if (!(await _ownedSession(sessionId, from, user))) return;
  await mergeTeacherDelivery(sessionId, { status: 'cancelled', preview_id: null }).catch(() => {});
  await state().clearState(user.id);
  await wa().sendMessage(from, t(observeLang(user), 'send_cancel_ack'));
}

/** "Someone else" — the current preview is dead before a new recipient is asked for. */
async function handleSendOther(sessionId, from, user) {
  const session = await _ownedSession(sessionId, from, user);
  if (!session) return;
  if (await _replyIfOnItsWay(deliveryOf(session), observeLang(user), from)) return;
  await mergeTeacherDelivery(sessionId, { preview_id: null });
  await _offerPickOrAsk(user, from, sessionId);
}

/** Every observe_send_* button. */
async function handleSendButton(user, from, buttonId) {
  const parsed = parseSendButtonId(buttonId);
  if (!parsed || !parsed.sessionId) return false;
  const { action, sessionId, previewId } = parsed;
  if (action === 'start') await startSendFlow(sessionId, from, user);
  else if (action === 'later') {
    if (await _ownedSession(sessionId, from, user, { open: false })) {
      await wa().sendMessage(from, t(observeLang(user), 'send_later_ack'));
    }
  } else if (action === 'confirm') await handleSendConfirm(sessionId, from, user, previewId);
  else if (action === 'other') await handleSendOther(sessionId, from, user);
  else if (action === 'cancel') await handleSendCancel(sessionId, from, user);
  return true;
}

/**
 * A teacher tapped the invite template's quick reply (Meta only). Only the
 * session id comes from the payload; the worker checks the tap came from the
 * number the report was meant for.
 */
async function handleReportTap(from, payload) {
  const sessionId = matchReportTapPayload(payload);
  if (!sessionId) return false;
  try {
    // Each tapping number is its own job: a tap from an unexpected number is
    // refused by the worker and must not swallow the real teacher's tap as a
    // duplicate. Hashed so a phone number never becomes part of a queue id.
    const dedupNonce = crypto.createHash('sha1').update(String(from || '')).digest('hex').slice(0, 16);
    await queue().queueObserveTeacherReport(sessionId, { phase: 'teacher_tap', from, dedupNonce });
  } catch (err) {
    logToFile('❌ observe send: could not queue the teacher tap', { sessionId, error: err.message });
  }
  return true;
}

// ── Worker side: preview → deliver → teacher_tap ───────────────────────

const MIN_DEBRIEF_CHARS_FOR_NOTES = 120;
const LANGUAGE_NAMES = { en: 'English' };

/** Teacher-facing debrief notes. Never blocks the report: every failure → null. */
async function _extractNotes(session, coachName, teacherLang, material) {
  const TR = require('./observe-teacher-report');
  const od = (session.analysis_data && session.analysis_data.observer_debrief) || {};
  const rubric = od.feedback && od.feedback.rubric;
  if (TR.isHarmfulDebrief(rubric)) {
    // Summarising a harmful conversation into warm fiction is worse than silence.
    logToFile('🔇 observe send: harmful debrief — no teacher notes', { sessionId: session.id });
    return null;
  }
  try {
    let notes = od.teacher_notes || null;
    if (!notes) {
      const transcript = od.transcript;
      if (!transcript || transcript.length < MIN_DEBRIEF_CHARS_FOR_NOTES) return null;
      const GPT5MiniService = require('../gpt5-mini.service');
      const { result } = await GPT5MiniService.completeJson(
        TR.buildDebriefNotesPrompt(transcript, { coachName }, LANGUAGE_NAMES[teacherLang] || teacherLang),
        { maxTokens: 2000, label: 'observeTeacherNotes' },
      );
      notes = result;
    }
    TR.validateDebriefNotes(notes, { material });
    return { discussed: notes.discussed, commitment: notes.commitment || null };
  } catch (err) {
    logToFile('⚠️ observe send: teacher notes dropped — the report goes without them', {
      sessionId: session.id, error: err.message, rules: err.violations && err.violations.map((v) => v.rule),
    });
    return null;
  }
}

const reportDir = () => path.join(require('../../utils/constants').TEMP_DIR, 'observe-reports');

// One file per preview: a superseded preview still rendering must never
// overwrite the image another preview's row points at.
const pngName = (sessionId, previewId) => `${sessionId}${previewId ? `-${previewId}` : ''}.png`;

async function _storePng(sessionId, png, previewId) {
  const r2 = require('../../storage/r2');
  if (r2.isR2Configured()) {
    return { report_key: await r2.uploadImageBuffer(png, `observe-reports/${pngName(sessionId, previewId)}`) };
  }
  // No bucket (a sandbox): keep it on local disk for the deliver step.
  fs.mkdirSync(reportDir(), { recursive: true });
  const file = path.join(reportDir(), pngName(sessionId, previewId));
  fs.writeFileSync(file, png);
  return { report_path: file };
}

async function _pngPath(sessionId, d) {
  if (d.report_path && fs.existsSync(d.report_path)) return d.report_path;
  if (d.report_key) {
    const { downloadFromR2 } = require('../../storage/r2');
    const buf = await downloadFromR2(d.report_key);
    fs.mkdirSync(reportDir(), { recursive: true });
    const file = path.join(reportDir(), pngName(sessionId, d.preview_id));
    fs.writeFileSync(file, buf);
    return file;
  }
  throw new Error('observe send: the report image is missing');
}

/** Render the teacher's package. Image when it can, text when it can't. */
async function _buildPackage(session, { teacherName, notes, teacherLang, material, previewId }) {
  const TR = require('./observe-teacher-report');
  const analysis = session.analysis_data || {};
  try {
    const { generateHeroReport } = require('../coaching/report-v2/hero-report.service');
    const { png } = await generateHeroReport(session, TR.teacherSafeAnalysis(analysis), {
      teacherName,
      commitmentAction: (notes && notes.commitment) || '',
      language: teacherLang,
      scoreless: true,
      beforeRender: (vm) => {
        const { narrative, dropped } = TR.scrubNarrative(vm.narrative, { material });
        vm.narrative = narrative;
        if (dropped.length) logToFile('🧱 observe send: report fields dropped by the firewall', { sessionId: session.id, dropped });
        TR.assertTeacherSafe(TR.viewModelTexts(vm), { material });
      },
    });
    return { report_kind: 'image', ...(await _storePng(session.id, png, previewId)) };
  } catch (err) {
    logToFile('⚠️ observe send: image report unavailable — sending the text report', {
      sessionId: session.id, error: err.message,
    });
    const text = TR.buildTextReport(analysis, { lang: teacherLang, material });
    return { report_kind: 'text', report_text: text };
  }
}

/** The firewall, once more, over exactly what is about to leave. */
function _assertPackageSafe(session, d) {
  const TR = require('./observe-teacher-report');
  TR.assertTeacherSafe([d.caption, d.report_text, d.plan_text, d.companion_text],
    { material: TR.coachOnlyMaterial(session.analysis_data || {}) });
}

/** Send the package to one destination. Every send is checked. */
async function _sendPackage(dest, session, d, { header } = {}) {
  const W = wa();
  if (header && (await W.sendMessage(dest, header)) === false) throw new Error('observe send: header send failed');
  if (d.report_kind === 'image') {
    const file = await _pngPath(session.id, d);
    if ((await W.sendImage(dest, file, d.caption || '')) === false) throw new Error('observe send: report image send failed');
  } else {
    const body = [d.caption, d.report_text].filter(Boolean).join('\n\n');
    if ((await W.sendMessage(dest, body)) === false) throw new Error('observe send: text report send failed');
  }
  if (d.plan_text && (await W.sendMessage(dest, d.plan_text)) === false) {
    throw new Error('observe send: plan note send failed');
  }
  if (d.companion_text && (await W.sendMessage(dest, d.companion_text)) === false) {
    throw new Error('observe send: companion send failed');
  }
}

async function _sendReportTemplate(d, coachName, sessionId) {
  const tpl = reportTemplateConfig();
  if (!tpl.name) return false;
  return wa().sendTemplate(d.teacher_phone, tpl.name, tpl.lang, [
    { type: 'body', parameters: [{ type: 'text', text: d.teacher_name || '' }, { type: 'text', text: coachName || '' }] },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `${TEMPLATE_PAYLOAD_PREFIX}${sessionId}` }] },
  ]);
}

/**
 * Record a failure and tell the coach — never a silent drop. With
 * `ifPreviewId`, a preview that has meanwhile been superseded or cancelled
 * records and says nothing (the newer preview owns the row).
 */
async function _fail(sessionId, coachTo, lang, reason, key = 'send_failed_fo', extra = {}, { ifPreviewId } = {}) {
  logToFile('❌ observe send: teacher delivery did not happen', { sessionId, reason, ...extra });
  const written = await mergeTeacherDelivery(sessionId, {
    status: key === 'send_preview_failed_fo' ? 'preview_failed' : 'send_failed',
    last_error: reason,
    failed_at: new Date().toISOString(),
  }, ifPreviewId === undefined ? {} : { ifPreviewId }).catch(() => undefined);
  if (written === null) return { status: 'noop', reason: 'stale_preview' };
  if (coachTo) await wa().sendMessage(coachTo, t(lang, key)).catch(() => {});
  return { status: 'failed', reason };
}

/** A preview job acts only while it is THE current preview. */
const isCurrentPreview = (delivery, payload) => delivery.status === 'previewing'
  && !!payload.previewId && payload.previewId === delivery.preview_id;

async function _preview(session, payload, ctx) {
  const TR = require('./observe-teacher-report');
  const { coachTo, coachName, lang, teacherLang, delivery } = ctx;
  const previewId = payload.previewId;
  const material = TR.coachOnlyMaterial(session.analysis_data || {});
  const notes = await _extractNotes(session, coachName, teacherLang, material);
  let companion = null;
  try {
    companion = TR.buildCompanionText(notes, { coachName, lang: teacherLang, material });
  } catch (err) {
    logToFile('⚠️ observe send: companion dropped by the firewall', { sessionId: session.id, error: err.message });
  }
  // Section B, the kind version: built from the coach's reviewed verdicts, null
  // unless the lesson was assessed against its plan. Like the companion it
  // never blocks the report — a note the firewall refuses is left out.
  let planText = null;
  try {
    const { buildPlanNote } = require('./observe-section-b');
    planText = buildPlanNote((session.analysis_data || {}).lp_fidelity, { lang: teacherLang, material });
  } catch (err) {
    logToFile('⚠️ observe send: plan note dropped by the firewall', { sessionId: session.id, error: err.message });
  }
  const caption = t(teacherLang, 'report_caption_teacher', { fo: coachName });
  const pkg = await _buildPackage(session, { teacherName: delivery.teacher_name, notes, teacherLang, material, previewId });
  const d = { ...delivery, caption, plan_text: planText, companion_text: companion, notes, ...pkg };
  _assertPackageSafe(session, d);

  // Rendering takes a while: the coach may have picked someone else or
  // cancelled meanwhile. Then this package is for nobody — write and show nothing.
  const written = await mergeTeacherDelivery(session.id, {
    status: 'awaiting_confirm', caption, plan_text: planText, companion_text: companion, notes, ...pkg, previewed_at: new Date().toISOString(),
  }, { ifPreviewId: previewId });
  if (!written) {
    if (pkg.report_path) fs.promises.unlink(pkg.report_path).catch(() => {});
    logToFile('⏭️ observe send: preview superseded while rendering — dropped', { sessionId: session.id });
    return { status: 'noop', reason: 'stale_preview' };
  }
  // The coach sees EXACTLY what the teacher would receive, then decides.
  await _sendPackage(coachTo, session, d);
  await wa().sendInteractiveButtons(coachTo, buildSendConfirmButtons(session.id, lang, previewId));
  logToFile('🔎 observe send: preview delivered to the coach', { sessionId: session.id, kind: pkg.report_kind });
  return { status: 'previewed', kind: pkg.report_kind };
}

async function _deliver(session, phase, payload, ctx) {
  const { coachTo, coachName, lang, delivery: d } = ctx;
  const sessionId = session.id;

  if (phase === 'teacher_tap') {
    if (d.status !== 'awaiting_teacher_tap') return { status: 'noop', reason: 'not_awaiting_tap' };
    if (payload.from !== d.teacher_phone) {
      logToFile('🚫 observe send: template tap from an unexpected number — refused', { sessionId });
      return { status: 'refused' };
    }
  } else {
    // "Send now" acts only on the preview the coach confirmed, while it is
    // still showing (or its send failed). Anything else — cancelled, a newer
    // preview for someone else, already with the reviewer, invite already
    // out, a redelivered job — sends nothing to anyone.
    if (!CONFIRMABLE.includes(d.status)) return { status: 'noop', reason: d.status || 'no_delivery' };
    if (!payload.previewId || payload.previewId !== d.preview_id) {
      logToFile('🚫 observe send: deliver job for a preview that is no longer current — dropped', { sessionId });
      return { status: 'noop', reason: 'stale_preview' };
    }
  }

  if (!d.teacher_phone || !d.report_kind) return _fail(sessionId, coachTo, lang, 'delivery_state_incomplete');
  try {
    _assertPackageSafe(session, d);
  } catch (err) {
    return _fail(sessionId, coachTo, lang, 'trust_firewall', 'send_failed_fo', { rules: err.violations && err.violations.map((v) => v.rule) });
  }

  // Review gate — read at call time.
  if (phase === 'deliver' && (process.env.OBSERVE_REVIEW_MODE || '').trim() === 'operator') {
    const reviewTo = (process.env.OBSERVE_REVIEW_NUMBER || '').trim();
    if (!reviewTo) return _fail(sessionId, coachTo, lang, 'review_number_missing');
    try {
      await _sendPackage(reviewTo, session, d, {
        header: t(lang, 'report_review_header', { name: d.teacher_name || '', phone: displayIdentity(d.teacher_phone), fo: coachName }),
      });
    } catch (err) {
      return _fail(sessionId, coachTo, lang, err.message);
    }
    await mergeTeacherDelivery(sessionId, { status: 'operator_review', review_sent_at: new Date().toISOString() });
    await wa().sendMessage(coachTo, t(lang, 'send_operator_review_fo'));
    return { status: 'operator_review' };
  }

  // Meta only: outside the 24-hour window a report cannot be sent directly.
  // A tap has just opened the window, so it skips the check.
  if (phase === 'deliver' && isMetaRecipient(d.teacher_phone)) {
    const QuizDeliveryService = require('../quiz/quiz-delivery.service');
    const open = await QuizDeliveryService._hasOpenMessageWindow(d.teacher_phone).catch(() => false);
    if (!open) {
      if (!reportTemplateConfig().name) {
        return _fail(sessionId, coachTo, lang, 'window_closed_no_template', 'send_window_closed_fo');
      }
      const ok = await _sendReportTemplate(d, coachName, sessionId).catch(() => false);
      if (!ok) return _fail(sessionId, coachTo, lang, 'template_failed');
      await mergeTeacherDelivery(sessionId, { status: 'awaiting_teacher_tap', template_sent_at: new Date().toISOString() });
      await wa().sendMessage(coachTo, t(lang, 'send_template_queued_fo'));
      return { status: 'awaiting_teacher_tap' };
    }
  }

  try {
    await _sendPackage(d.teacher_phone, session, d);
  } catch (err) {
    return _fail(sessionId, coachTo, lang, err.message);
  }
  const nowIso = new Date().toISOString();
  await mergeTeacherDelivery(sessionId, { status: 'sent', sent_at: nowIso, ...(phase === 'teacher_tap' ? { tapped_at: nowIso } : {}) });
  await wa().sendMessage(coachTo, phase === 'teacher_tap'
    ? t(lang, 'send_tapped_fo', { name: d.teacher_name || '' })
    : t(lang, 'send_done_fo'));
  logToFile('✅ observe send: report delivered to the teacher', { sessionId, phase });
  return { status: 'sent' };
}

/**
 * The worker job. payload.phase: 'preview' | 'deliver' | 'teacher_tap'.
 * Handles its own failures (the coach is told once) so the queue never
 * retries a half-sent package.
 */
async function processTeacherReport(sessionId, payload = {}) {
  const session = await _loadSession(sessionId);
  const { languageFor } = require('./observe-language');
  const coach = await _coachOf(session);
  const phase = payload.phase || 'preview';
  const coachTo = (phase !== 'teacher_tap' && payload.from) || (coach && coach.identity) || null;
  const coachName = (coach && coach.name) || '';
  const lang = await languageFor('coach', session);
  const teacherLang = await languageFor('teacher', session);
  const delivery = (session.analysis_data && session.analysis_data.teacher_delivery) || {};
  const ctx = { coachTo, coachName, lang, teacherLang, delivery };

  if (delivery.status === 'sent') return { status: 'noop', reason: 'already_sent' };

  if (phase === 'preview') {
    // A cancelled or superseded preview, or a redelivery of one that already
    // completed, must not message anyone.
    if (!isCurrentPreview(delivery, payload)) return { status: 'noop', reason: 'stale_preview' };
    try {
      return await _preview(session, payload, ctx);
    } catch (err) {
      return _fail(sessionId, coachTo, lang, err.message, 'send_preview_failed_fo', {}, { ifPreviewId: payload.previewId });
    }
  }
  if (phase === 'deliver' || phase === 'teacher_tap') return _deliver(session, phase, payload, ctx);
  throw new Error(`observe send: unknown phase ${phase}`);
}

// ── Sweep executors (the planners decide, these act) ───────────────────

async function processUntappedDelivery(sessionId, nowMs = Date.now()) {
  const { classifyUntappedDelivery } = require('./observe-untapped.service');
  const session = await _loadSession(sessionId);
  const d = (session.analysis_data && session.analysis_data.teacher_delivery) || {};
  const decision = classifyUntappedDelivery(d, nowMs);
  if (decision.action === 'skip') return decision;

  const iso = new Date(nowMs).toISOString();
  if (decision.action === 'expire') {
    await mergeTeacherDelivery(sessionId, { gave_up_at: iso, gave_up_reason: decision.reason });
    return decision;
  }
  const coach = await _coachOf(session);
  if (!coach || !coach.identity) return { action: 'skip', reason: 'coach_unresolved' };
  const { languageFor } = require('./observe-language');
  const lang = await languageFor('coach', session);
  const name = d.teacher_name || '';

  if (decision.action === 'nudge') {
    const ok = await _sendReportTemplate(d, coach.name || '', sessionId).catch(() => false);
    // Stamped either way: one nudge is the whole budget, even a failed one.
    await mergeTeacherDelivery(sessionId, { nudged_at: iso, nudge_count: Number(d.nudge_count || 0) + 1 });
    if (ok) await wa().sendMessage(coach.identity, t(lang, 'send_nudged_fo', { name })).catch(() => {});
    else logToFile('⚠️ observe send: untapped nudge template failed', { sessionId });
    return decision;
  }
  await mergeTeacherDelivery(sessionId, { gave_up_at: iso, gave_up_reason: decision.reason });
  await wa().sendMessage(coach.identity, t(lang, 'send_gave_up_fo', { name })).catch(() => {});
  return decision;
}

async function processUndeliveredDelivery(sessionId, nowMs = Date.now()) {
  const { classifyUndelivered, candidateFromSession } = require('./observe-undelivered.service');
  const session = await _loadSession(sessionId);
  const d = (session.analysis_data && session.analysis_data.teacher_delivery) || {};
  const decision = classifyUndelivered(candidateFromSession(session), nowMs);
  if (decision.action === 'skip') return decision;

  const iso = new Date(nowMs).toISOString();
  if (decision.action === 'expire') {
    await mergeTeacherDelivery(sessionId, { gave_up_at: iso, gave_up_reason: decision.reason });
    return decision;
  }
  // Resolve the recipient BEFORE writing: a reminder that cannot be delivered
  // leaves the row untouched for a later tick.
  const coach = await _coachOf(session);
  if (!coach || !coach.identity) return { action: 'skip', reason: 'coach_unresolved' };
  const patch = decision.action === 'remind'
    ? { reminded_at: iso, reminder_count: Number(d.reminder_count || 0) + 1 }
    : { gave_up_at: iso, gave_up_reason: decision.reason };
  await mergeTeacherDelivery(sessionId, patch);
  const { languageFor } = require('./observe-language');
  const lang = await languageFor('coach', session);
  const key = decision.action === 'remind' ? 'send_undelivered_reminder_fo' : 'send_undelivered_gave_up_fo';
  const name = d.teacher_name || t(lang, 'send_undelivered_unnamed_teacher');
  await wa().sendMessage(coach.identity, t(lang, key, { name })).catch(() => {});
  return decision;
}

module.exports = {
  BTN,
  PICK_PREFIX,
  TEMPLATE_PAYLOAD_PREFIX,
  DETAILS_TEXT_STATES,
  parseTeacherDetails,
  parseSendButtonId,
  matchReportTapPayload,
  buildSendChoiceButtons,
  buildSendConfirmButtons,
  buildTeacherPickPayload,
  fillPreviewComing,
  reportTemplateConfig,
  mergeTeacherDelivery,
  resolveTeacherIdentity,
  offerSendReport,
  startSendFlow,
  handleSendButton,
  handleTeacherPick,
  handleTeacherDetailsText,
  handleSendConfirm,
  handleSendCancel,
  handleSendOther,
  handleReportTap,
  processTeacherReport,
  processUntappedDelivery,
  processUndeliveredDelivery,
};
