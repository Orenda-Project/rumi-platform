/**
 * Attendance Setup Endpoint Handler
 *
 * Handles endpoint-based navigation for student entry with loops (bd-215)
 *
 * Flow:
 * 1. INIT → CLASS_INFO screen (grade, section, frequency)
 * 2. CLASS_INFO submit → Create class → ADD_STUDENT screen
 * 3. ADD_STUDENT "Add & Continue" → Save student → ADD_STUDENT (loop)
 * 4. ADD_STUDENT "Done" → Validate 1+ students → SUCCESS screen
 *
 * Created: January 26, 2026
 * Bead: bd-215, bd-389
 */

const supabase = require('../config/supabase');
const StudentListService = require('../services/student-list.service');
const { logToFile } = require('../utils/logger');

// Import academic year helper from attendance-flow.handler (bd-214)
function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 1 && month <= 3) {
    return `${year - 1}-${year}`;
  }
  return `${year}-${year + 1}`;
}

/**
 * Handle INIT action - provide initial CLASS_INFO screen
 * @param {string} userId - User ID from flow token
 * @returns {Object} - Response with initial screen data
 */
async function handleSetupInit(userId) {
  logToFile('📋 Setup flow INIT', { userId });

  // CLASS_INFO uses static inline data-source for frequency dropdown
  // No dynamic data needed from endpoint
  // Note: Response format per Meta docs - only screen and data, no version field
  return {
    screen: 'CLASS_INFO',
    data: {}
  };
}

/**
 * Handle data_exchange for different screens
 * @param {string} userId - User ID
 * @param {string} screen - Current screen ID
 * @param {Object} screenData - Form data from screen
 * @returns {Object} - Response with next screen
 */
async function handleSetupDataExchange(userId, screen, screenData) {
  logToFile('📋 Setup flow data_exchange', { userId, screen, screenData });

  if (screen === 'CLASS_INFO') {
    return await handleClassInfoSubmit(userId, screenData);
  }

  if (screen === 'ADD_STUDENT') {
    const action = screenData._action || 'add'; // 'add' or 'done'
    const listId = screenData._list_id;
    const classDisplay = screenData._class_display;

    if (action === 'done') {
      return await handleDoneAction(listId, classDisplay);
    }

    return await handleAddStudentAction(
      listId,
      {
        first_name: screenData.first_name,
        last_name: screenData.last_name
      },
      classDisplay
    );
  }

  logToFile('⚠️ Unknown screen in setup flow', { screen });
  return createErrorResponse('Unknown screen');
}

/**
 * Handle CLASS_INFO screen submission - creates class in database
 * @param {string} userId - User ID
 * @param {Object} screenData - Form data (class_name, section, frequency)
 * @returns {Object} - Response navigating to ADD_STUDENT
 */
