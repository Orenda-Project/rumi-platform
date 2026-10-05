/**
 * The guided debrief, and coach-the-coach.
 *
 * After the coach submits the form, they are offered "Debrief now / Later".
 * "Debrief now" builds a six-step conversation guide from the coach's OWN
 * edited analysis (v2) and arms awaiting_debrief_audio; the coach records the
 * real conversation with the teacher and sends it; the worker transcribes it
 * and coaches the COACH on how they coached (two wins + one try, never a
 * score, the harm gate enforced in code), then offers to send the teacher
 * their report.
 *
 * A session is debrief-able only after the form was submitted (status
 * 'observer_review_complete') — before that there is no v2 to build the guide
 * from. debrief_status: 'pending' → 'done'. Debrief artefacts live in
 * analysis_data.observer_debrief, always merge-written.
 *
 * Also the read side of the coach's worklist: listPendingDebriefs,
 * listUnsentReports and listUnfinished (the /observe menu builds the list).
 */

const WhatsAppService = require('../whatsapp.service');
const supabase = require('../../config/supabase');
const { observeStrings, observeLang } = require('./observe-strings');
const { isTerminalStatus } = require('./observe-terminal');
const { languageFor } = require('./observe-language');
const { logToFile } = require('../../utils/logger');
const ObserveState = require('./observe-state.service');
const GPT5MiniService = require('../gpt5-mini.service');
const {
  buildGuidePrompt,
  validateGuide,
  renderGuideMessage,
  buildFallbackGuide,
} = require('./observe-debrief-guide');

const BUTTON_NOW_PREFIX = 'observe_debrief_now_';
const BUTTON_LATER_PREFIX = 'observe_debrief_later_';
const LIST_ROW_PREFIX = 'observe_debrief_';
const LIST_NEW_ID = 'observe_new';
const MAX_PENDING_ROWS = 9; // + the new-observation row = 10, the interactive-list cap

// ── Ids ────────────────────────────────────────────────────────────────

/** Parse a button id. Returns {action:'now'|'later', sessionId} or null. */
function parseDebriefButtonId(buttonId) {
  if (!buttonId || typeof buttonId !== 'string') return null;
  if (buttonId.startsWith(BUTTON_NOW_PREFIX)) {
    return { action: 'now', sessionId: buttonId.slice(BUTTON_NOW_PREFIX.length) };
  }
  if (buttonId.startsWith(BUTTON_LATER_PREFIX)) {
    return { action: 'later', sessionId: buttonId.slice(BUTTON_LATER_PREFIX.length) };
  }
  return null;
}

/**
 * Parse a list row id. Returns {action:'debrief', sessionId} | {action:'new'} | null.
 * The button ids share the observe_debrief_ prefix — they are NOT list rows.
 */
function parseDebriefListReplyId(listId) {
  if (!listId || typeof listId !== 'string') return null;
  if (listId === LIST_NEW_ID) return { action: 'new' };
  if (parseDebriefButtonId(listId)) return null;
  if (listId.startsWith(LIST_ROW_PREFIX)) {
    return { action: 'debrief', sessionId: listId.slice(LIST_ROW_PREFIX.length) };
  }
  return null;
}

// ── The post-form choice ───────────────────────────────────────────────

/** Debrief now / later. Titles fit the 20-character button cap. */
function buildDebriefChoiceButtons(sessionId, S) {
  return {
    body: S.debrief_choice_body,
    buttons: [
      { id: `${BUTTON_NOW_PREFIX}${sessionId}`, title: String(S.btn_debrief_now).slice(0, 20) },
      { id: `${BUTTON_LATER_PREFIX}${sessionId}`, title: String(S.btn_debrief_later).slice(0, 20) },
    ],
  };
}

/** Called once the coach has submitted the form. */
async function offerDebriefChoice(coachUser, to, sessionId) {
  const S = observeStrings(observeLang(coachUser));
  return WhatsAppService.sendInteractiveButtons(to, buildDebriefChoiceButtons(sessionId, S));
}

/**
 * "Later" — acknowledge and leave debrief_status 'pending' so the session
 * resurfaces in the /observe list. A stale tap on a debrief already done gets
 * the already-done reply instead of a pointer to a row that no longer exists.
 */
async function handleDebriefLater(sessionId, from, user) {
  const S = observeStrings(observeLang(user));
  try {
    const { data: row } = await supabase
      .from('coaching_sessions')
      .select('debrief_status')
      .eq('id', sessionId)
      .maybeSingle();
    if (row && row.debrief_status && row.debrief_status !== 'pending') {
      await WhatsAppService.sendMessage(from, S.debrief_already_done);
      return;
    }
  } catch (_) { /* the staleness check is best-effort */ }
  logToFile('🗓 observe debrief deferred', { sessionId, userId: user && user.id });
  await WhatsAppService.sendMessage(from, S.debrief_later_ack);
}

