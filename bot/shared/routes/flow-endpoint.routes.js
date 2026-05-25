/**
 * WhatsApp Flow Endpoint Routes
 *
 * Handles encrypted data exchange for WhatsApp Flows with data_api_version 3.0+
 *
 * Endpoints:
 * - POST /api/flows/attendance-marking - Handle attendance marking flow data requests
 * - POST /api/flows/attendance-setup - Handle attendance setup flow with student entry loops (bd-215)
 * - POST /api/flows/registration - Handle registration flow data requests (bd-384: PROJ-010)
 *
 * Bead: bd-186, bd-384
 * Created: January 25, 2026
 * Updated: February 17, 2026 (bd-396: Registration Flow v3 added)
 */

const express = require('express');
const router = express.Router();
const FlowEncryptionService = require('../services/flow-encryption.service');
const StudentListService = require('../services/student-list.service');
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const {
  handleSetupInit,
  handleSetupDataExchange,
  getStudentListSummary,
  formatStudentsListString
} = require('./attendance-setup-endpoint');
const {
  handleRegistrationInit,
  handleRegistrationDataExchange,
  handleRegistrationBack
} = require('./registration-endpoint');
const {
  handlePicLpInit,
  handlePicLpDataExchange,
  handlePicLpBack
} = require('./pic-lp-endpoint');

/**
 * Handle attendance marking flow data requests
 *
 * Actions:
 * - ping: Health check
 * - INIT: Initialize flow with student data
 * - data_exchange: Not used for this flow (no dynamic updates needed)
 */
