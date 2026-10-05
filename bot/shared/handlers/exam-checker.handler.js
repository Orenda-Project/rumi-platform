/**
 * Exam Checker Handler
 *
 * Routes WhatsApp messages to the Exam Checker Orchestrator.
 * Handles text commands, image uploads, button responses, and WhatsApp Flows.
 *
 * Created: 2026-01-24
 */

const { ExamCheckerOrchestrator, SESSION_STATES } = require('../services/exam-checker');
const WhatsAppService = require('../services/whatsapp.service');
const { uploadImageWithRetry } = require('../storage/r2');
const { logToFile } = require('../utils/logger');
const { redactUrl } = require('../utils/redact-url');
const { runWithCorrelation, generateCorrelationId } = require('../utils/structured-logger');
const { driverForIdentifier } = require('../services/messaging/channel-registry');

/**
 * Sends the exam-confirm student-confirmation screen on Slack/Discord's
 * modal-workaround renderers, or falls through to the Meta sendFlow() path
 * for WhatsApp/Baileys. Mirrors /settings's own driverForIdentifier() branch
 * in text-message.handler.js — both channels' flow registries key
 * exam_confirm's flowToken as the exam session's own session.id directly
 * (never buildFlowToken()'s "userId:kind:timestamp"), matching how the Meta
 * Flow already passes flowToken: session.id at sendFlow() time.
 * @returns {Promise<boolean>} true if a Slack/Discord button was sent (caller should not also call sendFlow())
 */
async function trySendExamConfirmModalTrigger(from, flowResponse) {
  const driverName = driverForIdentifier(from);
  if (driverName !== 'slack' && driverName !== 'discord') return false;

  const body = flowResponse.body || 'Tap below to confirm the student names before I grade them.';
  if (driverName === 'slack') {
    await WhatsAppService.sendInteractiveButtons(from, {
      body,
      buttons: [{ id: `open_modal:exam_confirm:${flowResponse.flowToken}`, title: flowResponse.buttonText || 'Confirm Students' }],
    });
  } else {
    await WhatsAppService.sendInteractiveButtons(from, {
      body,
      buttons: [{ id: `discord_start_flow:exam_confirm:${flowResponse.flowToken}`, title: flowResponse.buttonText || 'Confirm Students' }],
    });
  }
  return true;
}

// Trigger keywords for exam checking (English + Urdu + Arabic)
const EXAM_CHECK_KEYWORDS = [
  // English
  'check exam', 'check exams', 'grade exam', 'grade exams',
  'mark exam', 'mark exams', 'exam check', 'check papers',
  'grade papers', 'mark papers', 'check my papers',
  // Command
  '/exam', '/exams', '/grade', '/checkexam',
  // Urdu
  'امتحان چیک', 'پرچے چیک', 'پیپر چیک', 'امتحان دیکھو',
  'پیپر گریڈ', 'نمبر لگاؤ',
  // Arabic
  'تصحيح امتحان', 'تصحيح الامتحان', 'تقييم امتحان'
];

// Button prefixes for exam checker
const EXAM_BUTTON_PREFIX = 'ech_';

// Words that end an exam session, compared against the whole message. The
// same words the bot already uses to leave attendance entry ('cancel',
// 'منسوخ') and a quiz ('stop', 'روکیں'), plus the Urdu imperative and Arabic.
// While Rumi is collecting the answer key, any of these could be the answer
// itself, so there only EXAM_ANSWER_CANCEL_COMMAND ends the session.
const EXAM_CANCEL_WORDS = ['cancel', '/cancel', 'stop', 'منسوخ', 'منسوخ کریں', 'روکیں', 'إلغاء', 'الغاء'];
const EXAM_ANSWER_CANCEL_COMMAND = '/cancel';

// A trigger phrase (not a command) opens a session only in a short request
// like "check exams for class 5". A longer message, or a question ("How do I
// grade papers fairly?"), is a teacher talking about exams: ordinary chat.
// Only a token with a letter or digit counts as a word, so an emoji or a dash
// does not push a request over the limit.
const PHRASE_TRIGGER_MAX_WORDS = 6;
const QUESTION_MARK = /[?؟]/;
const COUNTED_WORD = /[\p{L}\p{N}]/u;