async function handleClassInfoSubmit(userId, screenData) {
  const { class_name, section, attendance_frequency } = screenData;

  if (!class_name || class_name.trim() === '') {
    return createErrorResponse('Grade is required');
  }

  if (!attendance_frequency) {
    return createErrorResponse('Attendance frequency is required');
  }

  try {
    // Create student list in database (bd-214: academic year auto-computed)
    const academicYear = getCurrentAcademicYear();
    const trimmedClassName = class_name.trim();
    const trimmedSection = section?.trim() || null;

    // Check if class already exists for this user - check ALL classes including soft-deleted (bd-215)
    const { data: existingLists } = await supabase
      .from('student_lists')
      .select('id, class_name, section, is_active')
      .eq('user_id', userId)
      .eq('class_name', trimmedClassName)
      .eq('academic_year', academicYear);
    // NOTE: Removed is_active filter to find soft-deleted classes too

    // Find exact match including section (active OR inactive)
    const existingClass = existingLists?.find(list =>
      (list.section || null) === trimmedSection
    );

    let listData;

    if (existingClass) {
      // Reuse existing class - reactivate if soft-deleted
      if (!existingClass.is_active) {
        logToFile('📋 Reactivating soft-deleted class', { listId: existingClass.id, className: trimmedClassName });
        const { data: reactivated, error: reactivateError } = await supabase
          .from('student_lists')
          .update({ is_active: true, attendance_frequency: attendance_frequency })
          .eq('id', existingClass.id)
          .select()
          .single();

        if (reactivateError) {
          logToFile('❌ Failed to reactivate class', { error: reactivateError.message });
          return createErrorResponse('Failed to create class. Please try again.');
        }
        listData = reactivated;
      } else {
        logToFile('📋 Using existing active class', { listId: existingClass.id, className: trimmedClassName });
        listData = existingClass;
      }
    } else {
      // Create new class - no existing class found
      const { data: newList, error: listError } = await StudentListService.createStudentList(userId, {
        className: trimmedClassName,
        section: trimmedSection,
        academicYear,
        attendanceFrequency: attendance_frequency
      });

      if (listError || !newList) {
        logToFile('❌ Failed to create class', { error: listError?.message });
        return createErrorResponse('Failed to create class. Please try again.');
      }
      listData = newList;
    }

    const classDisplay = trimmedSection
      ? `${trimmedClassName} - ${trimmedSection}`
      : trimmedClassName;

    // Get existing students if reusing a class (bd-215)
    let studentCount = 0;
    let studentsSummary = [];

    if (existingClass) {
      const { data: existingStudents } = await supabase
        .from('students')
        .select('id, student_name, father_name, roll_number')
        .eq('list_id', listData.id)
        .eq('is_active', true)
        .order('roll_number');

      if (existingStudents && existingStudents.length > 0) {
        studentCount = existingStudents.length;
        studentsSummary = getStudentListSummary(existingStudents);
      }
    }

    // bd-388: Use pre-composed strings for pure dynamic references
    // WhatsApp Flows mixed static+dynamic text interpolation is unreliable
    const classInfo = `Class: ${classDisplay} | Students: ${studentCount}`;
    const heading = `Add Student #${studentCount + 1}`;
    const studentsList = formatStudentsListString(studentsSummary);

    const responseData = {
      screen: 'ADD_STUDENT',
      data: {
        list_id: listData.id,
        class_display: classDisplay,
        student_count: studentCount,
        students_added: studentsSummary,
        student_number: studentCount + 1,
        // bd-388: Pre-composed strings for pure dynamic references
        class_info: classInfo,
        heading: heading,
        students_list: studentsList,
        // bd-389: Form-level init-values to clear TextInput fields on loop
        form_init_values: { first_name: '', last_name: '' }
      }
    };

    logToFile('✅ Class ready, navigating to ADD_STUDENT', {
      listId: listData.id,
      classDisplay,
      existingStudents: studentCount,
      responseData: JSON.stringify(responseData)
    });

    return responseData;

  } catch (error) {
    logToFile('❌ Exception creating class', { error: error.message });
    return createErrorResponse('Failed to create class. Please try again.');
  }
}

/**
 * Handle "Add & Continue" action - saves student and loops back to ADD_STUDENT
 * @param {string} listId - Student list ID
 * @param {Object} studentData - { first_name, last_name }
 * @param {string} classDisplay - Class display name for header
 * @returns {Object} - Response navigating back to ADD_STUDENT with updated list
 */
async function handleAddStudentAction(listId, studentData, classDisplay) {
  const { first_name, last_name } = studentData;

  // Validate first name is required
  if (!first_name || first_name.trim() === '') {
    return {
      screen: 'ADD_STUDENT',
      data: {
        list_id: listId,
        class_display: classDisplay,
        class_info: `Class: ${classDisplay}`,
        heading: 'Add Student',
        students_list: '',
        // bd-389: Form-level init-values to clear TextInput fields on loop
        form_init_values: { first_name: '', last_name: '' },
        error: { message: 'Student name is required' }
      }
    };
  }

  try {
    // Get next roll number
    const { data: existingStudents } = await supabase
      .from('students')
      .select('roll_number')
      .eq('list_id', listId)
      .order('roll_number', { ascending: false });

    const nextRollNumber = (existingStudents?.[0]?.roll_number || 0) + 1;

    // Combine first + last name into student_name
    const studentName = last_name?.trim()
      ? `${first_name.trim()} ${last_name.trim()}`
      : first_name.trim();

    // Insert student
    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert({
        list_id: listId,
        student_name: studentName,
        father_name: last_name?.trim() || null,
        roll_number: nextRollNumber,
        is_active: true
      })
      .select('id, student_name, father_name, roll_number')
      .single();

    if (insertError) {
      logToFile('❌ Failed to add student', { error: insertError.message });
      return {
        screen: 'ADD_STUDENT',
        data: {
          list_id: listId,
          class_display: classDisplay,
          class_info: `Class: ${classDisplay}`,
          heading: 'Add Student',
          students_list: '',
          first_name_init: '',
          last_name_init: '',
          error: { message: 'Failed to add student. Please try again.' }
        }
      };
    }

    // Get updated student list for display
    const { data: allStudents } = await supabase
      .from('students')
      .select('id, student_name, father_name, roll_number')
      .eq('list_id', listId)
      .eq('is_active', true)
      .order('roll_number');

    const studentsSummary = getStudentListSummary(allStudents || []);
    const totalStudents = allStudents?.length || 0;

    // bd-388: Pre-composed strings for pure dynamic references
    const classInfo = `Class: ${classDisplay} | Students: ${totalStudents}`;
    const heading = `Add Student #${totalStudents + 1}`;
    const studentsList = formatStudentsListString(studentsSummary);

    const responseData = {
      screen: 'ADD_STUDENT',
      data: {
        list_id: listId,
        class_display: classDisplay,
        student_count: totalStudents,
        students_added: studentsSummary,
        student_number: totalStudents + 1,
        // bd-388: Pre-composed strings for pure dynamic references
        class_info: classInfo,
        heading: heading,
        students_list: studentsList,
        // bd-389: Form-level init-values to clear TextInput fields on loop
        form_init_values: { first_name: '', last_name: '' }
      }
    };

    logToFile('✅ Student added', {
      listId,
      studentName,
      rollNumber: nextRollNumber,
      totalStudents,
      responseData: JSON.stringify(responseData)
    });

    return responseData;

  } catch (error) {
    logToFile('❌ Exception adding student', { error: error.message });
    // bd-388: No version field in response (Meta expects {screen, data} only)
    return {
      screen: 'ADD_STUDENT',
      data: {
        list_id: listId,
        class_display: classDisplay,
        class_info: `Class: ${classDisplay}`,
        heading: 'Add Student',
        students_list: '',
        // bd-389: Form-level init-values to clear TextInput fields on loop
        form_init_values: { first_name: '', last_name: '' },
        error: { message: 'Failed to add student. Please try again.' }
      }
    };
  }
}