router.post('/attendance-marking', async (req, res) => {
  try {
    // Check if encryption is configured
    if (!FlowEncryptionService.isConfigured()) {
      logToFile('Flow encryption not configured', { endpoint: 'attendance-marking' });
      return res.status(500).json({ error: 'Flow encryption not configured' });
    }

    const encryptedRequest = req.body;

    // Process encrypted request
    const encryptedResponse = await FlowEncryptionService.processEncryptedRequest(
      encryptedRequest,
      async (decryptedData) => {
        return await handleAttendanceMarkingRequest(decryptedData);
      }
    );

    // Return encrypted response as plain text (Base64)
    res.set('Content-Type', 'text/plain');
    res.send(encryptedResponse);
  } catch (error) {
    logToFile('Flow endpoint error', {
      endpoint: 'attendance-marking',
      error: error.message,
      stack: error.stack,
    });

    // Return error in expected format
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Handle decrypted attendance marking request
 * @param {Object} data - Decrypted request data
 * @returns {Object} - Response to encrypt
 */
async function handleAttendanceMarkingRequest(data) {
  const { action, flow_token, screen, data: screenData } = data;

  logToFile('Handling attendance marking request', {
    action,
    screen,
    hasFlowToken: !!flow_token,
  });

  // Handle ping (health check)
  if (action === 'ping') {
    return FlowEncryptionService.handlePing();
  }

  // Handle INIT - provide student list for the flow
  if (action === 'INIT') {
    return await handleInit(flow_token, screenData);
  }

  // Handle data_exchange - process form submission
  if (action === 'data_exchange') {
    return await handleDataExchange(flow_token, screen, screenData);
  }

  // Handle BACK navigation
  if (action === 'BACK') {
    return {
      screen: 'MARK_ABSENT',
      data: {},
    };
  }

  // Unknown action
  logToFile('Unknown flow action', { action });
  return FlowEncryptionService.createErrorResponse('Unknown action');
}

/**
 * Handle INIT action - provide initial data for the flow
 * @param {string} flowToken - Flow token containing user/class info
 * @param {Object} screenData - Initial screen data
 * @returns {Object} - Response with student list
 */
async function handleInit(flowToken, screenData) {
  try {
    // Parse flow token to get user ID and class info (bd-193)
    // Flow token format: "userId:classId:date:sessionType:encodedClassName"
    const tokenParts = (flowToken || '').split(':');
    const [userId, classId, dateStr, sessionType, encodedClassName] = tokenParts;

    if (!userId || !classId) {
      logToFile('Invalid flow token', { flowToken });
      return FlowEncryptionService.createErrorResponse('Invalid flow token');
    }

    // Get student list for the class (bd-192: fixed method name)
    const { data: students, error: studentsError } = await StudentListService.getStudentsByList(classId);

    if (studentsError || !students || students.length === 0) {
      logToFile('No students found for class', { classId, error: studentsError?.message });
      return FlowEncryptionService.createErrorResponse('No students found for this class');
    }

    // Get class info (fallback if not in token)
    const classInfo = await StudentListService.getStudentListById(classId);
    const className = encodedClassName ? decodeURIComponent(encodedClassName) : (classInfo?.class_name || 'Class');

    // Format session type for display - include "Session:" prefix (bd-194)
    // The Flow's "Session: ${data.session_type}" concatenation has binding issues
    // So we include the prefix in the value and update Flow to use just ${data.session_type}
    const sessionTypeDisplay = sessionType === 'morning' ? 'Session: Morning' :
                               sessionType === 'afternoon' ? 'Session: Afternoon' :
                               `Session: ${sessionType || 'Full Day'}`;

    // Format date for display
    const date = dateStr ? new Date(dateStr) : new Date();
    const dateDisplay = date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Format students for CheckboxGroup (id, title format)
    // Note: field is student_name not name (bd-192)
    const formattedStudents = students.map((student, index) => ({
      id: student.id,
      title: `${index + 1}. ${student.student_name}`,
    }));

    logToFile('Providing student list for flow', {
      userId,
      classId,
      sessionType,
      studentCount: formattedStudents.length,
    });

    return {
      screen: 'MARK_ABSENT',
      data: {
        class_name: className,
        date_display: dateDisplay,
        session_type: sessionTypeDisplay,
        students: formattedStudents,
      },
    };
  } catch (error) {
    logToFile('Error in flow INIT', { error: error.message });
    return FlowEncryptionService.createErrorResponse('Failed to load students');
  }
}

/**
 * Handle data_exchange action - process form submission
 * @param {string} flowToken - Flow token
 * @param {string} screen - Current screen ID
 * @param {Object} screenData - Screen form data
 * @returns {Object} - Response
 */
async function handleDataExchange(flowToken, screen, screenData) {
  // For MARK_ABSENT screen, the response contains the absent student IDs
  if (screen === 'MARK_ABSENT') {
    const absentStudentIds = screenData?.absent_students || [];

    logToFile('Flow marking submission', {
      flowToken,
      absentCount: absentStudentIds.length,
    });

    // Close the flow - the webhook will handle the actual database update
    return {
      screen: 'SUCCESS',
      data: {
        extension_message_response: {
          params: {
            flow_token: flowToken,
            absent_students: absentStudentIds,
          },
        },
      },
    };
  }

  return FlowEncryptionService.createErrorResponse('Unknown screen');
}

/**
 * Handle attendance setup flow data requests (bd-215)
 *
 * Actions:
 * - ping: Health check
 * - INIT: Initialize flow with CLASS_INFO screen
 * - data_exchange: Handle screen submissions (CLASS_INFO → ADD_STUDENT → SUCCESS)
 */
router.post('/attendance-setup', async (req, res) => {
  try {
    // Check if encryption is configured
    if (!FlowEncryptionService.isConfigured()) {
      logToFile('Flow encryption not configured', { endpoint: 'attendance-setup' });
      return res.status(500).json({ error: 'Flow encryption not configured' });
    }

    const encryptedRequest = req.body;

    // Process encrypted request
    const encryptedResponse = await FlowEncryptionService.processEncryptedRequest(
      encryptedRequest,
      async (decryptedData) => {
        return await handleAttendanceSetupRequest(decryptedData);
      }
    );

    // Return encrypted response as plain text (Base64)
    res.set('Content-Type', 'text/plain');
    res.send(encryptedResponse);
  } catch (error) {
    logToFile('Flow endpoint error', {
      endpoint: 'attendance-setup',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Handle decrypted attendance setup request
 * @param {Object} data - Decrypted request data
 * @returns {Object} - Response to encrypt
 */
async function handleAttendanceSetupRequest(data) {
  const { action, flow_token, screen, data: screenData } = data;

  logToFile('Handling attendance setup request', {
    action,
    screen,
    hasFlowToken: !!flow_token,
  });

  let response;

  // Handle ping (health check)
  if (action === 'ping') {
    response = FlowEncryptionService.handlePing();
    logToFile('📤 Returning ping response', { response });
    return response;
  }

  // Parse flow token to get user ID
  // Flow token format: "userId" or "userId:otherInfo"
  const userId = (flow_token || '').split(':')[0];

  // Handle INIT - provide CLASS_INFO screen (check both cases)
  if (action === 'INIT' || action === 'init') {
    response = await handleSetupInit(userId);
    logToFile('📤 Returning INIT response', { response: JSON.stringify(response) });
    return response;
  }

  // Handle data_exchange - process form submissions
  if (action === 'data_exchange') {
    response = await handleSetupDataExchange(userId, screen, screenData);
    logToFile('📤 Returning data_exchange response', {
      screen: response?.screen,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      responsePreview: JSON.stringify(response).substring(0, 500)
    });
    return response;
  }

  // Handle BACK navigation
  if (action === 'BACK') {
    if (screen === 'ADD_STUDENT') {
      // Can't go back from ADD_STUDENT (class already created)
      // Fetch current class data to populate screen (bd-215 fix)
      try {
        // Get the most recent active class for this user
        const { data: recentClass } = await supabase
          .from('student_lists')
          .select('id, class_name, section')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (recentClass) {
          const classDisplay = recentClass.section
            ? `${recentClass.class_name} - ${recentClass.section}`
            : recentClass.class_name;

          // Get students for this class
          const { data: students } = await supabase
            .from('students')
            .select('id, student_name, father_name, roll_number')
            .eq('list_id', recentClass.id)
            .eq('is_active', true)
            .order('roll_number');

          const studentCount = students?.length || 0;
          const studentsSummary = getStudentListSummary(students || []);

          // bd-388: Include pre-composed strings for pure dynamic references
          const classInfo = `Class: ${classDisplay} | Students: ${studentCount}`;
          const heading = `Add Student #${studentCount + 1}`;
          const studentsList = formatStudentsListString(studentsSummary);

          response = {
            screen: 'ADD_STUDENT',
            data: {
              list_id: recentClass.id,
              class_display: classDisplay,
              student_count: studentCount,
              students_added: studentsSummary,
              student_number: studentCount + 1,
              class_info: classInfo,
              heading: heading,
              students_list: studentsList,
              // bd-389: Form-level init-values to clear TextInput fields
              form_init_values: { first_name: '', last_name: '' }
            }
          };
          logToFile('📤 Returning BACK response with data (staying on ADD_STUDENT)', { response: JSON.stringify(response) });
          return response;
        }
      } catch (err) {
        logToFile('❌ Error fetching class data for BACK', { error: err.message });
      }

      // Fallback if no class found
      response = {
        screen: 'ADD_STUDENT',
        data: {
          list_id: '',
          class_display: 'Unknown',
          student_count: 0,
          students_added: [],
          student_number: 1,
          class_info: 'Class: Unknown | Students: 0',
          heading: 'Add Student #1',
          students_list: '',
          // bd-389: Form-level init-values to clear TextInput fields
          form_init_values: { first_name: '', last_name: '' }
        }
      };
      logToFile('📤 Returning BACK response with fallback data', { response: JSON.stringify(response) });
      return response;
    }
    response = {
      screen: 'CLASS_INFO',
      data: {},
    };
    logToFile('📤 Returning BACK response (to CLASS_INFO)', { response });
    return response;
  }

  // Unknown action
  logToFile('Unknown flow action', { action });
  return FlowEncryptionService.createErrorResponse('Unknown action');
}

/**
 * Handle registration flow data requests (bd-384: PROJ-010)
 *
 * Actions:
 * - ping: Health check
 * - INIT: Initialize flow with PERSONAL_INFO screen
 * - data_exchange: Handle screen submissions (PERSONAL_INFO → PROFESSIONAL_INFO → SUCCESS)
 * - BACK: Navigate to previous screen
 */
router.post('/registration', async (req, res) => {
  try {
    if (!FlowEncryptionService.isConfigured()) {
      logToFile('Flow encryption not configured', { endpoint: 'registration' });
      return res.status(500).json({ error: 'Flow encryption not configured' });
    }

    const encryptedRequest = req.body;

    const encryptedResponse = await FlowEncryptionService.processEncryptedRequest(
      encryptedRequest,
      async (decryptedData) => {
        return await handleRegistrationRequest(decryptedData);
      }
    );

    res.set('Content-Type', 'text/plain');
    res.send(encryptedResponse);
  } catch (error) {
    logToFile('Flow endpoint error', {
      endpoint: 'registration',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Handle decrypted registration request
 * @param {Object} data - Decrypted request data
 * @returns {Object} - Response to encrypt
 */
async function handleRegistrationRequest(data) {
  const { action, flow_token, screen, data: screenData } = data;

  logToFile('Handling registration request', {
    action,
    screen,
    hasFlowToken: !!flow_token,
    screenDataKeys: screenData ? Object.keys(screenData) : []
  });

  let response;

  // Handle ping (health check)
  if (action === 'ping') {
    response = FlowEncryptionService.handlePing();
    logToFile('📤 Returning ping response', { response });
    return response;
  }

  // Parse flow token to get user ID
  // Flow token format: "userId:registration:timestamp"
  const userId = (flow_token || '').split(':')[0];

  // Handle INIT (check both cases - learned from attendance bugs)
  if (action === 'INIT' || action === 'init') {
    response = await handleRegistrationInit(userId);
    logToFile('📤 Returning INIT response', { response: JSON.stringify(response) });
    return response;
  }

  // Handle data_exchange
  if (action === 'data_exchange') {
    response = await handleRegistrationDataExchange(userId, screen, screenData, flow_token);
    logToFile('📤 Returning data_exchange response', {
      screen: response?.screen,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      responsePreview: JSON.stringify(response).substring(0, 500)
    });
    return response;
  }

  // Handle BACK navigation
  if (action === 'BACK') {
    response = await handleRegistrationBack(userId, screen, flow_token);
    logToFile('📤 Returning BACK response', { response: JSON.stringify(response) });
    return response;
  }

  // Unknown action
  logToFile('Unknown flow action', { action });
  return FlowEncryptionService.createErrorResponse('Unknown action');
}

/**
 * POST /api/flows/pic-lp — Pic-to-LP confirmation Flow data endpoint.
 * Single-screen form (PIC_LP_FORM → SUCCESS); the teacher confirms
 * grade/subject/topic/language and LP generation fires in the background.
 */
router.post('/pic-lp', async (req, res) => {
  try {
    if (!FlowEncryptionService.isConfigured()) {
      logToFile('Flow encryption not configured', { endpoint: 'pic-lp' });
      return res.status(500).json({ error: 'Flow encryption not configured' });
    }

    const encryptedResponse = await FlowEncryptionService.processEncryptedRequest(
      req.body,
      async (decryptedData) => {
        return await handlePicLpRequest(decryptedData);
      }
    );

    res.set('Content-Type', 'text/plain');
    res.send(encryptedResponse);
  } catch (error) {
    logToFile('Flow endpoint error', {
      endpoint: 'pic-lp',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle decrypted pic-LP flow request. Routes by action; the flow_token
 * (format "pic_lp_form_<sessionId>") is passed straight through to the
 * endpoint handlers, which resolve the session via getByFlowToken.
 */
async function handlePicLpRequest(data) {
  const { action, flow_token, screen, data: screenData } = data;

  logToFile('Handling pic-LP flow request', {
    action,
    screen,
    hasFlowToken: !!flow_token,
  });

  if (action === 'ping') {
    return FlowEncryptionService.handlePing();
  }
  if (action === 'INIT' || action === 'init') {
    return await handlePicLpInit(flow_token);
  }
  if (action === 'data_exchange') {
    return await handlePicLpDataExchange(flow_token, screen, screenData);
  }
  if (action === 'BACK') {
    return await handlePicLpBack(flow_token);
  }

  logToFile('Unknown flow action', { action });
  return FlowEncryptionService.createErrorResponse('Unknown action');
}

module.exports = router;