// Teachers often leave the question mark off, especially in Urdu and Arabic
// chat, so a question word also makes a message a question. "can", "could",
// "please" and the Urdu requests (کرو, کریں) ask for something and are left out.
const QUESTION_WORDS = [
  // English
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'should',
  // Urdu
  'کیسے', 'کیا', 'کیوں', 'کب', 'کہاں', 'کون', 'طریقہ',
  // Arabic
  'كيف', 'ما', 'ماذا', 'لماذا', 'متى', 'أين', 'هل'
];
// Urdu کیا is also the verb "do": right after چیک or گریڈ ("امتحان چیک کیا
// جائے", "پرچے چیک کیا کریں") it is part of a request, not "what".
const URDU_VERB_KIYA = '(?<!(?:چیک|گریڈ)\\s+)';

// Direction marks (LRM, RLM, ALM) that RTL keyboards insert between words.
const DIRECTION_MARKS = /[\u200E\u200F\u061C]/g;

// Punctuation a command may carry: "/exam." and "/exam!" are still /exam.
const TRAILING_PUNCTUATION = /[.,!?؟،]+$/;

// A letter, mark, digit or underscore on either side means the keyword is part
// of a longer word. JS's \b only knows ASCII, so it cannot do this for Urdu or
// Arabic script.
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}_]';
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EXAM_COMMANDS = EXAM_CHECK_KEYWORDS.filter((keyword) => keyword.startsWith('/'));
const PHRASE_PATTERNS = EXAM_CHECK_KEYWORDS
  .filter((keyword) => !EXAM_COMMANDS.includes(keyword))
  .map((keyword) => new RegExp(
    `(?<!${WORD_CHAR})${escapeRegExp(keyword.toLowerCase()).replace(/ /g, '\\s+')}(?!${WORD_CHAR})`,
    'u'
  ));
const QUESTION_WORD_PATTERN = new RegExp(
  `(?<!${WORD_CHAR})(?:${QUESTION_WORDS
    .map((word) => (word === 'کیا' ? URDU_VERB_KIYA : '') + escapeRegExp(normalizeForMatch(word)))
    .join('|')})(?!${WORD_CHAR})`,
  'u'
);

/**
 * Lower-case, drop direction marks, and write the Arabic alef with hamza or
 * madda (أ إ آ) as a plain alef, so "ألغاء" and "إلغاء" compare equal to "الغاء".
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
  return text.toLowerCase().replace(DIRECTION_MARKS, '').replace(/[أإآ]/g, 'ا');
}

/**
 * Is the exam checker switched on? On unless EXAM_CHECKER_ENABLED says
 * false / 0 / off, so a deployment that never sets it keeps exam checking.
 * @returns {boolean}
 */
function isExamCheckerEnabled() {
  const value = String(process.env.EXAM_CHECKER_ENABLED || '').trim().toLowerCase();
  return !['false', '0', 'off'].includes(value);
}

/**
 * Check if a text message should trigger exam checker.
 *
 * A command ("/exam") counts only as the whole message or its first word, and
 * a phrase ("check exams") only as whole words, so a link like
 * https://example.org/exam/results or a word like "recheck" never opens a
 * session. In a chat message a phrase also needs a short request with no
 * question mark and no question word (see PHRASE_TRIGGER_MAX_WORDS and
 * QUESTION_WORDS); a photo caption needs none of this,
 * since the photo already says what the teacher wants.
 * @param {string} text - Message text
 * @param {Object} [options]
 * @param {boolean} [options.caption=false] - The text is a photo's caption
 * @returns {boolean}
 */
