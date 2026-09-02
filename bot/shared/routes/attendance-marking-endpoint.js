/**
 * Attendance Marking Endpoint Handler
 *
 * The Slack/Discord modal-workaround counterpart to the WhatsApp attendance
 * marking Flow (docs/flows/attendance-marking-flow.json's CheckboxGroup).
 * Reuses the roster attendance-conversation.service.js's
 * handleMarkingMethodSelection('tap' branch) already loaded into Redis —
 * this endpoint only reads that session by userId, it never re-queries
 * the class roster itself.
 *
 * Flow:
 * 1. INIT → MARK_ABSENT screen (roster from the existing Redis session)
 * 2. MARK_ABSENT submit → build records, SUCCESS screen
 *
 * Created: 2026-08-25
 */

const AttendanceConversationService = require('../services/attendance-conversation.service');
const AttendanceFlowHandler = require('../handlers/attendance-flow.handler');
const AttendanceGeneratorService = require('../services/attendance-generator.service');
const { logToFile } = require('../utils/logger');

/**
 * Handle INIT action - provide the MARK_ABSENT screen from the existing
 * attendance-conversation session (already loaded when the teacher picked
 * "Tap to Mark").
 * @param {string} userId - User ID
 * @returns {Object} - Response with the roster, or an error if no session
 */
async function handleMarkingInit(userId) {
  const sessionState = await AttendanceConversationService.getSessionState(userId);
  const students = sessionState?.students || [];

  if (!sessionState || students.length === 0) {
    logToFile('⚠️ Marking flow INIT with no active session', { userId });
    return { data: { error: { message: 'No attendance session found. Say "attendance" to start again.' } } };
  }

  return {
    screen: 'MARK_ABSENT',
    data: {
      students: students.map((s) => ({ id: s.id, title: s.student_name })),
      class_display: AttendanceConversationService.formatClassDisplayName(sessionState.selectedClass),
    },
  };
}

/**
 * Handle MARK_ABSENT submission - builds attendance records from the
 * checked (absent) student ids, everyone else is present.
 * @param {string} userId - User ID
 * @param {string} screen - Current screen ID
 * @param {Object} screenData - { absent_student_ids: string[] }
 * @returns {Object} - SUCCESS screen with records/stats for onFinish delivery
 */
async function handleMarkingExchange(userId, screen, screenData) {
  if (screen !== 'MARK_ABSENT') {
    return { data: { error: { message: 'Unknown screen' } } };
  }

  const sessionState = await AttendanceConversationService.getSessionState(userId);
  if (!sessionState || !sessionState.students) {
    return { data: { error: { message: 'Session expired. Say "attendance" to start again.' } } };
  }

  const absentIds = screenData.absent_student_ids || [];
  const records = AttendanceFlowHandler.buildAttendanceRecords(sessionState.students, absentIds);
  const stats = AttendanceGeneratorService.calculateSummaryStats(records);
  const classDisplay = AttendanceConversationService.formatClassDisplayName(sessionState.selectedClass);

  logToFile('📋 Slack tap-to-mark submitted', {
    userId,
    listId: sessionState.selectedListId,
    total: stats.total,
    present: stats.present,
    absent: stats.absent
  });

  return {
    screen: 'SUCCESS',
    data: {
      success_message: AttendanceFlowHandler.generateConfirmationMessage(classDisplay, stats),
      selectedClass: sessionState.selectedClass,
      selectedListId: sessionState.selectedListId,
      records,
      stats,
      sessionDate: sessionState.selectedDate,
      sessionType: sessionState.sessionType
    }
  };
}

module.exports = { handleMarkingInit, handleMarkingExchange };
