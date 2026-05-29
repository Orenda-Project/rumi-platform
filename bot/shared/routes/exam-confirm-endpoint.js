/**
 * Exam-Checker "Confirm Students" Flow endpoint handlers.
 *
 * data_exchange (data_api_version 3.0) flow, modelled on the attendance-marking
 * endpoint. The flow_token IS the exam session id (set at launch by the
 * orchestrator via sendFlow({ flowId, flowToken: session.id })).
 *
 *   INIT          → load the session's detected_students, render them as a
 *                   CheckboxGroup on the CONFIRM_STUDENTS screen.
 *   data_exchange → the teacher submitted the form. `confirmed_students` is the
 *                   array of selected option ids (stringified detected-student
 *                   indices). Map them back to the full detected-student objects
 *                   and return them in the SUCCESS screen's
 *                   extension_message_response so the completion NFM carries the
 *                   confirmed student objects the grader needs.
 *
 * The completion NFM is routed by flow-response.handler → ExamCheckerHandler
 * .handleExamFlow → orchestrator.handleStudentConfirmation, which reads
 * message.flowResponse.confirmed_students.
 */

const FlowEncryptionService = require('../services/flow-encryption.service');
const { logToFile } = require('../utils/logger');

const SCREEN = 'CONFIRM_STUDENTS';

/** Load the session's detected students (or null). */
async function _loadDetectedStudents(sessionId) {
  if (!sessionId) return null;
  const ExamSessionService = require('../services/exam-checker/exam-session.service');
  const session = await ExamSessionService.getById(sessionId);
  if (!session) return null;
  return session.detected_students || [];
}

/** Render the CONFIRM_STUDENTS screen from the session's detected students. */
async function handleExamConfirmInit(flow_token) {
  const detected = await _loadDetectedStudents(flow_token);
  if (!detected) {
    return FlowEncryptionService.createErrorResponse('Exam session not found or expired');
  }
  if (detected.length === 0) {
    return FlowEncryptionService.createErrorResponse('No students were detected in these exams');
  }

  // CheckboxGroup options: id = stringified index (stable handle back to the
  // detected-student object), title = "N. Name".
  const students = detected.map((s, i) => ({
    id: String(i),
    title: `${i + 1}. ${s.name || 'Unnamed student'}`,
  }));

  return {
    screen: SCREEN,
    data: {
      heading: `I found ${students.length} student${students.length !== 1 ? 's' : ''}`,
      subheading: "Uncheck any name that isn't a real student, then tap Confirm & Grade.",
      students,
    },
  };
}

/**
 * Handle the form submission. Passes the selected option ids straight through
 * in the completion payload as a STRING ARRAY (WhatsApp Flow completion params
 * round-trip reliably for string arrays — same shape attendance uses for
 * absent_students; arrays of objects are risky). The orchestrator maps these
 * ids back to the full detected-student objects via session.detected_students.
 */
async function handleExamConfirmDataExchange(flow_token, screen, screenData = {}) {
  const selectedIds = Array.isArray(screenData?.confirmed_students)
    ? screenData.confirmed_students.map(String)
    : [];

  logToFile('📋 Exam confirm-students submission', {
    sessionId: flow_token,
    confirmed: selectedIds.length,
  });

  return {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: {
          flow_token,
          confirmed_students: selectedIds,
        },
      },
    },
  };
}

/** BACK re-renders the confirm screen. */
async function handleExamConfirmBack(flow_token) {
  return handleExamConfirmInit(flow_token);
}

module.exports = {
  handleExamConfirmInit,
  handleExamConfirmDataExchange,
  handleExamConfirmBack,
};
