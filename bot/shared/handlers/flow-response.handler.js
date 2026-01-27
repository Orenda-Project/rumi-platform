/**
 * WhatsApp Flow Response Handler
 * Handles responses from WhatsApp Flow templates
 *
 * Current Flows:
 * 1. Registration Flow (handled in registration.service.js)
 * 2. Reading Assessment Flow (ID: 819028084215847) - handled here
 * 3. Attendance Setup Flow - class setup for first-time users
 * 4. Attendance Marking Flow - tap-to-mark absent students
 *
 * Flow Response Structure:
 * {
 *   "type": "interactive",
 *   "interactive": {
 *     "type": "nfm_reply",
 *     "nfm_reply": {
 *       "response_json": "{...field data...}",
 *       "name": "flow_{flowId}",
 *       "body": "Submitted"
 *     }
 *   }
 * }
 */

const supabase = require('../config/supabase');
const PassageGenerationService = require('../services/reading/passage-generation.service');
const AutoLevelOrchestratorService = require('../services/reading/auto-level-orchestrator.service');
const WhatsAppService = require('../services/whatsapp.service');
const AttendanceFlowHandler = require('./attendance-flow.handler');
const AttendanceDeliveryService = require('../services/attendance-delivery.service');
const { logToFile } = require('../utils/logger');

// Flow IDs - configurable via env for staging vs production
// Production: 1432151735009021, Staging: 870222682369657
const READING_ASSESSMENT_FLOW_ID = process.env.READING_ASSESSMENT_FLOW_ID || '1432151735009021';

// Attendance Flow IDs (bd-058)
const ATTENDANCE_SETUP_FLOW_ID = process.env.ATTENDANCE_SETUP_FLOW_ID || '';
const ATTENDANCE_MARKING_FLOW_ID = process.env.ATTENDANCE_MARKING_FLOW_ID || '';

/**
 * Route flow responses to appropriate handlers
 * @param {object} message - WhatsApp message object with interactive.nfm_reply
 * @param {string} phoneNumber - User's phone number
 * @param {string} userId - User's database ID
 * @returns {Promise<boolean>} Success status
 */
