/**
 * Writing Feedback Handler — "Writer's Second Pair of Eyes"
 *
 * Routes WhatsApp messages into the writing-feedback state machine:
 *
 *   awaiting_photo → awaiting_age → awaiting_parent_confirm → done
 *
 * Entry points:
 *   - `/writing` (or "check my child's writing" / "essay" / "paragraph")
 *   - a photo whose caption mentions writing / essay / paragraph
 *
 * The parent-confirm step is the product, not a setting: the draft goes to the
 * PARENT, she edits or confirms it, and only then does Rumi produce the
 * delivery script + final feedback. See writing-feedback.service.js.
 *
 * Shaped after exam-checker.handler.js — same handled/null contract, so the
 * image and text handlers route it the same way (a `null` means "not mine,
 * carry on down the chain").
 */

const WritingFeedbackService = require('../services/writing-feedback.service');
const WhatsAppService = require('../services/whatsapp.service');
const { uploadImageWithRetry } = require('../storage/r2');
const { logToFile } = require('../utils/logger');
const { runWithCorrelation, generateCorrelationId } = require('../utils/structured-logger');

const CANCEL_WORDS = ['cancel', '/cancel', 'stop', 'never mind', 'nevermind'];

const UNAVAILABLE_MESSAGE =
  "I can't read handwriting on this setup yet — the photo-reading key isn't configured. "
  + 'If you type the paragraph out here, though, I can still help with the feedback.';

/**
 * Text messages: the trigger, the age reply, and the parent's edits.
 *
 * @returns {Promise<{handled: boolean}|null>} null = not for this feature
 */
async function handleWritingText(message, from, user) {
  if (!user) return null;

  const text = message.text?.body || '';
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  const session = await WritingFeedbackService.getActiveSession(user.id);
  const triggered = WritingFeedbackService.shouldTriggerWritingFeedback(trimmed);

  if (!triggered && !session) return null;

  // An active session must never swallow another feature's slash command —
  // /menu, /quiz, /portal all have to keep working mid-flow.
  if (session && !triggered && trimmed.startsWith('/')) return null;

  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

    try {
      if (session && CANCEL_WORDS.includes(normalized)) {
        await WritingFeedbackService.cancelSession(session.id);
        typingController.stop();
        await WhatsAppService.sendMessage(
          from,
          "No problem — stopped there. Send /writing whenever you'd like to look at a piece together."
        );
        return { handled: true };
      }

      // Fresh trigger → open a session and ask for the photo.
      if (triggered && !session) {
        if (!WritingFeedbackService.isAvailable()) {
          typingController.stop();
          await WhatsAppService.sendMessage(from, UNAVAILABLE_MESSAGE);
          return { handled: true };
        }
        await WritingFeedbackService.startSession(user.id, from);
        typingController.stop();
        await WhatsAppService.sendMessage(from, WritingFeedbackService.askForPhotoMessage());
        return { handled: true };
      }

      const { STATES } = WritingFeedbackService;

      switch (session.status) {
        case STATES.AWAITING_PHOTO:
          return await _handleAwaitingPhotoText({ session, from, trimmed, typingController });

        case STATES.AWAITING_AGE:
          return await _handleAwaitingAgeText({ session, from, trimmed, typingController });

        case STATES.AWAITING_PARENT_CONFIRM:
          return await _handleConfirmText({ session, from, trimmed, typingController });

        default:
          typingController.stop();
          return null;
      }
    } catch (error) {
      typingController.stop();
      logToFile('❌ Writing-feedback text error', { error: error.message, userId: user.id });
      await WhatsAppService.sendMessage(
        from,
        "Something went wrong on my side — not on yours. Send /writing to start again."
      );
      return { handled: true, error: error.message };
    }
  });
}

/**
 * While waiting on the photo, a long enough message IS the paragraph — this is
 * the path the low-OCR-confidence branch asks her to take ("can you type the
 * paragraph?"), and it doubles as the no-photo-needed route.
 */
async function _handleAwaitingPhotoText({ session, from, trimmed, typingController }) {
  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksLikeParagraph =
    trimmed.length >= WritingFeedbackService.MIN_TEXT_CHARS
    && words.length >= WritingFeedbackService.MIN_TEXT_WORDS;

  if (!looksLikeParagraph) {
    typingController.stop();
    await WhatsAppService.sendMessage(from, WritingFeedbackService.askForPhotoMessage());
    return { handled: true };
  }

  await WritingFeedbackService.updateSession(session.id, {
    status: WritingFeedbackService.STATES.AWAITING_AGE,
    ocr_text: trimmed,
    // Typed by the parent, so there is nothing to be unsure about — recorded
    // as 1 with its own provider so the OCR accuracy log can exclude it.
    ocr_confidence: 1,
    ocr_provider: 'parent_typed',
  });

  typingController.stop();
  await WhatsAppService.sendMessage(from, WritingFeedbackService.askForAgeMessage());
  return { handled: true };
}