// ── The worklist (read side) ───────────────────────────────────────────

/** Sessions awaiting a debrief for this coach, newest first. */
async function listPendingDebriefs(observerUserId, opts = {}) {
  const limit = opts.limit == null ? MAX_PENDING_ROWS : opts.limit;
  const offset = opts.offset || 0;
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('id, created_at, user_id, observer_user_id, analysis_data')
    .eq('observer_user_id', observerUserId)
    .eq('observation_type', 'leader_observation')
    .eq('debrief_status', 'pending')
    .eq('status', 'observer_review_complete')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`listPendingDebriefs failed: ${error.message}`);
  return _withObservedTeacher(data || []);
}

/**
 * Attach the observed teacher's name from the linked observation_schedules
 * row (stamped for a scheduled visit, or when the coach answered "who did you
 * observe?"). A failure only costs the name, never the list.
 */
async function _withObservedTeacher(rows) {
  if (!rows.length) return rows;
  let named = rows;
  try {
    const { data } = await supabase
      .from('observation_schedules')
      .select('session_id, teacher_name, school_name')
      .in('session_id', rows.map((r) => r.id));
    const bySession = new Map();
    for (const s of (data || [])) {
      if (s.session_id && !bySession.has(s.session_id)) bySession.set(s.session_id, s);
    }
    if (bySession.size) {
      named = rows.map((r) => {
        const s = bySession.get(r.id);
        return s ? { ...r, teacher_name: s.teacher_name, school_name: s.school_name } : r;
      });
    }
  } catch (_) {
    named = rows;
  }
  return _withUsersName(named);
}

/**
 * Second source for rows the schedule join missed: the bound teacher's own
 * users row. BOUND ONLY — on a bare capture user_id is the coach, and a row
 * must never be labelled with the coach's own name. Only a real name is used,
 * never a phone number (a list row is read out loud by some channels). One
 * batched read for the whole list; a failure costs the name, not the list.
 */
async function _withUsersName(rows) {
  const needed = [...new Set(rows
    .filter((r) => !r.teacher_name && r.user_id && r.user_id !== r.observer_user_id)
    .map((r) => r.user_id))];
  if (!needed.length) return rows;
  try {
    const { data } = await supabase.from('users').select('id, name').in('id', needed);
    if (!data || !data.length) return rows;
    const byId = new Map(data.map((u) => [u.id, u]));
    return rows.map((r) => {
      if (r.teacher_name || !byId.has(r.user_id)) return r;
      const name = String(byId.get(r.user_id).name || '').trim();
      if (!name || /^[+\d\s()-]+$/.test(name)) return r;
      return { ...r, teacher_name: name };
    });
  } catch (_) {
    return rows;
  }
}

/**
 * Debrief done, report not yet with the teacher — the durable re-entry point
 * for "Later" on the send offer. `includeAwaitingTap` also returns reports
 * waiting on the teacher's tap (annotated), for surfaces that show status.
 */
async function listUnsentReports(observerUserId, opts = {}) {
  const limit = opts.limit == null ? MAX_PENDING_ROWS : opts.limit;
  const offset = opts.offset || 0;
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('id, created_at, user_id, observer_user_id, analysis_data')
    .eq('observer_user_id', observerUserId)
    .eq('observation_type', 'leader_observation')
    .eq('debrief_status', 'done')
    .eq('status', 'observer_review_complete')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`listUnsentReports failed: ${error.message}`);
  const DONE = opts.includeAwaitingTap
    ? ['sent', 'operator_review']
    : ['sent', 'awaiting_teacher_tap', 'operator_review'];
  const dOf = (r) => (r.analysis_data && r.analysis_data.teacher_delivery) || {};
  // An invite the untapped sweep gave up on is back with the coach to send again.
  const givenUp = (d) => d.status === 'awaiting_teacher_tap' && !!d.gave_up_at;
  const open = (data || [])
    .filter((r) => !DONE.includes(dOf(r).status) || givenUp(dOf(r)))
    .map((r) => ({ ...r, delivery_status: dOf(r).status || null, template_sent_at: dOf(r).template_sent_at || null }));
  return _withObservedTeacher(open);
}

const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The live status line a send-report row carries. */
function sendReportRowMeta(sess) {
  const d = (sess && sess.analysis_data && sess.analysis_data.teacher_delivery) || {};
  const status = (sess && sess.delivery_status) || d.status || null;
  if (status === 'awaiting_teacher_tap' && d.gave_up_at) return 'invite not opened - send it again';
  if (status === 'awaiting_teacher_tap') {
    const ts = (sess && sess.template_sent_at) || d.template_sent_at;
    const when = ts ? new Date(ts) : null;
    const day = when && !Number.isNaN(when.getTime()) ? ` ${when.getUTCDate()} ${_MONTHS[when.getUTCMonth()]}` : '';
    return `invite sent${day} - waiting for the teacher's tap`;
  }
  if (status === 'send_failed') return 'send failed - tap to retry';
  return 'report not sent yet';
}

