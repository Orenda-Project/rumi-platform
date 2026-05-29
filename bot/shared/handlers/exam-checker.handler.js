/**
 * Exam Checker Handler
 *
 * Routes WhatsApp messages to the Exam Checker Orchestrator.
 * Handles text commands, image uploads, button responses, and WhatsApp Flows.
 *
 * Created: 2026-01-24
 */

const { ExamCheckerOrchestrator, ExamSessionService } = require('../services/exam-checker');
const WhatsAppService = require('../services/whatsapp.service');
const { uploadImageWithRetry } = require('../storage/r2');
const { logToFile } = require('../utils/logger');
const { runWithCorrelation, generateCorrelationId } = require('../utils/structured-logger');

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

/**
 * Check if a text message should trigger exam checker
 * @param {string} text - Message text
 * @returns {boolean}
 */
function shouldTriggerExamChecker(text) {
  if (!text) return false;
  const normalizedText = text.toLowerCase().trim();

  for (const keyword of EXAM_CHECK_KEYWORDS) {
    if (normalizedText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
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
    // Check for trigger keywords or active session
    const triggered = shouldTriggerExamChecker(text);
    const hasSession = await hasActiveExamSession(user.id);

    if (!triggered && !hasSession) {
      return null; // Not for exam checker
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
        user.id
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else if (response.flow) {
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
    // Check if user has active exam session
    const hasSession = await hasActiveExamSession(user.id);
    const caption = message.image?.caption?.toLowerCase() || '';

    // Check if this image is for exam checking
    const isForExam = hasSession || shouldTriggerExamChecker(caption);

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

      logToFile('📷 Exam image uploaded to R2', { imageUrl, userId: user.id });

      // Process through orchestrator
      const response = await ExamCheckerOrchestrator.process(
        {
          type: 'image',
          mediaUrl: imageUrl,
          caption: message.image?.caption
        },
        user.id
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
        user.id
      );

      typingController.stop();

      // Send response
      if (response.interactive) {
        await WhatsAppService.sendInteractiveMessage(from, response.interactive);
      } else if (response.flow) {
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
  isExamCheckerButton,
  hasActiveExamSession,

  // Handler functions
  handleExamText,
  handleExamImage,
  handleExamButton,
  handleExamFlow,
  handleExamCancel,

  // Constants
  EXAM_CHECK_KEYWORDS,
  EXAM_BUTTON_PREFIX
};