/** The age reply → draft the feedback and show it to the parent. */
async function _handleAwaitingAgeText({ session, from, trimmed, typingController }) {
  const age = WritingFeedbackService.parseAge(trimmed);

  if (age === null) {
    typingController.stop();
    await WhatsAppService.sendMessage(from, WritingFeedbackService.ageNotUnderstoodMessage());
    return { handled: true };
  }

  const draft = await WritingFeedbackService.draftFeedback({
    text: session.ocr_text,
    age,
  });

  await WritingFeedbackService.updateSession(session.id, {
    status: WritingFeedbackService.STATES.AWAITING_PARENT_CONFIRM,
    child_age: age,
    ai_draft: draft,
    parent_final: draft,
  });

  typingController.stop();
  await WhatsAppService.sendMessage(from, WritingFeedbackService.formatDraftMessage(draft));
  return { handled: true };
}

/** The parent's edits, or her "send". */
async function _handleConfirmText({ session, from, trimmed, typingController }) {
  const current = session.parent_final || session.ai_draft;
  const result = WritingFeedbackService.applyParentEdits(current, trimmed);

  if (result.action === 'unknown') {
    typingController.stop();
    await WhatsAppService.sendMessage(from, result.message);
    return { handled: true };
  }

  if (result.action === 'edit') {
    if (result.draft.edits.length === 0) {
      await WritingFeedbackService.updateSession(session.id, {
        status: WritingFeedbackService.STATES.CANCELLED,
        parent_final: result.draft,
        edits_count: (session.edits_count || 0) + result.editsApplied,
      });
      typingController.stop();
      await WhatsAppService.sendMessage(
        from,
        "That takes every point out — so there's nothing left to send, and that's a fine answer too. "
        + 'Send /writing when you want to look at another piece.'
      );
      return { handled: true };
    }

    await WritingFeedbackService.updateSession(session.id, {
      parent_final: result.draft,
      edits_count: (session.edits_count || 0) + result.editsApplied,
    });

    typingController.stop();
    await WhatsAppService.sendMessage(
      from,
      WritingFeedbackService.formatDraftMessage(result.draft)
    );
    return { handled: true };
  }

  // Confirmed → the script + the final feedback, then close the session.
  const script = await WritingFeedbackService.deliveryScript(
    result.draft,
    session.child_age
  );

  await WritingFeedbackService.updateSession(session.id, {
    status: WritingFeedbackService.STATES.DONE,
    parent_final: result.draft,
    confirmed_at: new Date().toISOString(),
  });

  typingController.stop();
  await WhatsAppService.sendMessage(
    from,
    WritingFeedbackService.formatFinalMessage(result.draft, script)
  );
  return { handled: true };
}

/**
 * Image messages: the photo of the paragraph.
 *
 * Claims the image only when an open session is waiting on one, or the caption
 * names writing/essay/paragraph — so exam papers, classroom photos and
 * textbook pages all route exactly as they did before.
 *
 * @returns {Promise<{handled: boolean}|null>} null = not for this feature
 */
async function handleWritingImage(message, from, user) {
  if (!user) return null;

  const caption = message.image?.caption || '';
  const session = await WritingFeedbackService.getActiveSession(user.id);
  const awaitingPhoto = !!session && session.status === WritingFeedbackService.STATES.AWAITING_PHOTO;
  const captionAsks = WritingFeedbackService.captionMarksWriting(caption);

  if (!awaitingPhoto && !captionAsks) return null;

  if (!WritingFeedbackService.isAvailable()) {
    // Only speak up if she actually asked for this feature; otherwise stay
    // silent and let the rest of the image chain do its job.
    if (!awaitingPhoto) return null;
    await WhatsAppService.sendMessage(from, UNAVAILABLE_MESSAGE);
    return { handled: true };
  }

  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

    try {
      const active = session || (await WritingFeedbackService.startSession(user.id, from));

      const imageId = message.image?.id;
      const mimeType = message.image?.mime_type || 'image/jpeg';
      const imageBuffer = await WhatsAppService.downloadMedia(imageId);
      const imageUrl = await uploadImageWithRetry(imageBuffer, user.id, imageId, mimeType);

      const ocr = await WritingFeedbackService.extractText(imageUrl);

      if (ocr.lowConfidence) {
        // Logged anyway: a weak read is data about the OCR path, which is the
        // riskiest part of this feature. Status stays awaiting_photo so either
        // a clearer photo or a typed paragraph carries on from here.
        await WritingFeedbackService.updateSession(active.id, {
          image_url: imageUrl,
          ocr_text: ocr.text,
          ocr_confidence: ocr.confidence,
          ocr_provider: ocr.provider,
        });

        typingController.stop();
        await WhatsAppService.sendMessage(from, WritingFeedbackService.lowConfidenceMessage());
        return { handled: true };
      }

      await WritingFeedbackService.updateSession(active.id, {
        status: WritingFeedbackService.STATES.AWAITING_AGE,
        image_url: imageUrl,
        ocr_text: ocr.text,
        ocr_confidence: ocr.confidence,
        ocr_provider: ocr.provider,
      });

      typingController.stop();
      await WhatsAppService.sendMessage(from, WritingFeedbackService.askForAgeMessage());
      return { handled: true };
    } catch (error) {
      typingController.stop();
      logToFile('❌ Writing-feedback image error', { error: error.message, userId: user.id });
      await WhatsAppService.sendMessage(
        from,
        "I couldn't get that photo open. Could you send it again — or type the paragraph out for me?"
      );
      return { handled: true, error: error.message };
    }
  });
}

module.exports = {
  handleWritingText,
  handleWritingImage,
  CANCEL_WORDS,
  UNAVAILABLE_MESSAGE,
};