/**
 * Stage A of the worklist: observations not yet at the form. Everything here
 * is resumable (audio and transcript live on the row); `resume` says which
 * step a tap re-enters:
 *   form  → re-send the edit form (awaiting_observer_review)
 *   retry → re-queue the pipeline (failed, or silently stuck), bounded
 *   wait  → a fresh pipeline is still working — informational, no action
 */
const STAGE_A_STATUSES = ['confirmed', 'transcribing', 'transcription_complete', 'analyzing',
  'analysis_complete', 'awaiting_observer_review', 'failed'];
const STUCK_AFTER_MINUTES = 30;

function resumeKindFor(status, updatedAt, nowMs = Date.now()) {
  if (status === 'awaiting_observer_review') return 'form';
  if (status === 'failed') return 'retry';
  const ageMin = (nowMs - Date.parse(updatedAt || 0)) / 60000;
  return ageMin > STUCK_AFTER_MINUTES ? 'retry' : 'wait';   // a silent pipeline is stuck, not working
}

async function listUnfinished(observerUserId, opts = {}) {
  const limit = opts.limit == null ? MAX_PENDING_ROWS : opts.limit;
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('id, status, created_at, updated_at, user_id, observer_user_id, analysis_data')
    .eq('observer_user_id', observerUserId)
    .eq('observation_type', 'leader_observation')
    .eq('debrief_status', 'pending')
    .in('status', STAGE_A_STATUSES)
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  if (error) throw new Error(`listUnfinished failed: ${error.message}`);
  const rows = await _withObservedTeacher(data || []);
  return rows.map((r) => ({ ...r, resume: resumeKindFor(r.status, r.updated_at || r.created_at) }));
}

/** Total debriefs + unsent reports waiting for this coach. */
async function countPending(observerUserId) {
  const [p, u] = await Promise.all([
    listPendingDebriefs(observerUserId, { limit: 1000 }).catch(() => []),
    listUnsentReports(observerUserId, { limit: 1000 }).catch(() => []),
  ]);
  return p.length + u.length;
}

// ── State helpers ──────────────────────────────────────────────────────

/**
 * After a form submission: clear the coach's capture/form state — but NEVER a
 * live awaiting_debrief_audio armed for a DIFFERENT session (the coach may be
 * mid-debrief for observation A when form B lands; wiping the state would
 * misroute the debrief recording).
 */
async function clearStateAfterSubmit(observerId, submittedSessionId) {
  const state = await ObserveState.getState(observerId);
  if (state && state.state === 'awaiting_debrief_audio' && state.sessionId && state.sessionId !== submittedSessionId) {
    logToFile('🔭 observe: form submitted while mid-debrief for another session — state left armed', {
      submittedSessionId, debriefSessionId: state.sessionId,
    });
    return false;
  }
  await ObserveState.clearState(observerId);
  return true;
}

/**
 * Arm awaiting_debrief_audio — but never over a live debrief armed for a
 * DIFFERENT session. Used by the worker's background re-arms, which must never
 * override a newer debrief the coach started.
 */
async function armDebriefAudio(observerId, sessionId, guideSnapshot) {
  const state = await ObserveState.getState(observerId);
  if (state && state.state === 'awaiting_debrief_audio' && state.sessionId && state.sessionId !== sessionId) {
    logToFile('🔭 observe: refused to arm debrief audio over a live debrief for another session', {
      wantSession: sessionId, liveSession: state.sessionId,
    });
    return false;
  }
  await ObserveState.setState(observerId, 'awaiting_debrief_audio', { sessionId, guide_snapshot: guideSnapshot || null });
  return true;
}

// ── Debrief now: the guide ─────────────────────────────────────────────

/**
 * Build the six-step guide from the coach's OWN edited analysis (v2), send it
 * as ONE message + the recording instruction, and arm awaiting_debrief_audio.
 *
 * One LLM attempt → programmatic gates (validateGuide) → the deterministic
 * fallback on ANY failure. The coach standing next to the teacher always gets
 * a guide.
 */
