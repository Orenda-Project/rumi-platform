/**
 * Attendance Conversation Service
 * State machine for managing attendance marking workflow
 *
 * Created: January 24, 2026
 * Bead: bd-059
 *
 * States:
 * - IDLE: Not in an attendance session
 * - AWAITING_CLASS_SELECTION: User has multiple classes, waiting for selection
 * - AWAITING_MARKING_METHOD: Class selected, waiting for voice/tap choice
 * - AWAITING_VOICE_INPUT: Waiting for voice roll call
 * - AWAITING_VERIFICATION: Showing extracted results, waiting for confirm/edit
 * - PROCESSING: Generating Excel file
 * - COMPLETED: Session finished
 */

const redisService = require('./cache/railway-redis.service');
const StudentListService = require('./student-list.service');
const { logToFile } = require('../utils/logger');

// State constants
const STATES = {
  IDLE: 'IDLE',
  AWAITING_CLASS_SELECTION: 'AWAITING_CLASS_SELECTION',
  AWAITING_DATE_SELECTION: 'AWAITING_DATE_SELECTION',      // bd-065
  AWAITING_SESSION_TYPE: 'AWAITING_SESSION_TYPE',          // bd-066 (AM/PM)
  AWAITING_MARKING_METHOD: 'AWAITING_MARKING_METHOD',
  AWAITING_VOICE_INPUT: 'AWAITING_VOICE_INPUT',
  AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED'
};

// Session TTL in seconds (1 hour)
const SESSION_TTL = 3600;

// Processing timeout in seconds (2 minutes) - bd-190
const PROCESSING_TIMEOUT = 120;

// Rate limiting constants (bd-069)
const RATE_LIMIT_WINDOW = 300; // 5 minutes
const RATE_LIMIT_MAX_SESSIONS = 5; // Max 5 sessions per 5 minutes

// Marking method keywords
const VOICE_KEYWORDS = ['voice', 'آواز', 'awaz', 'bolo', 'بولو', '1', 'roll call'];
const TAP_KEYWORDS = ['tap', 'type', 'ٹیپ', '2', 'mark', 'select'];

// Session type keywords (bd-066)
const MORNING_KEYWORDS = ['morning', 'am', 'صبح', 'subah', '1'];
const AFTERNOON_KEYWORDS = ['afternoon', 'pm', 'دوپہر', 'dopahar', '2'];

class AttendanceConversationService {
  /**
   * Get Redis key for user's attendance session
   */
  static getRedisKey(userId) {
    return `attendance:session:${userId}`;
  }

  /**
   * Get current session state from Redis
   */
  static async getSessionState(userId) {
    try {
      const data = await redisService.get(this.getRedisKey(userId));
      if (!data) {
        return null;
      }
      // redisService.get already parses JSON
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      logToFile('Error getting attendance session state', { userId, error: error.message });
      return null;
    }
  }

  /**
   * Save session state to Redis
   */
  static async saveSessionState(userId, sessionData) {
    try {
      const key = this.getRedisKey(userId);
      // redisService.set handles TTL as third argument
      await redisService.set(key, sessionData, SESSION_TTL);
      return true;
    } catch (error) {
      logToFile('Error saving attendance session state', { userId, error: error.message });
      return false;
    }
  }

  /**
   * Clear session state from Redis
   */
  static async clearSessionState(userId) {
    try {
      await redisService.delete(this.getRedisKey(userId));
      return true;
    } catch (error) {
      logToFile('Error clearing attendance session state', { userId, error: error.message });
      return false;
    }
  }

  /**
   * Check if user is currently in an attendance session
   */
  static async isInAttendanceSession(userId) {
    const state = await this.getSessionState(userId);
    return state !== null;
  }

  /**
   * Check if PROCESSING state has timed out (bd-190)
   * @param {Object} sessionState - Current session state
   * @returns {boolean} True if processing has timed out
   */
  static isProcessingTimedOut(sessionState) {
    if (!sessionState || sessionState.state !== STATES.PROCESSING) {
      return false;
    }

    // Check if processingStartedAt exists
    if (!sessionState.processingStartedAt) {
      // No timestamp - consider it timed out (legacy state)
      return true;
    }

    const processingStarted = new Date(sessionState.processingStartedAt).getTime();
    const elapsed = Date.now() - processingStarted;
    const timeoutMs = PROCESSING_TIMEOUT * 1000;

    return elapsed > timeoutMs;
  }

