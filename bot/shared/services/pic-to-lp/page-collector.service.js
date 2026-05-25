/**
 * Page Collector Service
 *
 * Owns the multi-photo collection UX after a teacher has accepted the LP
 * intent. Mirrors the coaching classroom-photo pattern — same MAX/timeout
 * semantics, same "Add another / Done" buttons.
 */

const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { getUserLanguage } = require('../../utils/language-cache');
const PicLpSession = require('./pic-lp-session.service');

const MAX_PIC_LP_PAGES = 5;
const PAGE_TIMEOUT_MS = 120000; // 2 minutes — matches coaching

// Receipt-notification debounce. When teachers send multiple photos in quick
// succession (a WhatsApp album batch), wait this long before sending the
// "Page N received. Add another?" prompt — that way they see ONE message with
// the final count, not N separate messages. Each subsequent photo resets the
// timer. The max-reached path bypasses this (fires immediately).
const PAGE_RECEIPT_DEBOUNCE_MS = 2500;

const timers = new Map(); // sessionId → 2-min auto-Done timeoutHandle
const receiptDebouncers = new Map(); // sessionId → receipt-notification debouncer

/**
 * Send the intent prompt after the FIRST book-page detection.
 * Asks the teacher what to do with this page (LP / explain / something else).
 */
async function promptIntent({ sessionId, from, language, captionAlreadyHasIntent }) {
  const isUrdu = language === 'ur';

  if (captionAlreadyHasIntent) {
    // Caption already says "make a lesson plan" or similar — skip the buttons,
    // jump straight into the collect-pages step.
    return startCollectingFromIntent({ sessionId, from, language });
  }

  const body = isUrdu
    ? '📚 یہ کتاب کا صفحہ لگ رہا ہے۔ آپ کیا کرنا چاہیں گی؟'
    : '📚 Looks like a textbook page — what would you like to do with it?';

  await WhatsAppService.sendInteractiveButtons(from, {
    body,
    buttons: [
      { id: `pic_lp_start_${sessionId}`, title: isUrdu ? 'سبق بنائیں' : 'Generate Lesson Plan' },
      { id: `pic_explain_${sessionId}`,  title: isUrdu ? 'سمجھائیں' : 'Explain this topic' },
      { id: `pic_other_${sessionId}`,    title: isUrdu ? 'کچھ اور' : 'Something else' },
    ],
  });
}

/**
 * Teacher tapped "Generate Lesson Plan" (or caption already had LP intent).
 * Move state to collecting_pages, then either:
 *   - Single page (slow-drip case): send "Page 1 received. Add another or Done?"
 *   - Multi-page (batch-coalesced case): skip the prompt and jump straight to
 *     onComplete (open the form). The teacher already sent N pages — asking
 *     "want to add more?" is friction.
 */
async function startCollectingFromIntent({ sessionId, from, language }) {
  await PicLpSession.updateStatus(sessionId, 'collecting_pages');

  const session = await PicLpSession.getById(sessionId);
  const pageCount = (session?.pages || []).length || 1;

  if (pageCount >= 2) {
    logToFile('📚 Pic-LP intent confirmed for batch-coalesced session — auto-completing', {
      sessionId, pageCount,
    });
    await onComplete({ sessionId, from, language, trigger: 'intent_with_multi_page_batch' });
    return;
  }

  await sendPageReceivedPrompt({ sessionId, from, language, pageCount });
  scheduleAutoDone({ sessionId, from });
}

/**
 * Called when a subsequent image arrives during an active collecting_pages
 * session. Appends the page synchronously, then debounces the user-facing
 * receipt notification so a batch of N photos sent within ~2.5s coalesces to
 * ONE "Page N received. Add another?" prompt instead of N.
 *
 * Max-reached path bypasses the debounce — that's a one-shot terminal message.
 */
async function appendPageAndPrompt({ sessionId, from, language, page }) {
  const updated = await PicLpSession.appendPage(sessionId, page);
  const pageCount = updated?.pages?.length || 1;

  if (pageCount >= MAX_PIC_LP_PAGES) {
    // Max-reached preempts any pending coalesce debouncer + the inactivity timer.
    cancelReceiptDebouncer(sessionId);
    cancelTimer(sessionId);
    const isUrdu = language === 'ur';
    await WhatsAppService.sendMessage(
      from,
      isUrdu
        ? `📚 صفحہ ${pageCount} موصول۔ زیادہ سے زیادہ حد پوری — اب لیسن پلان بنائی جا رہی ہے۔`
        : `📚 Page ${pageCount} received. Maximum reached — generating your lesson plan now.`
    );
    return { autoComplete: true, pageCount };
  }

  // Debounce the receipt notification. If more photos arrive in the window,
  // this timer gets cancelled + rescheduled with the new pageCount, so only
  // the LAST one fires (with the final count).
  scheduleReceiptNotification({ sessionId, from, language, pageCount });
  scheduleAutoDone({ sessionId, from }); // refresh the 2-min inactivity timer
  return { autoComplete: false, pageCount };
}