async function startDebrief(sessionId, from, user) {
  const lang = observeLang(user);
  const S = observeStrings(lang);

  const { data: session, error } = await supabase
    .from('coaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !session) {
    logToFile('❌ observe debrief: session load failed', { sessionId, error: error && error.message });
    await WhatsAppService.sendMessage(from, S.debrief_load_error);
    return;
  }
  if (session.observer_user_id !== user.id) {
    logToFile('🚫 observe debrief: observer mismatch', { sessionId, requester: user.id });
    await WhatsAppService.sendMessage(from, S.debrief_not_yours);
    return;
  }
  if (isTerminalStatus(session.status)) {
    logToFile('🚫 observe debrief: refused — the observation is over', { sessionId, status: session.status });
    await WhatsAppService.sendMessage(from, S.debrief_cancelled);
    return;
  }
  if (session.debrief_status && session.debrief_status !== 'pending') {
    await WhatsAppService.sendMessage(from, S.debrief_already_done);
    return;
  }

  // Double tap: still armed for THIS session → re-send the stored guide (so a
  // silently failed first send is repaired) and the nudge, without another
  // LLM call. TTL expiry clears the state, so a genuine later re-arm rebuilds.
  const existing = await ObserveState.getState(user.id);
  if (existing && existing.state === 'awaiting_debrief_audio' && existing.sessionId === sessionId) {
    if (existing.guide_snapshot) {
      await WhatsAppService.sendMessage(from, renderGuideMessage(existing.guide_snapshot, S));
    }
    await WhatsAppService.sendMessage(from, S.debrief_record_instruction);
    logToFile('🔭 observe debrief: already armed for this session — re-sent guide + nudge', { sessionId });
    return;
  }

  const v2 = session.analysis_data || {};
  let guide;
  try {
    const { result } = await GPT5MiniService.completeJson(buildGuidePrompt(v2, { language: lang }), {
      maxTokens: 4000, label: 'observeDebriefGuide',
    });
    validateGuide(result, S, lang);
    guide = result;
  } catch (err) {
    logToFile('⚠️ observe debrief: guide LLM failed/invalid — using the fallback', { sessionId, error: err.message });
    // The fallback sanitises interpolated v2 text, but validate anyway: if
    // pathological content still slips a gate, drop to the fully static
    // scaffold (always valid).
    guide = buildFallbackGuide(v2, { language: lang });
    try {
      validateGuide(guide, S, lang);
    } catch (fallbackErr) {
      logToFile('⚠️ observe debrief: fallback failed the gates — static scaffold', { sessionId, error: fallbackErr.message });
      guide = buildFallbackGuide({}, { language: lang });
    }
  }

  await WhatsAppService.sendMessage(from, renderGuideMessage(guide, S));
  await WhatsAppService.sendMessage(from, S.debrief_record_instruction);
  // Direct arm (not the guarded armDebriefAudio): the coach chose to debrief
  // THIS session now, so the tap wins over a stale arm for another session
  // (which stays pending and resurfaces in the list).
  await ObserveState.setState(user.id, 'awaiting_debrief_audio', { sessionId, guide_snapshot: guide });
  logToFile('🗣 observe debrief guide delivered', { sessionId, userId: user.id, lang });
}

// ── The debrief recording ──────────────────────────────────────────────

// Read-merge-write into analysis_data.observer_debrief — never clobber the
// rest of analysis_data (the coach's edited v2 lives there). `extraColumns`
// lets a caller set columns in the same write.
async function _mergeObserverDebrief(sessionId, patch, extraColumns = {}) {
  const { data: row, error } = await supabase
    .from('coaching_sessions')
    .select('analysis_data')
    .eq('id', sessionId)
    .single();
  if (error || !row) throw new Error(`observer_debrief merge: session load failed: ${error && error.message}`);
  const analysis = row.analysis_data || {};
  const merged = { ...analysis, observer_debrief: { ...(analysis.observer_debrief || {}), ...patch } };
  const { error: updateError } = await supabase
    .from('coaching_sessions')
    .update({ analysis_data: merged, ...extraColumns })
    .eq('id', sessionId);
  if (updateError) throw new Error(`observer_debrief merge: update failed: ${updateError.message}`);
  return merged;
}

/**
 * A recording arrived while awaiting_debrief_audio (routed by
 * observe-audio-router). Persist the audio id + guide snapshot on the row
 * (the row, not the queue payload, is the source of truth), queue the
 * dedicated observe_debrief job — NEVER the lesson transcription job, whose
 * processor writes transcript_text and would overwrite the LESSON transcript
 * on this same row — ack, and clear the state.
 */
