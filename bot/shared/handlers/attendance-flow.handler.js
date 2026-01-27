/**
 * Attendance Flow Handler
 * Handles WhatsApp Flow responses for attendance setup and marking
 *
 * Created: January 24, 2026
 * Bead: bd-057
 * Updated: January 26, 2026 (bd-214: Auto-compute academic year)
 */

const supabase = require('../config/supabase');
const StudentListService = require('../services/student-list.service');
const AttendanceGeneratorService = require('../services/attendance-generator.service');
const { logToFile } = require('../utils/logger');

/**
 * Get current academic year based on Pakistan school calendar (bd-214)
 * Academic year runs April to March:
 * - January-March 2026 → 2025-2026
 * - April-December 2026 → 2026-2027
 *
 * @returns {string} Academic year in format "YYYY-YYYY"
 */
function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  // If we're in Jan-March, we're in the second half of previous academic year
  if (month >= 1 && month <= 3) {
    return `${year - 1}-${year}`;
  }
  // April onwards = new academic year
  return `${year}-${year + 1}`;
}

// Flow IDs - configurable via env for staging vs production
const ATTENDANCE_SETUP_FLOW_ID = process.env.ATTENDANCE_SETUP_FLOW_ID || '';
const ATTENDANCE_MARKING_FLOW_ID = process.env.ATTENDANCE_MARKING_FLOW_ID || '';

class AttendanceFlowHandler {
  /**
   * Parse setup flow response into structured data
   *
   * @param {Object} responseJson - Parsed response_json from flow
   * @returns {Object|null} Parsed setup data or null if invalid
   */
  static parseSetupFlowResponse(responseJson) {
    if (!responseJson) {
      return null;
    }

    try {
      const className = responseJson.class_name?.trim();
      const section = responseJson.section?.trim() || null;
      // bd-214: Auto-compute academic year instead of expecting from flow
      const academicYear = getCurrentAcademicYear();
      const attendanceFrequency = responseJson.attendance_frequency;
      const studentList = responseJson.student_list?.trim();

      // Validate required fields (academic year no longer from flow)
      if (!className || !attendanceFrequency || !studentList) {
        logToFile('Missing required fields in setup flow', { responseJson });
        return null;
      }

      logToFile('📅 Academic year auto-computed (bd-214)', { academicYear });

      return {
        className,
        section,
        academicYear,
        attendanceFrequency,
        studentList
      };
    } catch (error) {
      logToFile('Error parsing setup flow response', { error: error.message });
      return null;
    }
  }

  /**
   * Parse marking flow response into structured data
   *
   * @param {Object} responseJson - Parsed response_json from flow
   * @returns {Object|null} Parsed marking data or null if invalid
   */
  static parseMarkingFlowResponse(responseJson) {
    if (!responseJson) {
      return null;
    }

    try {
      const absentStudentIds = responseJson.absent_students || [];
      const className = responseJson.class_name;
      const dateDisplay = responseJson.date_display;
      const sessionType = responseJson.session_type || 'Full Day';

      return {
        absentStudentIds,
        className,
        dateDisplay,
        sessionType,
        everyonePresent: absentStudentIds.length === 0
      };
    } catch (error) {
      logToFile('Error parsing marking flow response', { error: error.message });
      return null;
    }
  }

  /**
   * Validate setup data
   *
   * @param {Object} data - Parsed setup data
   * @returns {{valid: boolean, error?: string}}
   */
  static validateSetupData(data) {
    if (!data.className || data.className.trim() === '') {
      return { valid: false, error: 'Class name is required' };
    }

    // Validate academic year format (YYYY-YYYY)
    const yearMatch = data.academicYear?.match(/^(\d{4})-(\d{4})$/);
    if (!yearMatch) {
      return { valid: false, error: 'Invalid academic year format' };
    }

    const startYear = parseInt(yearMatch[1], 10);
    const endYear = parseInt(yearMatch[2], 10);
    if (endYear !== startYear + 1) {
      return { valid: false, error: 'Academic year must be consecutive years' };
    }

    if (!data.studentList || data.studentList.trim() === '') {
      return { valid: false, error: 'Student list is required' };
    }

    return { valid: true };
  }

  /**
   * Build attendance records from student list and absent IDs
   *
   * @param {Array} allStudents - All students in the class
   * @param {Array} absentIds - IDs of absent students
   * @returns {Array} Attendance records with status
   */
  static buildAttendanceRecords(allStudents, absentIds) {
    const absentSet = new Set(absentIds);

    return allStudents.map(student => ({
      studentId: student.id,
      studentName: student.student_name,
      fatherName: student.father_name,
      rollNumber: student.roll_number,
      status: absentSet.has(student.id) ? 'absent' : 'present',
      confidence: 1.0 // Manual marking = 100% confidence
    }));
  }