function shouldTriggerExamChecker(text, { caption = false } = {}) {
  if (!text) return false;
  const normalizedText = normalizeForMatch(text).trim();
  const words = normalizedText.split(/\s+/);

  const firstWord = words[0].replace(TRAILING_PUNCTUATION, '');
  if (EXAM_COMMANDS.includes(firstWord)) {
    return true;
  }

  if (!caption && (words.filter((word) => COUNTED_WORD.test(word)).length > PHRASE_TRIGGER_MAX_WORDS
    || QUESTION_MARK.test(normalizedText)
    || QUESTION_WORD_PATTERN.test(normalizedText))) {
    return false;
  }

  return PHRASE_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

/**
 * Is this message one of the cancel words on its own? Case and surrounding
 * punctuation are ignored ("Cancel!" counts); "do not cancel" does not. While
 * the answer key is being collected only "/cancel" counts: a bare "Stop" there
 * is the answer.
 * @param {string} text - Message text
 * @param {string} [state] - The open session's state, if known
 * @returns {boolean}
 */
function isExamCancelCommand(text, state) {
  if (!text) return false;
  const normalizedText = normalizeForMatch(text)
    .replace(/[^\p{L}\p{M}\p{N}\s/]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (state && state === SESSION_STATES.COLLECTING_ANSWERS) {
    return normalizedText === EXAM_ANSWER_CANCEL_COMMAND;
  }
  return EXAM_CANCEL_WORDS.some((word) => normalizeForMatch(word) === normalizedText);
}

/**
 * Check if a button click belongs to exam checker
 * @param {string} buttonId - Button ID
 * @returns {boolean}
 */
function isExamCheckerButton(buttonId) {
  return buttonId && buttonId.startsWith(EXAM_BUTTON_PREFIX);
}

/**
 * Check if user has an active exam session
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>}
 */
async function hasActiveExamSession(userId) {
  const state = await ExamCheckerOrchestrator.getSessionState(userId);
  return state.active;
}

/**
 * Is Rumi collecting this user's answer key? Every message there is an answer.
 * It is asked for every message while a name is pending, so a failed lookup
 * answers false and the message is read as the name, as before.
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>}
 */
async function isCollectingAnswerKey(userId) {
  try {
    const state = await ExamCheckerOrchestrator.getSessionState(userId);
    return state.active && state.state === SESSION_STATES.COLLECTING_ANSWERS;
  } catch (error) {
    logToFile('⚠️ Exam session lookup failed (non-fatal)', { userId, error: error.message });
    return false;
  }
}

/**
 * Handle text message for exam checker
 * @param {Object} message - WhatsApp message
 * @param {string} from - Phone number
 * @param {Object} user - User object
 * @returns {Promise<Object|null>} Response or null if not handled
 */
async function handleExamText(message, from, user) {
  if (!user) return null;

  const text = message.text?.body || '';
  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    const session = await ExamCheckerOrchestrator.getSessionState(user.id);
    const hasSession = session.active;

    // A cancel word leaves the session from any state, even with the switch off
    if (hasSession && isExamCancelCommand(text, session.state)) {
      return handleExamCancel(from, user);
    }

    if (!isExamCheckerEnabled()) {
      return null; // Switched off: no new sessions, and an open one is left alone
    }

    // Check for trigger keywords or active session
    const triggered = shouldTriggerExamChecker(text);

    if (!triggered && !hasSession) {
      return null; // Not for exam checker
    }

    // A session with no images yet holds nothing to lose. Ordinary chat ends it
    // quietly and goes on as ordinary chat instead of a "0 images" prompt.
    if (!triggered && session.state === SESSION_STATES.COLLECTING_IMAGES && !session.imageCount) {
      await ExamCheckerOrchestrator.cancelSession(session.sessionId);
      logToFile('📝 Empty exam session closed by ordinary chat', { userId: user.id, sessionId: session.sessionId });
      return null;
    }

    logToFile('📝 Exam checker text received', {
      userId: user.id,
      triggered,
      hasSession,
      textPreview: text.substring(0, 50)
    });

    // Start typing
    const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

    try {
      const response = await ExamCheckerOrchestrator.process(
        { type: 'text', text },
        user.id,
        from
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else if (response.flow) {
        // Slack/Discord have a real modal-workaround renderer for
        // exam_confirm — see the button-handler branch above for the full
        // rationale (trySendExamConfirmModalTrigger's own doc comment).
        const sentViaModal = await trySendExamConfirmModalTrigger(from, response.flow);
        if (!sentViaModal) {
          // data_exchange flow — pass the flow_token; the endpoint serves the
          // screen data on INIT. (Previously called a method that did not exist.)
          await WhatsAppService.sendFlow(from, {
            flowId: response.flow.id,
            flowToken: response.flow.flowToken,
            header: response.flow.header,
            body: response.flow.body,
            buttonText: response.flow.buttonText || 'Open',
            footer: 'Powered by Rumi',
          });
        }
      } else {
        await WhatsAppService.sendMessage(from, response.text);
      }

      return { handled: true };
    } catch (error) {
      typingController.stop();
      logToFile('❌ Exam checker error', { error: error.message, userId: user.id });

      await WhatsAppService.sendMessage(
        from,
        '❌ Sorry, something went wrong. Please try again by saying "check exams".'
      );

      return { handled: true, error: error.message };
    }
  });
}

/**
 * Handle image message for exam checker
 * @param {Object} message - WhatsApp message with image
 * @param {string} from - Phone number
 * @param {Object} user - User object
 * @returns {Promise<Object|null>} Response or null if not handled
 */
async function handleExamImage(message, from, user) {
  if (!user) return null;

  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    if (!isExamCheckerEnabled()) {
      return null; // Switched off: let image handler process it
    }

    // Check if user has active exam session
    const hasSession = await hasActiveExamSession(user.id);
    const caption = message.image?.caption?.toLowerCase() || '';

    // Check if this image is for exam checking
    const isForExam = hasSession || shouldTriggerExamChecker(caption, { caption: true });

    if (!isForExam) {
      return null; // Not for exam checker - let image handler process it
    }

    logToFile('📷 Exam checker image received', {
      userId: user.id,
      hasSession,
      hasCaption: !!message.image?.caption
    });

    // Start typing
    const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

    try {
      // Download and upload image to R2
      const imageId = message.image?.id;
      const mimeType = message.image?.mime_type || 'image/jpeg';

      const imageBuffer = await WhatsAppService.downloadMedia(imageId);
      const imageUrl = await uploadImageWithRetry(imageBuffer, user.id, imageId, mimeType);

      logToFile('📷 Exam image uploaded to R2', { imageUrl: redactUrl(imageUrl), userId: user.id });

      // Process through orchestrator
      const response = await ExamCheckerOrchestrator.process(
        {
          type: 'image',
          mediaUrl: imageUrl,
          caption: message.image?.caption
        },
        user.id,
        from
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else {
        await WhatsAppService.sendMessage(from, response.text);
      }

      return { handled: true };
    } catch (error) {
      typingController.stop();
      logToFile('❌ Exam image processing error', { error: error.message, userId: user.id });

      await WhatsAppService.sendMessage(
        from,
        '❌ Sorry, I had trouble processing that image. Please try again.'
      );

      return { handled: true, error: error.message };
    }
  });
}