async function startDebriefFromAudio(user, from, audioId, observeState, opts = {}) {
  const S = observeStrings(observeLang(user));
  const sessionId = observeState && observeState.sessionId;
  if (!sessionId) {
    logToFile('❌ observe debrief audio: state has no sessionId', { userId: user && user.id });
    await WhatsAppService.sendMessage(from, S.debrief_load_error);
    return;
  }
  const CoachingJobQueueService = require('../coaching/coaching-job-queue.service');
  const mimeType = (opts && opts.mimeType) || null;
  try {
    // A new recording is a FRESH debrief: the worker skips re-transcription
    // when a transcript is stored (right for a retry of the same audio), so a
    // previous attempt's transcript, feedback, failure counters and hash are
    // cleared here — or the coach could never recover from a bad first take.
    // audio_mime is the real container (a phone recorder's AAC arrives as a
    // file); the worker names the temp file from it.
    await _mergeObserverDebrief(sessionId, {
      audio_id: audioId,
      audio_mime: mimeType,
      guide_snapshot: observeState.guide_snapshot || null,
      recorded_at: new Date().toISOString(),
      transcript: null,
      transcript_language: null,
      diarization_confidence: null,
      feedback: null,
      opening_sent_at: null,
      attempts: 0,
      transcription_error: null,
      error_class: null,
      failed_at: null,
      failure_notified_at: null,
      audio_hash: null,
      duplicate_of_session_id: null,
    });
    await CoachingJobQueueService.queueObserveDebrief(sessionId, { from, audioId, mimeType });
    await WhatsAppService.sendMessage(from, S.debrief_audio_received);
    await ObserveState.clearState(user.id);
    logToFile('🎙 observe debrief recording queued', { sessionId, userId: user.id });
  } catch (err) {
    logToFile('❌ observe debrief capture failed', { sessionId, error: err.message });
    await WhatsAppService.sendMessage(from, S.debrief_feedback_failed);
  }
}

/**
 * Send the card image: PNG to TEMP_DIR → sendImage(to, path, caption).
 * Returns true only on a confirmed send; any failure (false, a throw, a write
 * error) returns false so the caller falls back to the text card.
 */
async function _sendCardImage(sessionId, to, png, caption) {
  const fs = require('fs');
  const { TEMP_DIR } = require('../../utils/constants');
  const { privateTempPath, removePrivateTemp } = require('../../utils/private-temp');
  // A directory of this send's own: session + clock is shared by a queue retry that
  // overlaps the first delivery, and the upload reads the file after this returns
  // to the event loop — one send's cleanup deleted the other's card mid-read.
  let tmp = null;
  try {
    tmp = privateTempPath(TEMP_DIR, `observe_coach_card_${sessionId}.png`, 'observe-card-');
    fs.writeFileSync(tmp.filePath, png);
    const ok = await WhatsAppService.sendImage(to, tmp.filePath, caption);
    return ok !== false;
  } catch (err) {
    logToFile('⚠️ observe debrief: card image send failed — text card instead', { sessionId, error: err.message });
    return false;
  } finally {
    removePrivateTemp(tmp);
  }
}

/**
 * Deliver stored feedback (opening message + card) and mark done. Sends are
 * CHECKED — sendMessage returns false instead of throwing, and flipping 'done'
 * after a silent failure would lose the feedback for good. A throw here keeps
 * status 'pending' and lets the queue retry; the feedback is already
 * persisted, so the retry is deliver-only.
 *
 * The opening is stamped (observer_debrief.opening_sent_at) as soon as it is
 * confirmed sent, before the card goes, so a retry after a failed card sends
 * only the card — the coach never gets the opening twice.
 */
async function _deliverCoachFeedback(sessionId, coach, from, feedback, S, lang, { openingSentAt = null } = {}) {
  const { renderCoachFeedbackMessages } = require('./observe-coach-feedback');
  const { renderCoachCard } = require('./observe-coach-card');
  const [openingMsg, cardMsg] = renderCoachFeedbackMessages(feedback, S);
  let sentOpening = true;
  if (openingSentAt) {
    logToFile('🔁 observe debrief: opening already sent — card only', { sessionId });
  } else {
    sentOpening = await WhatsAppService.sendMessage(from, openingMsg);
    if (sentOpening !== false) {
      try {
        await _mergeObserverDebrief(sessionId, { opening_sent_at: new Date().toISOString() });
      } catch (stampErr) {
        // Worst case a retry repeats the opening; never lose the card over it.
        logToFile('⚠️ observe debrief: could not stamp the opening as sent', { sessionId, error: stampErr.message });
      }
    }
  }

  // The card ships as an image; renderCoachCard returns null for a harmful
  // debrief and on any render failure — both fall back to the text card.
  let sentCard = false;
  const png = await renderCoachCard(feedback, { lang });
  if (png) sentCard = await _sendCardImage(sessionId, from, png, S.coach_card_closing);
  if (!png || !sentCard) sentCard = await WhatsAppService.sendMessage(from, cardMsg);

  if (sentOpening === false || sentCard === false) {
    throw new Error('observe debrief: feedback send failed — retrying via the queue');
  }
  const { error } = await supabase.from('coaching_sessions').update({ debrief_status: 'done' }).eq('id', sessionId);
  if (error) throw new Error(`observe debrief: done-flip failed: ${error.message}`);
  logToFile('✅ observe debrief coached', { sessionId, rubric: feedback.rubric });

  // Debrief done — if the report already reached the teacher (the other
  // completion order), the observation is complete. Never throws.
  await require('./observe-completion').maybeCompleteObservation(sessionId);

  // The natural next step: offer to send the teacher their report.
  // Non-fatal — the /observe list carries an unsent-report row as the durable
  // re-entry point.
  try {
    await require('./observe-send.service').offerSendReport(coach, from, sessionId);
  } catch (offerErr) {
    logToFile('⚠️ observe: send-report offer failed (the list re-entry is still there)', {
      sessionId, error: offerErr.message,
    });
  }
}

