/**
 * Student List Service
 * CRUD operations for student lists and individual students
 *
 * Created: January 24, 2026
 * Bead: bd-051
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');

class StudentListService {
  /**
   * Parse raw student text into structured data
   * Handles multiple formats:
   * - "Name, Father Name" (comma separated)
   * - "Name s/o Father Name" or "Name d/o Father Name"
   * - "Name" (no father name)
   * - Numbered lists: "1. Name, Father"
   * - Bullet lists: "- Name, Father"
   *
   * @param {string} text - Raw student list text (one student per line)
   * @returns {Array<{studentName: string, fatherName: string|null}>}
   */
  static parseStudentText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split into lines and process
    const lines = normalized.split('\n');
    const students = [];

    for (const line of lines) {
      let cleaned = line.trim();

      // Skip empty lines
      if (!cleaned) continue;

      // Remove numbering (1., 2., etc.)
      cleaned = cleaned.replace(/^\d+\.\s*/, '');

      // Remove bullet points (-, *, •)
      cleaned = cleaned.replace(/^[-*•]\s*/, '');

      // Skip if empty after cleaning
      if (!cleaned) continue;

      let studentName = null;
      let fatherName = null;

      // Try s/o or d/o format first
      const soDoMatch = cleaned.match(/^(.+?)\s+[sd]\/o\s+(.+)$/i);
      if (soDoMatch) {
        studentName = soDoMatch[1].trim();
        fatherName = soDoMatch[2].trim();
      }
      // Try comma separated format
      else if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        studentName = parts[0].trim();
        fatherName = parts.slice(1).join(',').trim() || null;
      }
      // Just student name
      else {
        studentName = cleaned;
        fatherName = null;
      }

      if (studentName) {
        students.push({ studentName, fatherName });
      }
    }

    return students;
  }

  /**
   * Validate class name
   *
   * @param {string} className - Class name to validate
   * @returns {{valid: boolean, error?: string}}
   */
  static validateClassName(className) {
    if (!className || typeof className !== 'string') {
      return { valid: false, error: 'Class name is required' };
    }

    const trimmed = className.trim();

    if (!trimmed) {
      return { valid: false, error: 'Class name cannot be empty' };
    }

    if (trimmed.length > 100) {
      return { valid: false, error: 'Class name cannot exceed 100 characters' };
    }

    return { valid: true };
  }

  /**
   * Validate academic year format (YYYY-YYYY, consecutive years)
   *
   * @param {string} year - Academic year (e.g., "2025-2026")
   * @returns {{valid: boolean, error?: string}}
   */
  static validateAcademicYear(year) {
    if (!year || typeof year !== 'string') {
      return { valid: false, error: 'Academic year is required' };
    }

    const match = year.match(/^(\d{4})-(\d{4})$/);
    if (!match) {
      return { valid: false, error: 'Invalid format. Use YYYY-YYYY (e.g., 2025-2026)' };
    }

    const startYear = parseInt(match[1], 10);
    const endYear = parseInt(match[2], 10);

    if (endYear !== startYear + 1) {
      return { valid: false, error: 'Years must be consecutive' };
    }

    return { valid: true };
  }

  /**
   * Assign roll numbers to students
   *
   * @param {Array<{studentName: string, fatherName: string|null, rollNumber?: number}>} students
   * @param {number} startFrom - Start assigning from this number (default: 0, meaning start from 1)
   * @returns {Array<{studentName: string, fatherName: string|null, rollNumber: number}>}
   */
  static assignRollNumbers(students, startFrom = 0) {
    // Find max existing roll number
    const existingRolls = students
      .filter(s => s.rollNumber != null)
      .map(s => s.rollNumber);

    let nextRoll = Math.max(startFrom, ...existingRolls, 0) + 1;

    return students.map(student => {
      if (student.rollNumber != null) {
        return student;
      }
      return { ...student, rollNumber: nextRoll++ };
    });
  }

  /**
   * Create student list data object for database insert
   *
   * @param {string} userId - User's UUID
   * @param {Object} formData - Form data from WhatsApp Flow
   * @returns {Object} Data object ready for Supabase insert
   */
  static createStudentListData(userId, formData) {
    return {
      user_id: userId,
      class_name: formData.className,
      section: formData.section || null,
      academic_year: formData.academicYear,
      attendance_frequency: formData.attendanceFrequency || 'once',
      is_active: true
    };
  }

  /**
   * Create student data object for database insert
   *
   * @param {string} listId - Student list UUID
   * @param {Object} parsedStudent - Parsed student object
   * @returns {Object} Data object ready for Supabase insert
   */
  static createStudentData(listId, parsedStudent) {
    return {
      list_id: listId,
      student_name: parsedStudent.studentName,
      father_name: parsedStudent.fatherName || null,
      roll_number: parsedStudent.rollNumber,
      is_active: true
    };
  }

  /**
   * Format student for display
   *
   * @param {Object} student - Student record from database
   * @returns {string} Formatted string like "1. Zara (Abdul Ghaffar)"
   */
  static formatStudentForDisplay(student) {
    const base = `${student.roll_number}. ${student.student_name}`;
    if (student.father_name) {
      return `${base} (${student.father_name})`;
    }
    return base;
  }

  /**
   * Format class for display
   *
   * @param {Object} list - Student list record from database
   * @returns {string} Formatted string like "Grade 4 - B (25 students)"
   */
  static formatClassForDisplay(list) {
    let display = list.class_name;
    if (list.section) {
      display += ` - ${list.section}`;
    }
    display += ` (${list.student_count} students)`;
    return display;
  }

  // ==================== DATABASE OPERATIONS ====================

  /**
   * Create a new student list (class)
   *
   * @param {string} userId - User's UUID
   * @param {Object} formData - Form data from WhatsApp Flow
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  static async createStudentList(userId, formData) {
    try {
      const listData = this.createStudentListData(userId, formData);

      const { data, error } = await supabase
        .from('student_lists')
        .insert(listData)
        .select()
        .single();

      if (error) {
        logToFile('❌ Error creating student list', { error: error.message });
        return { data: null, error };
      }

      logToFile('✅ Student list created', { listId: data.id, className: data.class_name });
      return { data, error: null };
    } catch (error) {
      logToFile('❌ Exception creating student list', { error: error.message });
      return { data: null, error };
    }
  }

  /**
   * Get all active student lists for a user
   * Alias: getStudentListsByUser (for consistency with other services)
   *
   * @param {string} userId - User's UUID
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  static async getStudentLists(userId) {
    try {
      const { data, error } = await supabase
        .from('student_lists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        logToFile('❌ Error fetching student lists', { error: error.message });
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      logToFile('❌ Exception fetching student lists', { error: error.message });
      return { data: null, error };
    }
  }

  /**
   * Get a single student list by ID
   *
   * @param {string} listId - List UUID
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  static async getStudentListById(listId) {
    try {
      const { data, error } = await supabase
        .from('student_lists')
        .select('*')
        .eq('id', listId)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Add students to a list
   *
   * @param {string} listId - Student list UUID
   * @param {Array<{studentName: string, fatherName: string|null}>} parsedStudents
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  static async addStudentsToList(listId, parsedStudents) {
    try {
      // bd-212: Check for empty array before inserting
      if (!parsedStudents || parsedStudents.length === 0) {
        logToFile('❌ No students to add - empty array', { listId });
        return { data: null, error: new Error('No students to add - student list is empty') };
      }

      // Get current max roll number
      const { data: existingStudents } = await supabase
        .from('students')
        .select('roll_number')
        .eq('list_id', listId)
        .eq('is_active', true)
        .order('roll_number', { ascending: false })
        .limit(1);

      const maxRoll = existingStudents?.[0]?.roll_number || 0;

      // Assign roll numbers
      const withRolls = this.assignRollNumbers(parsedStudents, maxRoll);

      // Create student records
      const studentRecords = withRolls.map(student =>
        this.createStudentData(listId, student)
      );

      const { data, error } = await supabase
        .from('students')
        .insert(studentRecords)
        .select();

      if (error) {
        logToFile('❌ Error adding students', { error: error.message, listId });
        return { data: null, error };
      }

      logToFile('✅ Students added', { count: data.length, listId });
      return { data, error: null };
    } catch (error) {
      logToFile('❌ Exception adding students', { error: error.message });
      return { data: null, error };
    }
  }

  /**
   * Get all active students in a list
   *
   * @param {string} listId - Student list UUID
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  static async getStudentsByList(listId) {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('list_id', listId)
        .eq('is_active', true)
        .order('roll_number', { ascending: true });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Soft delete a student (set is_active = false)
   *
   * @param {string} studentId - Student UUID
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  static async softDeleteStudent(studentId) {
    try {
      const { data, error } = await supabase
        .from('students')
        .update({ is_active: false })
        .eq('id', studentId)
        .select()
        .single();

      if (error) {
        logToFile('❌ Error soft deleting student', { error: error.message, studentId });
        return { data: null, error };
      }

      logToFile('✅ Student soft deleted', { studentId });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Soft delete a student list and all its students
   *
   * @param {string} listId - Student list UUID
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  static async softDeleteList(listId) {
    try {
      // Soft delete all students in the list
      await supabase
        .from('students')
        .update({ is_active: false })
        .eq('list_id', listId);

      // Soft delete the list itself
      const { data, error } = await supabase
        .from('student_lists')
        .update({ is_active: false })
        .eq('id', listId)
        .select()
        .single();

      if (error) {
        logToFile('❌ Error soft deleting list', { error: error.message, listId });
        return { data: null, error };
      }

      logToFile('✅ Student list soft deleted', { listId });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Get student names as array (for Soniox contextual biasing)
   *
   * @param {string} listId - Student list UUID
   * @returns {Promise<string[]>} Array of "StudentName FatherName" strings
   */
  static async getStudentNamesForBiasing(listId) {
    try {
      const { data, error } = await this.getStudentsByList(listId);

      if (error || !data) {
        return [];
      }

      return data.map(student => {
        if (student.father_name) {
          return `${student.student_name} ${student.father_name}`;
        }
        return student.student_name;
      });
    } catch (error) {
      logToFile('❌ Error getting student names for biasing', { error: error.message });
      return [];
    }
  }

  /**
   * Alias for getStudentLists (for consistency with other services)
   */
  static async getStudentListsByUser(userId) {
    return this.getStudentLists(userId);
  }
}

module.exports = StudentListService;