/**
 * Handle button callback for exam checker
 * @param {string} buttonId - Button ID that was clicked
 * @param {string} from - Phone number
 * @param {Object} user - User object
 * @returns {Promise<Object|null>} Response or null if not handled
 */
async function handleExamButton(buttonId, from, user) {
  if (!user) return null;
  if (!isExamCheckerButton(buttonId)) return null;

  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    logToFile('🔘 Exam checker button clicked', { buttonId, userId: user.id });

    // Start typing
    const typingController = WhatsAppService.startContinuousTypingIndicator(from);

    try {
      const response = await ExamCheckerOrchestrator.process(
        { type: 'button', buttonId },
        user.id
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else if (response.flow) {
        // Slack/Discord have a real modal-workaround renderer for
        // exam_confirm (see slack-flow-registry.js / discord-flow-registry.js)
        // — sendFlow()'s Meta/Baileys-shaped {flowId, flowToken} contract is a
        // no-op stub on both. Tried first; falls through to sendFlow() only
        // for WhatsApp/Baileys (or if the modal-workaround send itself fails).
        const sentViaModal = await trySendExamConfirmModalTrigger(from, response.flow);
        if (!sentViaModal) {
          // data_exchange flow — pass the flow_token; the endpoint serves the
          // screen data on INIT. (Previously called a method that did not exist.)
          await WhatsAppService.sendFlow(from, {
            flowId: response.flow.id,
            flowToken: response.flow.flowToken,
            header: response.flow.header,
            body: response.flow.body,
            buttonText: response.flow.buttonText || 'Open',
            footer: 'Powered by Rumi',
          });
        }
      } else {
        await WhatsAppService.sendMessage(from, response.text);
      }

      return { handled: true };
    } catch (error) {
      typingController.stop();
      logToFile('❌ Exam button error', { error: error.message, buttonId, userId: user.id });

      await WhatsAppService.sendMessage(
        from,
        '❌ Sorry, something went wrong. Please try again.'
      );

      return { handled: true, error: error.message };
    }
  });
}