/**
 * Schedule (or replace) the debounced "Page N received. Add another?" prompt.
 * Always reads the LATEST pageCount, so a batch of arrivals collapses to one
 * message with the final count.
 */
function scheduleReceiptNotification({ sessionId, from, language, pageCount }) {
  cancelReceiptDebouncer(sessionId);
  const handle = setTimeout(async () => {
    receiptDebouncers.delete(sessionId);
    try {
      await sendPageReceivedPrompt({ sessionId, from, language, pageCount });
    } catch (err) {
      logToFile('⚠️ pic-LP receipt-notification debounce send failed', {
        error: err.message, sessionId,
      });
    }
  }, PAGE_RECEIPT_DEBOUNCE_MS);
  receiptDebouncers.set(sessionId, handle);
}

function cancelReceiptDebouncer(sessionId) {
  const h = receiptDebouncers.get(sessionId);
  if (h) clearTimeout(h);
  receiptDebouncers.delete(sessionId);
}

/**
 * Send "Page N received. Add another or Done?" buttons.
 */
async function sendPageReceivedPrompt({ sessionId, from, language, pageCount }) {
  const isUrdu = language === 'ur';
  await WhatsAppService.sendInteractiveButtons(from, {
    body: isUrdu
      ? `📚 صفحہ ${pageCount} موصول۔ کیا آپ ایک اور صفحہ بھیجنا چاہیں گی؟`
      : `📚 Page ${pageCount} received. Would you like to send another page?`,
    buttons: [
      { id: `pic_more_${sessionId}`, title: isUrdu ? 'مزید صفحہ' : 'Add another page' },
      { id: `pic_done_${sessionId}`, title: isUrdu ? 'مکمل' : 'Done' },
    ],
  });
}

/**
 * Schedule an auto-Done after PAGE_TIMEOUT_MS of teacher inactivity.
 * Replaces any existing timer for this session.
 */
function scheduleAutoDone({ sessionId, from }) {
  cancelTimer(sessionId);
  const handle = setTimeout(async () => {
    try {
      const session = await PicLpSession.getById(sessionId);
      if (!session || session.status !== 'collecting_pages') return;
      const language = await getLanguageForSession(session);
      await onComplete({ sessionId, from, language, trigger: 'timeout' });
    } catch (err) {
      logToFile('⚠️ pic-LP auto-Done timer failed', { error: err.message, sessionId });
    } finally {
      timers.delete(sessionId);
    }
  }, PAGE_TIMEOUT_MS);
  timers.set(sessionId, handle);
}

function cancelTimer(sessionId) {
  const h = timers.get(sessionId);
  if (h) clearTimeout(h);
  timers.delete(sessionId);
}

/**
 * Called when collection completes (Done button, max-reached, or timeout).
 * Triggers metadata extraction → form prompt.
 */
async function onComplete({ sessionId, from, language, trigger }) {
  cancelTimer(sessionId);
  cancelReceiptDebouncer(sessionId); // kill any pending receipt prompt
  const session = await PicLpSession.getById(sessionId);
  if (!session) {
    logToFile('⚠️ pic-LP onComplete: session vanished', { sessionId });
    return;
  }
  if (!Array.isArray(session.pages) || session.pages.length === 0) {
    logToFile('⚠️ pic-LP onComplete: no pages collected, cancelling', { sessionId, trigger });
    await PicLpSession.updateStatus(sessionId, 'cancelled');
    return;
  }

  // Hand off to extractor + form prompt — done in a separate module so this
  // file stays UI-only. Lazy-required to avoid a circular import.
  const { extractAndPromptForm } = require('./completion-handler.service');
  await extractAndPromptForm({ session, from, language, trigger });
}

async function getLanguageForSession(session) {
  // Best-effort language lookup. Falls back to 'en'.
  if (session?.user_id) {
    return (await getUserLanguage(session.user_id)) || 'en';
  }
  return 'en';
}

module.exports = {
  MAX_PIC_LP_PAGES,
  PAGE_TIMEOUT_MS,
  PAGE_RECEIPT_DEBOUNCE_MS,
  promptIntent,
  startCollectingFromIntent,
  appendPageAndPrompt,
  onComplete,
  scheduleAutoDone,
  cancelTimer,
  cancelReceiptDebouncer,
};