  /**
   * Check rate limit for user (bd-069)
   * @returns {Object} { allowed: boolean, remainingTime?: number }
   */
  static async checkRateLimit(userId) {
    try {
      const rateLimitKey = `attendance:ratelimit:${userId}`;
      const data = await redisService.get(rateLimitKey);

      if (!data) {
        return { allowed: true };
      }

      const rateLimitData = typeof data === 'string' ? JSON.parse(data) : data;

      if (rateLimitData.count >= RATE_LIMIT_MAX_SESSIONS) {
        const elapsedMs = Date.now() - rateLimitData.windowStart;
        const remainingMs = (RATE_LIMIT_WINDOW * 1000) - elapsedMs;

        if (remainingMs > 0) {
          return {
            allowed: false,
            remainingTime: Math.ceil(remainingMs / 1000)
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      logToFile('Error checking rate limit', { userId, error: error.message });
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Increment rate limit counter (bd-069)
   */
  static async incrementRateLimit(userId) {
    try {
      const rateLimitKey = `attendance:ratelimit:${userId}`;
      const data = await redisService.get(rateLimitKey);

      let rateLimitData;
      if (!data) {
        rateLimitData = { count: 1, windowStart: Date.now() };
      } else {
        rateLimitData = typeof data === 'string' ? JSON.parse(data) : data;
        const elapsedMs = Date.now() - rateLimitData.windowStart;

        if (elapsedMs > RATE_LIMIT_WINDOW * 1000) {
          // Window expired, reset
          rateLimitData = { count: 1, windowStart: Date.now() };
        } else {
          rateLimitData.count++;
        }
      }

      await redisService.set(rateLimitKey, rateLimitData, RATE_LIMIT_WINDOW);
    } catch (error) {
      logToFile('Error incrementing rate limit', { userId, error: error.message });
    }
  }

  /**
   * Handle existing session recovery (bd-068)
   * @returns {Object} { hasExisting: boolean, sessionState?: Object, action?: string }
   */
  static async handleSessionRecovery(userId) {
    const existingSession = await this.getSessionState(userId);

    if (!existingSession) {
      return { hasExisting: false };
    }

    const sessionAge = Date.now() - new Date(existingSession.startedAt).getTime();
    const sessionAgeMinutes = Math.floor(sessionAge / 60000);

    // If session is recent (< 30 minutes) and not completed, offer to resume
    if (sessionAgeMinutes < 30 && existingSession.state !== STATES.COMPLETED) {
      return {
        hasExisting: true,
        sessionState: existingSession,
        action: 'OFFER_RESUME',
        message: [
          `*Existing Session Found*`,
          '',
          `You have an unfinished attendance session (${sessionAgeMinutes} min ago).`,
          '',
          'Would you like to:',
          '1. *Continue* where you left off',
          '2. *Start fresh* with a new session',
          '',
          'Reply 1 or 2'
        ].join('\n')
      };
    }

    // Old session - auto-clear
    await this.clearSessionState(userId);
    return { hasExisting: false };
  }

  /**
   * Generate date selection message (bd-065)
   */
  static generateDateSelectionMessage() {
    const today = new Date();
    const dates = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const label = i === 0 ? 'Today' : (i === 1 ? 'Yesterday' : `${dayName}, ${dateStr}`);
      dates.push({ date, label });
    }

    const lines = [
      '*Select Date*',
      '',
      'Which day is this attendance for?',
      ''
    ];

    dates.forEach((d, i) => {
      lines.push(`${i + 1}. ${d.label}`);
    });

    lines.push('');
    lines.push('Reply with a number (1-7)');

    return { message: lines.join('\n'), dates };
  }

  /**
   * Generate session type message (bd-066 - AM/PM)
   */
  static generateSessionTypeMessage() {
    return [
      '*Session Type*',
      '',
      'Is this for:',
      '',
      '1. 🌅 Morning attendance',
      '2. 🌤️ Afternoon attendance',
      '',
      'Reply 1 or 2'
    ].join('\n');
  }

  /**
   * Format class display name
   */
  static formatClassDisplayName(classData) {
    if (classData.section && classData.section.trim() !== '') {
      return `${classData.class_name} - ${classData.section}`;
    }
    return classData.class_name;
  }

  /**
   * Generate class selection message
   */
  static generateClassSelectionMessage(classes) {
    const lines = [
      '*Which class?*',
      ''
    ];

    classes.forEach((cls, index) => {
      lines.push(`${index + 1}. ${this.formatClassDisplayName(cls)}`);
    });

    lines.push('');
    lines.push('Please reply with the number of your class.');

    return lines.join('\n');
  }

  /**
   * Generate marking method selection message
   */
  static generateMarkingMethodMessage(classData) {
    const className = this.formatClassDisplayName(classData);

    return [
      `*Attendance for ${className}*`,
      '',
      'How would you like to mark attendance?',
      '',
      '1. Voice Roll Call - Read out names',
      '2. Tap to Mark - Select absent students',
      '',
      'Reply 1 or 2'
    ].join('\n');
  }

  /**
   * Start a new attendance session
   * Now includes rate limiting (bd-069), concurrent prevention (bd-067), and session recovery (bd-068)
   *
   * @param {string} userId - User ID
   * @param {Object} options - Optional settings
   * @param {boolean} options.forceNew - Force start new session, ignoring existing
   * @param {Date} options.selectedDate - Pre-selected date (default: today)
   * @param {string} options.sessionType - Pre-selected session type ('morning' or 'afternoon')
   */
  static async startAttendanceSession(userId, options = {}) {
    try {
      // bd-069: Check rate limit
      const rateLimitCheck = await this.checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return {
          action: 'RATE_LIMITED',
          message: [
            '*Too Many Requests*',
            '',
            `Please wait ${rateLimitCheck.remainingTime} seconds before starting a new attendance session.`,
            '',
            'This helps us maintain service quality.'
          ].join('\n')
        };
      }

      // bd-067 & bd-068: Check for existing session (concurrent prevention + recovery)
      if (!options.forceNew) {
        const recoveryResult = await this.handleSessionRecovery(userId);
        if (recoveryResult.hasExisting) {
          return recoveryResult;
        }
      }

      // Increment rate limit counter
      await this.incrementRateLimit(userId);

      // Get user's student lists
      const { data: classList, error } = await StudentListService.getStudentListsByUser(userId);

      if (error) {
        logToFile('Error fetching student lists', { userId, error });
        return {
          action: 'ERROR',
          message: 'Sorry, there was an error loading your classes. Please try again.'
        };
      }

      // No classes set up
      if (!classList || classList.length === 0) {
        return {
          action: 'SEND_SETUP_FLOW',
          message: "You haven't set up any classes yet. Let me help you get started!"
        };
      }

      // Base session data
      const baseSessionData = {
        userId,
        startedAt: new Date().toISOString(),
        selectedDate: options.selectedDate || new Date().toISOString().split('T')[0],
        sessionType: options.sessionType || 'full_day'
      };

      // One class - proceed directly to marking method
      if (classList.length === 1) {
        const selectedClass = classList[0];
        await this.saveSessionState(userId, {
          ...baseSessionData,
          state: STATES.AWAITING_MARKING_METHOD,
          selectedListId: selectedClass.id,
          selectedClass
        });

        return {
          action: 'ASK_MARKING_METHOD',
          selectedClass,
          message: this.generateMarkingMethodMessage(selectedClass)
        };
      }

      // Multiple classes - ask for selection
      await this.saveSessionState(userId, {
        ...baseSessionData,
        state: STATES.AWAITING_CLASS_SELECTION,
        classList
      });

      return {
        action: 'ASK_CLASS_SELECTION',
        classes: classList,
        message: this.generateClassSelectionMessage(classList)
      };
    } catch (error) {
      logToFile('Error starting attendance session', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle session recovery response (continue or start fresh)
   * Called when user responds to recovery prompt
   */
  static async handleRecoveryResponse(userId, response) {
    try {
      const normalizedResponse = response.trim().toLowerCase();

      // Continue existing session
      if (['1', 'continue', 'resume', 'جاری'].some(kw => normalizedResponse.includes(kw))) {
        const sessionState = await this.getSessionState(userId);
        if (sessionState) {
          // Return appropriate action based on current state
          switch (sessionState.state) {
            case STATES.AWAITING_CLASS_SELECTION:
              return {
                action: 'ASK_CLASS_SELECTION',
                classes: sessionState.classList,
                message: this.generateClassSelectionMessage(sessionState.classList)
              };
            case STATES.AWAITING_MARKING_METHOD:
              return {
                action: 'ASK_MARKING_METHOD',
                selectedClass: sessionState.selectedClass,
                message: this.generateMarkingMethodMessage(sessionState.selectedClass)
              };
            case STATES.AWAITING_VOICE_INPUT:
              return {
                action: 'AWAIT_VOICE_INPUT',
                message: 'Please send your voice roll call message.'
              };
            case STATES.AWAITING_VERIFICATION:
              return {
                action: 'VERIFY_ATTENDANCE',
                records: sessionState.records,
                message: this.generateVerificationMessage(
                  sessionState.records,
                  sessionState.summary,
                  sessionState.selectedClass,
                  sessionState.transcript
                )
              };
            default:
              // Unknown state - start fresh
              break;
          }
        }
      }

      // Start fresh
      await this.clearSessionState(userId);
      return this.startAttendanceSession(userId, { forceNew: true });

    } catch (error) {
      logToFile('Error handling recovery response', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle date selection response (bd-065)
   */
  static async handleDateSelection(userId, input) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_DATE_SELECTION) {
        return {
          action: 'INVALID_STATE',
          message: 'No date selection expected. Say "attendance" to start.'
        };
      }

      const selection = parseInt(input.trim(), 10);
      if (isNaN(selection) || selection < 1 || selection > 7) {
        return {
          action: 'INVALID_SELECTION',
          message: 'Please reply with a number between 1 and 7.'
        };
      }

      const today = new Date();
      const selectedDate = new Date(today);
      selectedDate.setDate(selectedDate.getDate() - (selection - 1));

      // Update session with selected date and move to next state
      await this.saveSessionState(userId, {
        ...sessionState,
        state: STATES.AWAITING_CLASS_SELECTION,
        selectedDate: selectedDate.toISOString().split('T')[0]
      });

      // If user has only one class, skip to marking method
      if (sessionState.classList && sessionState.classList.length === 1) {
        const selectedClass = sessionState.classList[0];
        await this.saveSessionState(userId, {
          ...sessionState,
          state: STATES.AWAITING_MARKING_METHOD,
          selectedDate: selectedDate.toISOString().split('T')[0],
          selectedListId: selectedClass.id,
          selectedClass
        });

        return {
          action: 'ASK_MARKING_METHOD',
          selectedClass,
          message: this.generateMarkingMethodMessage(selectedClass)
        };
      }

      return {
        action: 'ASK_CLASS_SELECTION',
        classes: sessionState.classList,
        message: this.generateClassSelectionMessage(sessionState.classList)
      };

    } catch (error) {
      logToFile('Error handling date selection', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle session type selection (bd-066 - AM/PM)
   */
  static async handleSessionTypeSelection(userId, input) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_SESSION_TYPE) {
        return {
          action: 'INVALID_STATE',
          message: 'No session type selection expected.'
        };
      }

      const normalizedInput = input.trim().toLowerCase();

      let sessionType = null;
      if (MORNING_KEYWORDS.some(kw => normalizedInput.includes(kw))) {
        sessionType = 'morning';
      } else if (AFTERNOON_KEYWORDS.some(kw => normalizedInput.includes(kw))) {
        sessionType = 'afternoon';
      }

      if (!sessionType) {
        return {
          action: 'INVALID_SELECTION',
          message: 'Please reply 1 for Morning or 2 for Afternoon.'
        };
      }

      // Update session and move to marking method
      await this.saveSessionState(userId, {
        ...sessionState,
        state: STATES.AWAITING_MARKING_METHOD,
        sessionType
      });

      return {
        action: 'ASK_MARKING_METHOD',
        selectedClass: sessionState.selectedClass,
        message: this.generateMarkingMethodMessage(sessionState.selectedClass)
      };

    } catch (error) {
      logToFile('Error handling session type selection', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle class selection input
   */
  static async handleClassSelection(userId, input) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_CLASS_SELECTION) {
        return {
          action: 'INVALID_STATE',
          message: 'No class selection expected. Say "attendance" to start.'
        };
      }

      const { classList } = sessionState;
      const trimmedInput = input.trim().toLowerCase();

      let selectedClass = null;

      // Try numeric selection first
      const numericSelection = parseInt(trimmedInput, 10);
      if (!isNaN(numericSelection) && numericSelection >= 1 && numericSelection <= classList.length) {
        selectedClass = classList[numericSelection - 1];
      }

      // Try text-based matching
      if (!selectedClass) {
        selectedClass = classList.find(cls => {
          const displayName = this.formatClassDisplayName(cls).toLowerCase();
          return displayName.includes(trimmedInput) || trimmedInput.includes(cls.class_name.toLowerCase());
        });
      }

      if (!selectedClass) {
        return {
          action: 'INVALID_SELECTION',
          message: `Please reply with a valid number (1-${classList.length}) or class name.`
        };
      }

      // Update session state
      await this.saveSessionState(userId, {
        ...sessionState,
        state: STATES.AWAITING_MARKING_METHOD,
        selectedListId: selectedClass.id,
        selectedClass
      });

      return {
        action: 'ASK_MARKING_METHOD',
        selectedClass,
        message: this.generateMarkingMethodMessage(selectedClass)
      };
    } catch (error) {
      logToFile('Error handling class selection', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle marking method selection (voice or tap)
   */
  static async handleMarkingMethodSelection(userId, input) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_MARKING_METHOD) {
        return {
          action: 'INVALID_STATE',
          message: 'No marking method expected. Say "attendance" to start.'
        };
      }

      const trimmedInput = input.trim().toLowerCase();

      // Check for voice keywords
      const isVoice = VOICE_KEYWORDS.some(kw => trimmedInput.includes(kw.toLowerCase()));

      // Check for tap keywords
      const isTap = TAP_KEYWORDS.some(kw => trimmedInput.includes(kw.toLowerCase()));

      if (isVoice && !isTap) {
        // Voice Roll Call selected
        await this.saveSessionState(userId, {
          ...sessionState,
          state: STATES.AWAITING_VOICE_INPUT
        });

        return {
          action: 'AWAIT_VOICE_INPUT',
          message: [
            '*Voice Roll Call*',
            '',
            'Please send a voice message reading your attendance.',
            '',
            'Example:',
            '"Zara hazir, Ahmed hazir, Fatima ghair hazir..."',
            '',
            'I\'ll recognize names and their status.'
          ].join('\n')
        };
      }

      if (isTap && !isVoice) {
        // Tap to Mark selected - get students and send flow
        const { data: students, error } = await StudentListService.getStudentsByList(sessionState.selectedListId);

        if (error || !students) {
          return {
            action: 'ERROR',
            message: 'Sorry, could not load students. Please try again.'
          };
        }

        await this.saveSessionState(userId, {
          ...sessionState,
          state: STATES.AWAITING_VERIFICATION, // Will receive flow response
          students
        });

        return {
          action: 'SEND_MARKING_FLOW',
          students,
          selectedClass: sessionState.selectedClass,
          message: 'Please mark attendance.'
        };
      }

      // Couldn't determine selection
      return {
        action: 'INVALID_SELECTION',
        message: 'Please reply with 1 for Voice Roll Call or 2 for Tap to Mark.'
      };
    } catch (error) {
      logToFile('Error handling marking method selection', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle "Everyone Present" shortcut
   */
  static async handleEveryonePresent(userId) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_MARKING_METHOD) {
        return {
          action: 'INVALID_STATE',
          message: 'This option is not available right now.'
        };
      }

      // Get all students
      const { data: students, error } = await StudentListService.getStudentsByList(sessionState.selectedListId);

      if (error || !students) {
        return {
          action: 'ERROR',
          message: 'Sorry, could not load students. Please try again.'
        };
      }

      // Mark everyone as present
      const records = students.map(student => ({
        studentId: student.id,
        studentName: student.student_name,
        fatherName: student.father_name,
        rollNumber: student.roll_number,
        status: 'present',
        confidence: 1.0
      }));

      // Update state to processing with timestamp (bd-190)
      await this.saveSessionState(userId, {
        ...sessionState,
        state: STATES.PROCESSING,
        processingStartedAt: new Date().toISOString(),
        records
      });

      return {
        action: 'GENERATE_ATTENDANCE',
        records,
        selectedClass: sessionState.selectedClass,
        message: 'Great! Marking everyone present and generating your attendance file...'
      };
    } catch (error) {
      logToFile('Error handling everyone present', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Handle voice input for attendance roll call (bd-062)
   * Called when teacher sends a voice message with roll call
   *
   * @param {string} userId - User ID
   * @param {string} audioPath - Path to the converted WAV audio file
   * @returns {Promise<Object>} Result with action and records
   */
  static async handleVoiceInput(userId, audioPath) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_VOICE_INPUT) {
        return {
          action: 'INVALID_STATE',
          message: 'No voice input expected. Say "attendance" to start.'
        };
      }

      logToFile('📋 Processing voice attendance input', {
        userId,
        selectedListId: sessionState.selectedListId
      });

      // Get students from the selected list
      const { data: students, error: studentError } = await StudentListService.getStudentsByList(sessionState.selectedListId);

      if (studentError || !students || students.length === 0) {
        return {
          action: 'ERROR',
          message: 'Sorry, could not load student list. Please try again.'
        };
      }

      logToFile('Student list loaded for voice attendance', {
        studentCount: students.length,
        listId: sessionState.selectedListId
      });

      // Process voice attendance using VoiceAttendanceService
      const VoiceAttendanceService = require('./voice-attendance.service');
      const result = await VoiceAttendanceService.processVoiceAttendance(audioPath, students);

      if (!result.success) {
        logToFile('⚠️ Voice attendance processing failed', { error: result.error });
        return {
          action: 'ERROR',
          message: [
            'Sorry, I had trouble processing your voice message.',
            '',
            `Error: ${result.error}`,
            '',
            'Please try again or use "2" for Tap to Mark.'
          ].join('\n')
        };
      }

      // Format records for session storage
      const records = result.records.map(r => ({
        studentId: r.student_id,
        studentName: r.student_name,
        rollNumber: students.find(s => s.id === r.student_id)?.roll_number,
        status: r.status,
        confidence: r.confidence,
        detectedResponse: r.detected_response
      }));

      // Update session state to verification
      await this.saveSessionState(userId, {
        ...sessionState,
        state: STATES.AWAITING_VERIFICATION,
        records,
        transcript: result.transcript,
        summary: result.summary
      });

      // Generate verification message
      const verificationMessage = this.generateVerificationMessage(
        records,
        result.summary,
        sessionState.selectedClass,
        result.transcript
      );

      return {
        action: 'VERIFY_ATTENDANCE',
        records,
        summary: result.summary,
        transcript: result.transcript,
        selectedClass: sessionState.selectedClass,
        message: verificationMessage
      };

    } catch (error) {
      logToFile('❌ Error handling voice input', { userId, error: error.message, stack: error.stack });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong processing your voice message. Please try again.'
      };
    }
  }

  /**
   * Generate verification message for user to confirm/edit attendance
   */
  static generateVerificationMessage(records, summary, selectedClass, transcript) {
    const className = this.formatClassDisplayName(selectedClass);
    const presentStudents = records.filter(r => r.status === 'present');
    const absentStudents = records.filter(r => r.status === 'absent');

    const lines = [
      `*Attendance for ${className}*`,
      '',
      `📊 *Summary:*`,
      `✅ Present: ${summary.present}`,
      `❌ Absent: ${summary.absent}`,
      `📈 Attendance: ${summary.attendancePercentage.toFixed(0)}%`,
      ''
    ];

    // Show absent students (more important to verify)
    if (absentStudents.length > 0) {
      lines.push('*Absent Students:*');
      absentStudents.forEach((r, i) => {
        lines.push(`${i + 1}. ${r.studentName}`);
      });
      lines.push('');
    } else {
      lines.push('*No students marked absent* ✅');
      lines.push('');
    }

    // Add confirmation options
    lines.push('Is this correct?');
    lines.push('Reply *"yes"* to confirm and generate Excel');
    lines.push('Reply *"edit"* to make changes');
    lines.push('Reply *"cancel"* to start over');

    return lines.join('\n');
  }

  /**
   * Handle verification response (yes/edit/cancel)
   */
  static async handleVerificationResponse(userId, response) {
    try {
      const sessionState = await this.getSessionState(userId);

      if (!sessionState || sessionState.state !== STATES.AWAITING_VERIFICATION) {
        return {
          action: 'INVALID_STATE',
          message: 'No verification pending. Say "attendance" to start.'
        };
      }

      const normalizedResponse = response.trim().toLowerCase();

      // Check for confirmation
      if (['yes', 'confirm', 'correct', 'ok', 'ہاں', 'جی', 'ٹھیک'].some(kw => normalizedResponse.includes(kw))) {
        // Update state to processing with timestamp (bd-190)
        await this.saveSessionState(userId, {
          ...sessionState,
          state: STATES.PROCESSING,
          processingStartedAt: new Date().toISOString()
        });

        return {
          action: 'GENERATE_ATTENDANCE',
          records: sessionState.records,
          selectedClass: sessionState.selectedClass,
          message: 'Great! Generating your attendance Excel file...'
        };
      }

      // Check for edit
      if (['edit', 'change', 'fix', 'modify', 'ایڈٹ', 'تبدیلی'].some(kw => normalizedResponse.includes(kw))) {
        // Send the marking flow with current records pre-filled
        return {
          action: 'SEND_MARKING_FLOW',
          students: sessionState.students || [],
          selectedClass: sessionState.selectedClass,
          prefilledAbsent: sessionState.records.filter(r => r.status === 'absent').map(r => r.studentId),
          message: 'Please mark attendance.'
        };
      }

      // Check for cancel
      if (['cancel', 'no', 'stop', 'منسوخ', 'نہیں'].some(kw => normalizedResponse.includes(kw))) {
        return await this.cancelSession(userId);
      }

      // Unknown response
      return {
        action: 'INVALID_SELECTION',
        message: 'Please reply "yes" to confirm, "edit" to make changes, or "cancel" to start over.'
      };

    } catch (error) {
      logToFile('Error handling verification response', { userId, error: error.message });
      return {
        action: 'ERROR',
        message: 'Sorry, something went wrong. Please try again.'
      };
    }
  }

  /**
   * Cancel current session
   */
  static async cancelSession(userId) {
    await this.clearSessionState(userId);
    return {
      action: 'SESSION_CANCELLED',
      message: 'Attendance session cancelled. Say "attendance" to start again.'
    };
  }

  /**
   * Store attendance records in session for final processing
   */
  static async storeRecordsForProcessing(userId, records) {
    const sessionState = await this.getSessionState(userId);

    if (!sessionState) {
      return false;
    }

    // Include processing timestamp (bd-190)
    await this.saveSessionState(userId, {
      ...sessionState,
      state: STATES.PROCESSING,
      processingStartedAt: new Date().toISOString(),
      records
    });

    return true;
  }

  /**
   * Complete session and clear state
   */
  static async completeSession(userId) {
    await this.clearSessionState(userId);
    return {
      action: 'SESSION_COMPLETED',
      message: 'Attendance recorded successfully!'
    };
  }
}

// Export states as static property
AttendanceConversationService.STATES = STATES;

module.exports = AttendanceConversationService;