/**
 * Handle "Done" action - validates and completes the flow
 * @param {string} listId - Student list ID
 * @param {string} classDisplay - Class display name
 * @returns {Object} - SUCCESS screen or error if no students
 */
async function handleDoneAction(listId, classDisplay) {
  try {
    // Get all students for final validation
    const { data: students, error } = await supabase
      .from('students')
      .select('id, student_name, roll_number')
      .eq('list_id', listId)
      .eq('is_active', true)
      .order('roll_number');

    if (error) {
      logToFile('❌ Error fetching students for done action', { error: error.message });
      return createErrorResponse('Failed to complete setup. Please try again.');
    }

    // Validate at least one student
    if (!students || students.length === 0) {
      return {
        screen: 'ADD_STUDENT',
        data: {
          list_id: listId,
          class_display: classDisplay,
          student_count: 0,
          students_added: [],
          student_number: 1,
          class_info: `Class: ${classDisplay} | Students: 0`,
          heading: 'Add Student #1',
          students_list: '',
          // bd-389: Form-level init-values to clear TextInput fields on loop
          form_init_values: { first_name: '', last_name: '' },
          error: { message: 'Please add at least one student before finishing.' }
        }
      };
    }

    // bd-388: Pre-composed success_message for pure dynamic reference
    const successMessage = `Your class ${classDisplay} has been created with ${students.length} student${students.length === 1 ? '' : 's'}.`;

    const responseData = {
      screen: 'SUCCESS',
      data: {
        success_message: successMessage,
        extension_message_response: {
          params: {
            list_id: listId,
            class_display: classDisplay,
            student_count: students.length,
            success_message: successMessage
          }
        }
      }
    };

    logToFile('✅ Setup complete', {
      listId,
      studentCount: students.length,
      classDisplay,
      responseData: JSON.stringify(responseData)
    });

    return responseData;

  } catch (error) {
    logToFile('❌ Exception in done action', { error: error.message });
    return createErrorResponse('Failed to complete setup. Please try again.');
  }
}

/**
 * Format student list for display in flow
 * @param {Array} students - Array of student records
 * @returns {Array} - Formatted list for display
 */
function getStudentListSummary(students) {
  return students.map(s => {
    const displayName = s.father_name
      ? `${s.roll_number}. ${s.student_name.split(' ')[0]} ${s.father_name}`
      : `${s.roll_number}. ${s.student_name}`;

    return { name: displayName };
  });
}

/**
 * Format students list as a display string for pure dynamic reference (bd-388)
 * @param {Array} studentsSummary - Array of {name: "1. Zara Abdul"} objects
 * @returns {string} - Formatted string or empty if no students
 */
function formatStudentsListString(studentsSummary) {
  if (!studentsSummary || studentsSummary.length === 0) {
    return '';
  }
  return 'Added: ' + studentsSummary.map(s => s.name).join(', ');
}

/**
 * Create error response for flow
 * @param {string} message - Error message
 * @returns {Object} - Error response
 */
function createErrorResponse(message) {
  return {
    data: {
      error: { message }
    }
  };
}

module.exports = {
  handleSetupInit,
  handleSetupDataExchange,
  handleAddStudentAction,
  handleDoneAction,
  getStudentListSummary,
  formatStudentsListString,
  getCurrentAcademicYear
};