/**
 * The coach-feedback LLM pass, with ONE guided repair. A shape rejection used
 * to dead-end the debrief ("couldn't analyse it") with a transcript stored and
 * no feedback. The repair feeds the validator's error back and asks for the
 * SAME shape, corrected. The harm gate and the score block stay in code: a
 * repair that still fails throws — no bypass, no manufactured praise.
 */
async function coachFeedbackWithRepair(prompt, sessionId) {
  const { validateCoachFeedback } = require('./observe-coach-feedback');
  const { result } = await GPT5MiniService.completeJson(prompt, { maxTokens: 6000, label: 'observeCoachFeedback' });
  try {
    validateCoachFeedback(result);
    return result;
  } catch (vErr) {
    logToFile('⚠️ observe debrief: feedback failed validation — one guided repair', { sessionId, error: vErr.message });
    const repairPrompt = `${prompt}\n\nIMPORTANT — your previous answer was rejected by a strict validator with this error:\n"${vErr.message}"\nProduce the SAME JSON shape again, corrected so the validator passes. Stay faithful to the transcript; fix only what the error names. Remember the hard rules: a harmful debrief (teacher disparaged, or feedback aimed at the person not the moves) must have wins: [], NO praise_line, and a filled concern {what_happened, why_it_matters, instead}; a non-harmful one needs a praise_line and exactly 2 wins, each with behaviour + evidence; no number, score or percentage anywhere.`;
    const { result: repaired } = await GPT5MiniService.completeJson(repairPrompt, {
      maxTokens: 6000, label: 'observeCoachFeedbackRepair',
    });
    validateCoachFeedback(repaired);   // still strict — throws on a second miss
    return repaired;
  }
}

// The temp-file extension for a debrief download, from the inbound MIME. The
// last-resort transcription fallback sniffs the extension, and a mislabelled
// container is rejected. Unknown/absent → .ogg (what every voice note is).
const _MIME_EXTENSIONS = [
  [/aac/i, '.aac'],
  [/mp4|m4a/i, '.m4a'],
  [/mpeg|mp3|mpga/i, '.mp3'],
  [/ogg|opus|oga/i, '.ogg'],
  [/wav/i, '.wav'],
  [/webm/i, '.webm'],
  [/flac/i, '.flac'],
  [/amr/i, '.amr'],
];
function tempExtensionFor(mime) {
  if (!mime || typeof mime !== 'string') return '.ogg';
  const hit = _MIME_EXTENSIONS.find(([re]) => re.test(mime));
  return hit ? hit[1] : '.ogg';
}

/**
 * Persist a transcription-stage failure on the row and tell the coach ONCE.
 * Never throws: failing to record a failure must not turn back into the
 * unhandled throw this exists to remove.
 */
async function _recordTranscriptionFailure(sessionId, from, observerDebrief, err, S) {
  const { classifyTranscriptionFailure, ERROR_CLASS } = require('./debrief-retry-sweep');
  const now = new Date().toISOString();
  const attempts = (Number(observerDebrief.attempts) || 0) + 1;
  const alreadyNotified = !!observerDebrief.failure_notified_at;
  // Classified HERE, the only place that still holds the failing request: a
  // dead media id must not be retried — or described — like a provider outage.
  const errorClass = classifyTranscriptionFailure(err);
  const mediaGone = errorClass === ERROR_CLASS.MEDIA_GONE;
  const patch = {
    transcription_error: String((err && err.message) || err).slice(0, 500),
    error_class: errorClass,
    failed_at: now,
    attempts,
  };
  if (!alreadyNotified) patch.failure_notified_at = now;

  logToFile('❌ observe debrief: transcription failed — recorded for the retry sweep', {
    sessionId, attempts, errorClass, error: patch.transcription_error, notify: !alreadyNotified,
  }, 'error');

  let persisted = false;
  try {
    await _mergeObserverDebrief(sessionId, patch);
    persisted = true;
  } catch (mergeErr) {
    logToFile('❌ observe debrief: could not persist the transcription failure', { sessionId, error: mergeErr.message }, 'error');
  }
  // Notify once. Merge FIRST so the flag is durable before the send. The copy
  // names the actual state: "I'll keep retrying" about a recording no retry
  // can reach makes the coach wait instead of re-recording.
  if (!alreadyNotified && persisted && from) {
    try {
      await WhatsAppService.sendMessage(from, mediaGone ? S.debrief_media_gone : S.debrief_processing_failed);
    } catch (sendErr) {
      logToFile('⚠️ observe debrief: failure notice send threw', { sessionId, error: sendErr.message });
    }
  }
}