  /**
   * Generate confirmation message for completed attendance
   *
   * @param {string} className - Class name with section
   * @param {Object} stats - Attendance statistics
   * @returns {string} Formatted message
   */
  static generateConfirmationMessage(className, stats) {
    const lines = [
      `*Attendance Recorded*`,
      ``,
      `Class: ${className}`,
      `Total Students: ${stats.total}`,
      `Present: ${stats.present}`,
      `Absent: ${stats.absent}`,
      `Attendance Rate: ${stats.attendanceRate}`,
      ``,
      `Your Excel file is being generated...`
    ];

    return lines.join('\n');
  }

  /**
   * Handle setup flow submission
   *
   * @param {Object} message - WhatsApp message object
   * @param {string} phoneNumber - User's phone number
   * @param {string} userId - User's database ID
   * @returns {Promise<{success: boolean, listId?: string, error?: string}>}
   */
  static async handleSetupFlowSubmission(message, phoneNumber, userId) {
    try {
      // Parse response
      const responseJson = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}');
      const data = this.parseSetupFlowResponse(responseJson);

      if (!data) {
        return { success: false, error: 'Invalid flow response' };
      }

      // Validate
      const validation = this.validateSetupData(data);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Create student list
      const { data: listData, error: listError } = await StudentListService.createStudentList(userId, {
        className: data.className,
        section: data.section,
        academicYear: data.academicYear,
        attendanceFrequency: data.attendanceFrequency
      });

      if (listError) {
        return { success: false, error: 'Failed to create class' };
      }

      // Parse and add students
      const parsedStudents = StudentListService.parseStudentText(data.studentList);

      // bd-212: Check if parsing returned any students
      if (!parsedStudents || parsedStudents.length === 0) {
        logToFile('❌ No students parsed from input', {
          studentListInput: data.studentList,
          parsedCount: 0
        });
        return { success: false, error: 'Could not parse any student names. Please enter one student per line (e.g., "Ahmed Khan" or "Zara s/o Abdul")' };
      }

      logToFile('Parsed students', { count: parsedStudents.length, sample: parsedStudents[0] });

      const { data: studentsData, error: studentsError } = await StudentListService.addStudentsToList(
        listData.id,
        parsedStudents
      );

      if (studentsError) {
        logToFile('❌ Failed to add students to database', {
          error: studentsError.message,
          listId: listData.id,
          studentCount: parsedStudents.length
        });
        return { success: false, error: `Failed to add students: ${studentsError.message}` };
      }

      logToFile('Attendance setup completed', {
        userId,
        listId: listData.id,
        className: data.className,
        studentCount: studentsData.length
      });

      return {
        success: true,
        listId: listData.id,
        className: data.className,
        section: data.section,
        studentCount: studentsData.length
      };
    } catch (error) {
      logToFile('Error handling setup flow', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle marking flow submission
   *
   * @param {Object} message - WhatsApp message object
   * @param {string} phoneNumber - User's phone number
   * @param {string} userId - User's database ID
   * @param {string} listId - Student list ID
   * @param {Date} sessionDate - Date of attendance
   * @param {string} sessionType - 'full_day', 'morning', or 'afternoon'
   * @returns {Promise<{success: boolean, records?: Array, stats?: Object, error?: string}>}
   */
  static async handleMarkingFlowSubmission(message, phoneNumber, userId, listId, sessionDate, sessionType) {
    try {
      // Parse response
      const responseJson = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}');
      const data = this.parseMarkingFlowResponse(responseJson);

      if (!data) {
        return { success: false, error: 'Invalid flow response' };
      }

      // Get all students in the list
      const { data: allStudents, error: studentsError } = await StudentListService.getStudentsByList(listId);
      if (studentsError || !allStudents) {
        return { success: false, error: 'Failed to fetch students' };
      }

      // Build attendance records
      const records = this.buildAttendanceRecords(allStudents, data.absentStudentIds);

      // Calculate stats
      const stats = AttendanceGeneratorService.calculateSummaryStats(records);

      logToFile('Attendance marking completed', {
        userId,
        listId,
        total: stats.total,
        present: stats.present,
        absent: stats.absent
      });

      return {
        success: true,
        records,
        stats,
        everyonePresent: data.everyonePresent
      };
    } catch (error) {
      logToFile('Error handling marking flow', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a flow ID is an attendance flow
   *
   * @param {string} flowId - Flow ID to check
   * @returns {string|null} 'setup', 'marking', or null
   */
  static getAttendanceFlowType(flowId) {
    if (flowId === ATTENDANCE_SETUP_FLOW_ID) {
      return 'setup';
    }
    if (flowId === ATTENDANCE_MARKING_FLOW_ID) {
      return 'marking';
    }
    return null;
  }
}

module.exports = AttendanceFlowHandler;