/**
 * Handle WhatsApp Flow response for exam checker
 * @param {string} flowId - Flow ID
 * @param {Object} response - Flow response data
 * @param {string} from - Phone number
 * @param {Object} user - User object
 * @returns {Promise<Object|null>} Response or null if not handled
 */
async function handleExamFlow(flowId, flowResponse, from, user) {
  if (!user) return null;

  // Check if this is an exam checker flow
  const examFlowIds = [
    'exam_checker_confirm_students',
    'exam_checker_edit_questions',
    'exam_checker_marking_scheme',
    process.env.EXAM_CHECKER_STUDENTS_FLOW_ID
  ].filter(Boolean);

  if (!examFlowIds.includes(flowId)) {
    return null; // Not an exam checker flow
  }

  const correlationId = generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    logToFile('📋 Exam checker flow response', { flowId, userId: user.id });

    // Start typing
    const typingController = WhatsAppService.startContinuousTypingIndicator(from);

    try {
      const response = await ExamCheckerOrchestrator.process(
        { type: 'flow', flowResponse },
        user.id,
        from
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else if (response.flow) {
        // Slack/Discord have a real modal-workaround renderer for
        // exam_confirm — see the button-handler branch above for the full
        // rationale (trySendExamConfirmModalTrigger's own doc comment).
        const sentViaModal = await trySendExamConfirmModalTrigger(from, response.flow);
        if (!sentViaModal) {
          // data_exchange flow — pass the flow_token; the endpoint serves the
          // screen data on INIT. (Previously called a method that did not exist.)
          await WhatsAppService.sendFlow(from, {
            flowId: response.flow.id,
            flowToken: response.flow.flowToken,
            header: response.flow.header,
            body: response.flow.body,
            buttonText: response.flow.buttonText || 'Open',
            footer: 'Powered by Rumi',
          });
        }
      } else {
        await WhatsAppService.sendMessage(from, response.text);
      }

      return { handled: true };
    } catch (error) {
      typingController.stop();
      logToFile('❌ Exam flow error', { error: error.message, flowId, userId: user.id });

      await WhatsAppService.sendMessage(
        from,
        '❌ Sorry, something went wrong. Please start over by saying "check exams".'
      );

      return { handled: true, error: error.message };
    }
  });
}

/**
 * Handle cancel command for exam checker
 * @param {string} from - Phone number
 * @param {Object} user - User object
 * @returns {Promise<Object>}
 */
async function handleExamCancel(from, user) {
  if (!user) return { handled: false };

  const state = await ExamCheckerOrchestrator.getSessionState(user.id);

  if (!state.active) {
    return { handled: false };
  }

  const response = await ExamCheckerOrchestrator.cancelSession(state.sessionId);
  await WhatsAppService.sendMessage(from, response.text);

  return { handled: true };
}

module.exports = {
  // Detection functions
  shouldTriggerExamChecker,
  isExamCancelCommand,
  isExamCheckerEnabled,
  isExamCheckerButton,
  hasActiveExamSession,
  isCollectingAnswerKey,

  // Handler functions
  handleExamText,
  handleExamImage,
  handleExamButton,
  handleExamFlow,
  handleExamCancel,

  // Constants
  EXAM_CHECK_KEYWORDS,
  EXAM_CANCEL_WORDS,
  EXAM_ANSWER_CANCEL_COMMAND,
  PHRASE_TRIGGER_MAX_WORDS,
  EXAM_BUTTON_PREFIX
};