// ── Duplicate recording ────────────────────────────────────────────────

function computeAudioHash(buffer) {
  return require('crypto').createHash('sha256').update(buffer).digest('hex');
}

/** This coach's newest OTHER debrief already coached on these exact bytes, or null. */
async function _findPriorAnalysedDebrief({ observerUserId, audioHash, excludeSessionId }) {
  if (!observerUserId || !audioHash) return null;
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('id, created_at')
    .eq('observer_user_id', observerUserId)
    .eq('observation_type', 'leader_observation')
    .eq('analysis_data->observer_debrief->>audio_hash', audioHash)
    .not('analysis_data->observer_debrief->feedback', 'is', null)
    .neq('id', excludeSessionId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
}

/**
 * Has this coach already been coached on these exact bytes, for another
 * observation? Then tell them, keep THIS observation pending with the
 * recording detached (the retry sweep re-queues any pending row that has an
 * audio id and no transcript, so a kept id would be refused every tick), and
 * re-arm it for the right recording.
 *
 * Fails OPEN on a lookup error (the debrief is analysed as before). Never
 * throws.
 * @returns {Promise<boolean>} true → the caller must not transcribe
 */
async function _refuseIfAlreadyAnalysed(session, sessionId, from, audioHash, observerDebrief, S) {
  let prior = null;
  try {
    prior = await _findPriorAnalysedDebrief({
      observerUserId: session.observer_user_id, audioHash, excludeSessionId: sessionId,
    });
  } catch (err) {
    logToFile('⚠️ observe debrief: duplicate check failed — analysing normally', { sessionId, error: err && err.message }, 'warn');
    return false;
  }
  if (!prior) return false;

  try {
    await _mergeObserverDebrief(sessionId, {
      audio_id: null,
      audio_mime: null,
      duplicate_of_session_id: prior.id,
      duplicate_refused_at: new Date().toISOString(),
    });
  } catch (err) {
    // Nothing is analysed either way; left attached, the sweep re-runs this.
    logToFile('❌ observe debrief: could not record a duplicate refusal', { sessionId, priorSessionId: prior.id, error: err && err.message }, 'error');
    return true;
  }
  try {
    await armDebriefAudio(session.observer_user_id, sessionId, observerDebrief.guide_snapshot);
    await WhatsAppService.sendMessage(from, S.debrief_duplicate_recording);
  } catch (err) {
    logToFile('⚠️ observe debrief: duplicate notice/re-arm failed', { sessionId, error: err && err.message }, 'warn');
  }
  logToFile('🔁 observe debrief: recording already analysed — resubmission refused', { sessionId, priorSessionId: prior.id });
  return true;
}

async function _loadCoach(observerUserId) {
  if (!observerUserId) return null;
  try {
    const { data } = await supabase
      .from('users')
      .select('id, name, phone_number, preferred_language, role')
      .eq('id', observerUserId)
      .maybeSingle();
    return data || null;
  } catch (_) {
    return null;
  }
}

/**
 * Worker side (job type observe_debrief): transcribe the debrief recording and
 * coach the coach.
 *
 * Idempotent under queue redelivery: 'done' → no-op; stored feedback →
 * deliver only; stored transcript → no re-transcription. Write order:
 * transcript merge → feedback merge → checked sends → done-flip. Every failure
 * keeps debrief_status 'pending', so the session resurfaces in /observe.
 *
 * Everything said here goes to the COACH — so the coach's users row (from
 * observer_user_id) is the address and the language, never the
 * session's user_id, which is the observed teacher once one is bound.
 */
async function processDebriefRecording(sessionId, payload = {}) {
  const fs = require('fs');
  const { TEMP_DIR } = require('../../utils/constants');
  const { privateTempPath, removePrivateTemp } = require('../../utils/private-temp');
  const TranscriptionProcessorService = require('../coaching/transcription-processor.service');
  const { MIN_TRANSCRIPT_CHARS, buildCoachFeedbackPrompt } = require('./observe-coach-feedback');

  const { data: session, error } = await supabase
    .from('coaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !session) throw new Error(`observe debrief: session not found: ${error && error.message}`);

  const coach = (await _loadCoach(session.observer_user_id)) || { id: session.observer_user_id };
  // A retry sweep re-queues without a `from`: resolve the coach's address on
  // their own channel (a Matrix coach has no phone_number).
  const from = payload.from || await require('./observe-identity').identityForUser(coach.id);
  const lang = await languageFor('coach', session);
  const S = observeStrings(lang);
  const observerDebrief = (session.analysis_data && session.analysis_data.observer_debrief) || {};

  // Redelivery guards, in order of how far a previous attempt got.
  if (session.debrief_status === 'done') {
    logToFile('🔭 observe debrief: already done — redelivery no-op', { sessionId });
    return;
  }
  if (observerDebrief.feedback) {
    logToFile('🔭 observe debrief: feedback stored — deliver-only redelivery', { sessionId });
    await _deliverCoachFeedback(sessionId, coach, from, observerDebrief.feedback, S, lang, {
      openingSentAt: observerDebrief.opening_sent_at,
    });
    return;
  }

  // A queue payload can lose fields — the row is the source of truth.
  const audioId = payload.audioId || observerDebrief.audio_id;
  if (!audioId) throw new Error('observe debrief: no audio id in payload or row');

  // Created on first use, in a private directory: a path from the session id
  // and the clock is shared by two deliveries of this job in one millisecond,
  // and one would transcribe — then delete — the other's recording. The file
  // keeps its name (and the extension the transcription fallback sniffs).
  const tempName = `observe_debrief_${sessionId}_${Date.now()}${tempExtensionFor(observerDebrief.audio_mime || payload.mimeType)}`;
  let temp = null;
  try {
    let transcript = observerDebrief.transcript || '';

    if (!transcript) {
      let transcription;
      let audioHash = null;
      try {
        const raw = await WhatsAppService.downloadMedia(audioId);
        const audioData = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        temp = privateTempPath(TEMP_DIR, tempName, 'debrief-');
        const tempAudioPath = temp.filePath;
        fs.writeFileSync(tempAudioPath, audioData);
        // A debrief is analysed once: checked on the downloaded bytes, BEFORE
        // transcription, so a repeat costs no transcription or LLM call.
        audioHash = computeAudioHash(audioData);
        if (await _refuseIfAlreadyAnalysed(session, sessionId, from, audioHash, observerDebrief, S)) return;
        transcription = await TranscriptionProcessorService.transcribeWithDiarization(tempAudioPath);
      } catch (txErr) {
        // Record on the row, tell the coach ONCE, and return without
        // rethrowing: the worker's retry sweep owns retries (spaced, bounded).
        // The queue's quick blind retries are useless inside an outage.
        await _recordTranscriptionFailure(sessionId, from, observerDebrief, txErr, S);
        return;
      }
      transcript = (transcription && transcription.transcript) || '';

      if (transcript.length < MIN_TRANSCRIPT_CHARS) {
        logToFile('🔇 observe debrief: transcript too short for feedback', { sessionId, chars: transcript.length });
        // Re-arm so "record a longer stretch and send it" works — but never
        // over a debrief the coach started for another session meanwhile.
        await armDebriefAudio(session.observer_user_id, sessionId, observerDebrief.guide_snapshot);
        await WhatsAppService.sendMessage(from, S.debrief_too_short);
        return;
      }

      // Persist the transcript BEFORE the LLM pass so an analysis failure
      // never loses the recording's content (and a redelivery skips
      // re-transcribing). The hash only counts as "analysed" once feedback
      // lands beside it.
      await _mergeObserverDebrief(sessionId, {
        transcript,
        audio_hash: audioHash,
        transcript_language: (transcription && transcription.language) || null,
        diarization_confidence: (transcription && transcription.diarization && transcription.diarization.confidence) || null,
      });
    }

    let feedback;
    try {
      const prompt = buildCoachFeedbackPrompt(transcript, { coachName: coach.name, language: lang });
      feedback = await coachFeedbackWithRepair(prompt, sessionId);
    } catch (llmErr) {
      logToFile('⚠️ observe debrief: coach-feedback LLM failed/invalid', { sessionId, error: llmErr.message });
      await WhatsAppService.sendMessage(from, S.debrief_feedback_failed);
      return; // transcript stored; status stays 'pending'
    }

    await _mergeObserverDebrief(sessionId, { feedback, completed_at: new Date().toISOString() });
    await _deliverCoachFeedback(sessionId, coach, from, feedback, S, lang);
  } finally {
    removePrivateTemp(temp);
  }
}

module.exports = {
  BUTTON_NOW_PREFIX,
  BUTTON_LATER_PREFIX,
  LIST_ROW_PREFIX,
  LIST_NEW_ID,
  parseDebriefButtonId,
  parseDebriefListReplyId,
  buildDebriefChoiceButtons,
  offerDebriefChoice,
  handleDebriefLater,
  listPendingDebriefs,
  listUnsentReports,
  listUnfinished,
  resumeKindFor,
  sendReportRowMeta,
  countPending,
  clearStateAfterSubmit,
  armDebriefAudio,
  startDebrief,
  startDebriefFromAudio,
  tempExtensionFor,
  coachFeedbackWithRepair,
  processDebriefRecording,
  _sendCardImage, // for tests: the card's temp file must be private to one send
};