async function handleFlowResponse(message, phoneNumber, userId) {
  try {
    // Extract flow ID from response
    const flowName = message.interactive?.nfm_reply?.name || '';
    const flowId = flowName.replace('flow_', '');

    logToFile('📋 Processing flow response', {
      phoneNumber,
      userId,
      flowName,
      flowId
    });

    // Route to appropriate handler based on flow ID
    if (flowId === READING_ASSESSMENT_FLOW_ID) {
      return await handleReadingAssessmentFlow(message, phoneNumber, userId);
    }

    // Attendance flows (bd-058)
    if (flowId === ATTENDANCE_SETUP_FLOW_ID && ATTENDANCE_SETUP_FLOW_ID) {
      return await handleAttendanceSetupFlow(message, phoneNumber, userId);
    }

    if (flowId === ATTENDANCE_MARKING_FLOW_ID && ATTENDANCE_MARKING_FLOW_ID) {
      return await handleAttendanceMarkingFlow(message, phoneNumber, userId);
    }

    logToFile('⚠️ Unknown flow ID', { flowId, flowName });
    return false;
  } catch (error) {
    logToFile('❌ Error handling flow response', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Handle Reading Assessment Flow submission
 * @param {object} message - Flow response message
 * @param {string} phoneNumber - User's phone number
 * @param {string} userId - User's database ID
 * @returns {Promise<boolean>} Success status
 */
async function handleReadingAssessmentFlow(message, phoneNumber, userId) {
  try {
    logToFile('📚 Processing reading assessment flow submission', { phoneNumber, userId });

    // Parse response JSON
    const responseJson = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}');

    logToFile('📋 Full flow response_json:', { responseJson });

    // Extract fields using actual field names from flow
    // Support BOTH v1 (screen_0_Field_0) and v2 (Field) formats
    //
    // v1 field names (confirmed from submission 2025-11-17T18:42:57Z):
    // - screen_0_Student_Full_Name_0: "Saadat Manto"
    // - screen_0_Language_1: "0_English"
    // - screen_0_Select_the_reading_level_2: "2_Sentences_(Grade_1-2)"
    // - screen_0_Scope_of_Assessment__3: "1_Fluency_+_Comprehension"
    //
    // v2 field names (Flow v2 Dec 2025, ID: 870222682369657):
    // - Student_Full_Name: "Test Student"
    // - Language: "0_English"
    // - Assessment_Mode: "0_Auto" or "1_Manual"
    // - Select_the_reading_level: "2_Sentences_(Grade_1-2)"
    // - Scope_of_Assessment_: "0_Fluency_Only"

    // 1. Extract student name (direct string) - check both v1 and v2
    const studentName = responseJson.screen_0_Student_Full_Name_0 ||
                        responseJson.Student_Full_Name || '';

    // 2. Extract language (parse "index_label" format) - check both v1 and v2
    const languageRaw = responseJson.screen_0_Language_1 ||
                        responseJson.Language || '';
    const languageParts = languageRaw.split('_'); // ["0", "English"] or ["1", "Urdu"]
    const languageLabel = languageParts.length > 1 ? languageParts.slice(1).join('_') : languageRaw;
    const language = languageLabel.toLowerCase() === 'english' ? 'en' : 'ur';

    // 3. Extract reading level (parse "index_label_details" format) - check both v1 and v2
    const levelRaw = responseJson.screen_0_Select_the_reading_level_2 ||
                     responseJson.Select_the_reading_level || '';
    const levelMatch = levelRaw.match(/^(\d+)_/); // Extract first number: "2_Sentences..." → "2"
    const levelIndex = levelMatch ? levelMatch[1] : '0';
    // Map indices: 0→letters, 1→words, 2→sentences, 3→paragraph

    // 4. Extract comprehension scope (parse "index_label" format) - check both v1 and v2
    const scopeRaw = responseJson.screen_0_Scope_of_Assessment__3 ||
                     responseJson.Scope_of_Assessment_ || '';
    const comprehensionRequired = scopeRaw.includes('Comprehension');

    // 5. Extract assessment mode (Auto/Manual) - check both v1 and v2
    // v1: screen_0_Assessment_Mode_4, v2: Assessment_Mode
    // Values: "0_Auto" or "1_Manual"
    const assessmentModeRaw = responseJson.screen_0_Assessment_Mode_4 ||
                              responseJson.screen_0_Assessment_Type_4 ||
                              responseJson.Assessment_Mode ||
                              responseJson.assessment_mode || '';
    const isAutoMode = assessmentModeRaw.toLowerCase().includes('auto');

    logToFile('📋 Extracted values:', {
      studentName,
      languageRaw,
      language,
      levelRaw,
      levelIndex,
      scopeRaw,
      comprehensionRequired,
      assessmentModeRaw,
      isAutoMode,
      allFields: Object.keys(responseJson).filter(k => k !== 'flow_token')
    });

    // VALIDATION: Check for required fields
    if (!studentName || studentName.trim() === '') {
      throw new Error('Missing required field: Student Name');
    }

    if (!language || !['en', 'ur'].includes(language.toLowerCase())) {
      throw new Error(`Invalid or missing language: ${language}`);
    }

    // For manual mode, level is required; for auto mode, we start at story
    if (!isAutoMode && (!levelIndex || levelIndex.trim() === '')) {
      throw new Error('Missing required field: Level/Grade');
    }

    // Map level index to passage type
    // levelIndex: 0→letters, 1→words, 2→sentences, 3→paragraph
    // For auto mode: always start at story
    let passageType, gradeNumeric;

    if (isAutoMode) {
      // Auto mode: Start at story level (highest complexity)
      passageType = 'story';
      gradeNumeric = 4; // Story level
    } else {
      // Manual mode: Use selected level
      const levelMapping = {
        '0': { passageType: 'letters', gradeNumeric: 0 },    // Kindergarten
        '1': { passageType: 'words', gradeNumeric: 1 },      // Grade 1
        '2': { passageType: 'sentences', gradeNumeric: 2 },  // Grade 1-2
        '3': { passageType: 'paragraph', gradeNumeric: 3 }   // Grade 3-5
      };

      const mapped = levelMapping[levelIndex] || { passageType: 'paragraph', gradeNumeric: 2 };
      passageType = mapped.passageType;
      gradeNumeric = mapped.gradeNumeric;
    }

    logToFile('✅ Validated and mapped:', {
      studentName,
      language,
      levelIndex,
      levelRaw,
      passageType,
      gradeNumeric,
      comprehensionRequired,
      isAutoMode
    });

    // Map passage type to word count (based on existing gradeMap)
    const wordCountMap = {
      'letters': 14,
      'words': 14,
      'sentences': 40,
      'paragraph': 60,
      'story': 100
    };

    const wordCount = wordCountMap[passageType] || 50;

    // Create passageConfig for passage generation service
    const passageConfig = {
      type: passageType,
      wordCount: wordCount,
      grade: gradeNumeric
    };

    // Create assessment record FIRST (required for passage generation)
    const { data: assessment, error: insertError } = await supabase
      .from('reading_assessments')
      .insert({
        user_id: userId,
        student_identifier: studentName,
        grade_level: gradeNumeric,
        language: language,
        passage_type: passageType,
        passage_word_count: wordCount,
        passage_text: '', // Empty string (will be updated by generateAndSendPassage)
        comprehension_requested: comprehensionRequired,
        assessment_mode: isAutoMode ? 'auto' : 'manual',
        starting_level: isAutoMode ? 'story' : passageType,
        status: 'initiated',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      logToFile('❌ Error creating assessment record', {
        error: insertError.message
      });
      throw insertError;
    }

    logToFile('✅ Assessment record created', {
      assessmentId: assessment.id,
      studentName,
      passageConfig,
      isAutoMode
    });

    // For auto mode, use the auto-level orchestrator
    if (isAutoMode) {
      // Start auto-level assessment (sends welcome message and first passage)
      const autoConfig = await AutoLevelOrchestratorService.startAutoAssessment(
        assessment.id,
        userId,
        phoneNumber,
        language,
        gradeNumeric,
        language // userLanguage
      );

      // Generate and send first passage (story level)
      await PassageGenerationService.generateAndSendPassage(
        assessment.id,
        userId,
        phoneNumber,
        language,
        { type: autoConfig.passageType, wordCount: autoConfig.wordCount, grade: autoConfig.gradeLevel },
        language
      );
    } else {
      // Manual mode: Generate and send passage directly
      await PassageGenerationService.generateAndSendPassage(
        assessment.id,
        userId,
        phoneNumber,
        language,
        passageConfig,
        language // userLanguage for instructions
      );
    }

    logToFile('✅ Passage generation and delivery complete', {
      assessmentId: assessment.id
    });

    // Update conversation state
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        current_state: 'AWAITING_READING_AUDIO',
        context_data: {
          assessment_id: assessment.id,
          student_name: studentName,
          is_auto_mode: isAutoMode,
          test_comprehension: comprehensionRequired
        }
      })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (updateError) {
      logToFile('⚠️ Warning: Could not update conversation state', {
        error: updateError.message
      });
    }

    return true;

  } catch (error) {
    logToFile('❌ Error processing reading assessment flow', {
      phoneNumber,
      userId,
      error: error.message,
      stack: error.stack,
      rawFlowResponse: {
        hasInteractive: !!message?.interactive,
        hasNfmReply: !!message?.interactive?.nfm_reply,
        hasResponseJson: !!message?.interactive?.nfm_reply?.response_json,
        responseJsonRaw: message?.interactive?.nfm_reply?.response_json || null
      }
    });

    // Send error message to user
    await WhatsAppService.sendMessage(
      phoneNumber,
      'Sorry, something went wrong setting up the reading assessment. Please try typing "/reading test" again.'
    );

    return false;
  }
}

/**
 * Extract field from response JSON with multiple possible naming patterns
 * @param {object} responseJson - Parsed flow response
 * @param {string[]} possibleNames - Possible field name variations
 * @returns {string|null} Field value or null
 */
function extractField(responseJson, possibleNames) {
  for (const key of Object.keys(responseJson)) {
    // Skip flow_token
    if (key === 'flow_token') continue;

    // Check if key contains any of the possible names
    for (const name of possibleNames) {
      if (key.toLowerCase().includes(name.toLowerCase())) {
        return responseJson[key];
      }
    }
  }
  return null;
}

/**
 * Map level to passage type based on grade-dependent rules
 * User specified: ONE passage type per level
 *
 * @param {string} level - Level from flow (kg, 1, 2, 3, 4, 5)
 * @returns {{passageType: string, gradeNumeric: number}}
 */
function mapLevelToPassageType(level) {
  const levelStr = level.toString().toLowerCase();

  // Grade-to-passage-type mapping (ONE type per level)
  const mapping = {
    'kg': { passageType: 'letters', gradeNumeric: 0 },
    'kindergarten': { passageType: 'letters', gradeNumeric: 0 },
    '0': { passageType: 'letters', gradeNumeric: 0 },

    '1': { passageType: 'words', gradeNumeric: 1 }, // Grade 1 defaults to words
    'grade1': { passageType: 'words', gradeNumeric: 1 },

    '2': { passageType: 'paragraph', gradeNumeric: 2 }, // Grade 2+ defaults to paragraphs
    'grade2': { passageType: 'paragraph', gradeNumeric: 2 },

    '3': { passageType: 'paragraph', gradeNumeric: 3 },
    'grade3': { passageType: 'paragraph', gradeNumeric: 3 },

    '4': { passageType: 'paragraph', gradeNumeric: 4 },
    'grade4': { passageType: 'paragraph', gradeNumeric: 4 },

    '5': { passageType: 'paragraph', gradeNumeric: 5 },
    'grade5': { passageType: 'paragraph', gradeNumeric: 5 }
  };

  const result = mapping[levelStr];

  if (!result) {
    // Default to paragraph for unknown grades
    logToFile('⚠️ Unknown level, defaulting to paragraph', { level });
    return { passageType: 'paragraph', gradeNumeric: 2 };
  }

  return result;
}

/**
 * Handle Attendance Setup Flow submission (bd-058)
 * Creates a new class with students
 *
 * @param {object} message - Flow response message
 * @param {string} phoneNumber - User's phone number
 * @param {string} userId - User's database ID
 * @returns {Promise<boolean>} Success status
 */
async function handleAttendanceSetupFlow(message, phoneNumber, userId) {
  try {
    logToFile('📋 Processing attendance setup flow', { phoneNumber, userId });

    const result = await AttendanceFlowHandler.handleSetupFlowSubmission(message, phoneNumber, userId);

    if (!result.success) {
      await WhatsAppService.sendMessage(
        phoneNumber,
        `Sorry, there was an error setting up your class: ${result.error}\n\nPlease try again.`
      );
      return false;
    }

    // Send success message
    const classDisplay = result.section
      ? `${result.className} - ${result.section}`
      : result.className;

    await WhatsAppService.sendMessage(
      phoneNumber,
      `✅ *Class Created!*\n\n` +
      `Class: ${classDisplay}\n` +
      `Students: ${result.studentCount}\n\n` +
      `You can now take attendance by saying "attendance" or "حاضری".`
    );

    logToFile('✅ Attendance setup completed', {
      userId,
      listId: result.listId,
      studentCount: result.studentCount
    });

    return true;
  } catch (error) {
    logToFile('❌ Error handling attendance setup flow', {
      error: error.message,
      stack: error.stack
    });

    await WhatsAppService.sendMessage(
      phoneNumber,
      'Sorry, something went wrong. Please try again later.'
    );

    return false;
  }
}

/**
 * Handle Attendance Marking Flow submission (bd-058)
 * Records attendance for a class
 *
 * @param {object} message - Flow response message
 * @param {string} phoneNumber - User's phone number
 * @param {string} userId - User's database ID
 * @returns {Promise<boolean>} Success status
 */
async function handleAttendanceMarkingFlow(message, phoneNumber, userId) {
  try {
    logToFile('📋 Processing attendance marking flow', { phoneNumber, userId });

    // Parse flow response to get flow_token and absent_students (bd-193)
    // Flow token format: "userId:classId:date:sessionType:encodedClassName"
    let responseJson = {};
    try {
      responseJson = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}');
    } catch (parseError) {
      logToFile('❌ Failed to parse flow response', { error: parseError.message });
    }

    const flowToken = responseJson.flow_token || '';
    const tokenParts = flowToken.split(':');
    const [tokenUserId, listId, dateStr, sessionType, encodedClassName] = tokenParts;

    if (!listId) {
      logToFile('❌ No list ID in flow token', { userId, flowToken, responseJson });
      await WhatsAppService.sendMessage(
        phoneNumber,
        'Sorry, something went wrong. Please start the attendance process again.'
      );
      return false;
    }

    const sessionDate = dateStr || new Date().toISOString().split('T')[0];
    const className = encodedClassName ? decodeURIComponent(encodedClassName) : 'Class';

    logToFile('📋 Parsed flow token', {
      userId,
      listId,
      sessionDate,
      sessionType,
      className,
      absentCount: responseJson.absent_students?.length || 0
    });

    const result = await AttendanceFlowHandler.handleMarkingFlowSubmission(
      message,
      phoneNumber,
      userId,
      listId,
      new Date(sessionDate),
      sessionType || 'full_day'
    );

    if (!result.success) {
      await WhatsAppService.sendMessage(
        phoneNumber,
        `Sorry, there was an error recording attendance: ${result.error}`
      );
      return false;
    }

    // Send confirmation
    const confirmMessage = AttendanceFlowHandler.generateConfirmationMessage(
      className,
      result.stats
    );

    await WhatsAppService.sendMessage(phoneNumber, confirmMessage);

    // Generate and send Excel file (bd-195)
    // Note: "Your Excel file is being generated..." is already in confirmMessage (bd-198)
    try {
      // Transform stats to match generateCaption expected format (bd-197)
      const summary = {
        present: result.stats.present,
        absent: result.stats.absent,
        attendancePercentage: parseFloat(result.stats.attendanceRate) || 0
      };

      // Fetch class info from DB to get proper section (bd-206)
      // Also validates that listId exists in database (bd-209)
      const StudentListService = require('../services/student-list.service');
      const { data: classInfo, error: classError } = await StudentListService.getStudentListById(listId);

      // Validate listId exists before proceeding (bd-209)
      if (classError || !classInfo) {
        logToFile('❌ Invalid listId - class not found in database', {
          userId,
          listId,
          error: classError?.message
        });
        await WhatsAppService.sendMessage(
          phoneNumber,
          `⚠️ The class you selected no longer exists. Please say "attendance" or "حاضری" to start again.`
        );
        return false;
      }

      const deliveryResult = await AttendanceDeliveryService.processAndDeliver(
        userId,
        phoneNumber,
        {
          selectedClass: {
            class_name: classInfo?.class_name || className,
            section: classInfo?.section || null,
            id: listId
          },
          selectedListId: listId,
          records: result.records,
          markingMethod: 'tap',  // bd-210: DB constraint only allows 'voice', 'tap', 'everyone_present'
          summary: summary,
          sessionDate: sessionDate  // Pass the actual date (bd-207)
        }
      );

      if (!deliveryResult.success) {
        // bd-216: Handle duplicate attendance gracefully
        if (deliveryResult.isDuplicate) {
          logToFile('⚠️ Duplicate attendance detected - showing friendly message', {
            userId,
            existingSessionId: deliveryResult.existingSession?.id
          });

          const sessionTypeLabel = deliveryResult.sessionType === 'morning' ? 'morning'
            : deliveryResult.sessionType === 'afternoon' ? 'afternoon'
            : "today's";

          const classLabel = deliveryResult.section
            ? `${deliveryResult.className} - ${deliveryResult.section}`
            : deliveryResult.className;

          const duplicateMessage = [
            `📋 *Attendance Already Recorded*`,
            ``,
            `You already marked ${sessionTypeLabel} attendance for ${classLabel}!`,
            ``,
            `Present: ${deliveryResult.summary.present} | Absent: ${deliveryResult.summary.absent} | Rate: ${deliveryResult.summary.attendanceRate}`,
            ``,
            `To view your Excel file again, just say "attendance" and select "View Register".`
          ].join('\n');

          await WhatsAppService.sendMessage(phoneNumber, duplicateMessage);
        } else {
          logToFile('❌ Excel delivery failed', { userId, error: deliveryResult.error });
          await WhatsAppService.sendMessage(phoneNumber, `Sorry, there was an error generating your Excel file: ${deliveryResult.error}`);
        }
      } else {
        logToFile('✅ Excel delivered successfully', { userId, fileUrl: deliveryResult.fileUrl });
      }
    } catch (deliveryError) {
      logToFile('❌ Excel delivery exception', { userId, error: deliveryError.message });
      await WhatsAppService.sendMessage(phoneNumber, 'Sorry, something went wrong generating your Excel file.');
    }

    logToFile('✅ Attendance marking completed', {
      userId,
      listId,
      stats: result.stats
    });

    return true;
  } catch (error) {
    logToFile('❌ Error handling attendance marking flow', {
      error: error.message,
      stack: error.stack
    });

    await WhatsAppService.sendMessage(
      phoneNumber,
      'Sorry, something went wrong recording attendance. Please try again.'
    );

    return false;
  }
}

module.exports = {
  handleFlowResponse,
  handleReadingAssessmentFlow,
  handleAttendanceSetupFlow,
  handleAttendanceMarkingFlow,
  mapLevelToPassageType,
  READING_ASSESSMENT_FLOW_ID,
  ATTENDANCE_SETUP_FLOW_ID,
  ATTENDANCE_MARKING_FLOW_ID
};
