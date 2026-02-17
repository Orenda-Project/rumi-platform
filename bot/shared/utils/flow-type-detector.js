/**
 * Flow Type Detector
 *
 * Determines the type of WhatsApp Flow from the webhook's response_json fields.
 * Used by whatsapp-bot.js to route nfm_reply messages to the correct handler.
 *
 * Flow types:
 * - reading_assessment: Reading assessment flow (Student_Full_Name, Assessment_Mode)
 * - attendance_setup: Class setup flow (class_name + student_list/students_text)
 * - attendance_marking: Attendance marking flow (absent_students or attendance flow_token)
 * - registration: User registration flow (full_name + country, or :registration: in flow_token)
 * - unknown: Unrecognized flow
 *
 * Detection priority (order matters):
 * 1. Reading assessment (most specific fields)
 * 2. Registration (check BEFORE attendance to avoid flow_token collision)
 * 3. Attendance setup
 * 4. Attendance marking
 * 5. Unknown
 *
 * Bead: bd-387
 * Created: February 11, 2026
 */

/**
 * Detect the flow type from webhook response_json fields
 *
 * @param {Object} responseJson - Parsed response_json from nfm_reply
 * @returns {string} - Flow type: 'reading_assessment' | 'attendance_setup' | 'attendance_marking' | 'registration' | 'unknown'
 */
function detectFlowType(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') {
    return 'unknown';
  }

  // 1. Reading Assessment (highest priority - unique fields)
  const hasReadingFields = responseJson.screen_0_Student_Full_Name_0 ||
                           responseJson.screen_0_Select_the_reading_level_2 ||
                           responseJson.Student_Full_Name ||
                           responseJson.Assessment_Mode;

  if (hasReadingFields) {
    return 'reading_assessment';
  }

  // 2. Registration (check BEFORE attendance to prevent flow_token collision)
  // Registration flow_token format: userId:registration:timestamp
  const isRegistrationByToken = responseJson.flow_token?.includes(':registration:');
  const hasRegistrationFields = responseJson.full_name !== undefined &&
                                responseJson.country !== undefined;

  if (isRegistrationByToken || hasRegistrationFields) {
    return 'registration';
  }

  // 3. Attendance Setup (class creation)
  // Navigate-based format: class_name + student_list/students_text
  // Endpoint-based format (bd-390): list_id + class_display (from extension_message_response.params)
  const hasNavigateSetupFields = responseJson.class_name &&
                                 (responseJson.student_list || responseJson.students_text);
  const hasEndpointSetupFields = responseJson.list_id && responseJson.class_display;

  if (hasNavigateSetupFields || hasEndpointSetupFields) {
    return 'attendance_setup';
  }

  // 4. Attendance Marking (tap-to-mark absent)
  // flow_token format: userId:classId:date:sessionType:encodedClassName
  // MUST NOT match registration tokens (which contain :registration:)
  const hasAttendanceMarkingFields = responseJson.absent_students !== undefined ||
    (responseJson.flow_token?.includes(':') && !responseJson.flow_token?.includes(':registration:'));

  if (hasAttendanceMarkingFields) {
    return 'attendance_marking';
  }

  return 'unknown';
}

module.exports = { detectFlowType };
