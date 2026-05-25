/**
 * Edit Class Endpoint Handler
 *
 * Endpoint-based WhatsApp Flow for editing class rosters. data_api_version 3.0
 * with encrypted data exchange.
 *
 * Flow screens (forward-only — Meta routing-model compliant):
 *   ROSTER_VIEW → ADD_STUDENT | REMOVE_STUDENTS | SELECT_STUDENT_TO_EDIT | SUCCESS
 *   ADD_STUDENT → ADD_STUDENT (self-loop: add & continue) | SUCCESS (done)
 *   REMOVE_STUDENTS → SUCCESS
 *   SELECT_STUDENT_TO_EDIT → EDIT_STUDENT
 *   EDIT_STUDENT → SUCCESS
 *
 * Backward navigation is NOT allowed by Meta's routing model; ADD_STUDENT
 * self-loops and the rest forward to SUCCESS.
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const { validateAndNormalizePhone } = require('../utils/phone-validation');

/**
 * Handle INIT — return ROSTER_VIEW with class info.
 * Flow token format: userId:listId
 */
async function handleEditClassInit(userId, flowToken) {
  logToFile('📋 Edit class INIT', { userId, flowToken });

  const listId = flowToken.split(':')[1];
  if (!listId) {
    return createErrorResponse('Invalid flow token — missing class ID');
  }

  return await buildRosterView(listId);
}

/**
 * Handle data_exchange for edit class screens.
 */
async function handleEditClassDataExchange(userId, screen, screenData, flowToken) {
  logToFile('📋 Edit class data_exchange', { userId, screen, screenData });

  const listId = screenData._list_id || flowToken?.split(':')[1];
  const classDisplay = screenData._class_display || '';

  if (screen === 'ROSTER_VIEW') {
    const action = screenData._action;
    if (action === 'add') return await buildAddStudentScreen(listId, classDisplay);
    if (action === 'edit') return await buildSelectStudentToEditScreen(listId, classDisplay);
    if (action === 'remove') return await buildRemoveStudentsScreen(listId, classDisplay);
    if (action === 'done') return await buildSuccessScreen(listId, classDisplay);
    return createErrorResponse('Unknown action');
  }

  if (screen === 'ADD_STUDENT') {
    const action = screenData._action;
    if (action === 'done') return await buildSuccessScreen(listId, classDisplay);
    // action === 'add': add student then self-loop to ADD_STUDENT
    return await handleAddStudent(listId, classDisplay, screenData);
  }

  if (screen === 'REMOVE_STUDENTS') {
    return await handleRemoveStudents(listId, classDisplay, screenData.students_to_remove);
  }

  if (screen === 'SELECT_STUDENT_TO_EDIT') {
    return await buildEditStudentScreen(listId, classDisplay, screenData._student_id);
  }

  if (screen === 'EDIT_STUDENT') {
    return await handleEditStudent(listId, classDisplay, screenData);
  }

  logToFile('⚠️ Unknown screen in edit class flow', { screen });
  return createErrorResponse('Unknown screen');
}

/**
 * Build ROSTER_VIEW screen data.
 */
async function buildRosterView(listId) {
  try {
    const { data: classList } = await supabase
      .from('student_lists')
      .select('id, class_name, section')
      .eq('id', listId)
      .single();

    if (!classList) {
      return createErrorResponse('Class not found');
    }

    const classDisplay = classList.section
      ? `${classList.class_name} - ${classList.section}`
      : classList.class_name;

    const { data: students } = await supabase
      .from('students')
      .select('id, student_name, father_name, roll_number')
      .eq('list_id', listId)
      .eq('is_active', true)
      .order('roll_number');

    const studentCount = students?.length || 0;
    const hasStudents = studentCount > 0;

    const studentsList = hasStudents
      ? students.map(s => (s.father_name
          ? `${s.roll_number}. ${s.student_name} (${s.father_name})`
          : `${s.roll_number}. ${s.student_name}`)).join('\n')
      : 'No students in this class yet.';

    return {
      screen: 'ROSTER_VIEW',
      data: {
        class_info: `${classDisplay} | ${studentCount} student${studentCount !== 1 ? 's' : ''}`,
        students_list: studentsList,
        has_students: hasStudents,
        list_id: listId,
        class_display: classDisplay
      }
    };
  } catch (error) {
    logToFile('❌ Error building roster view', { listId, error: error.message });
    return createErrorResponse('Failed to load class roster');
  }
}

/**
 * Build ADD_STUDENT screen (with student list summary for self-loop display).
 */
async function buildAddStudentScreen(listId, classDisplay) {
  const { data: students } = await supabase
    .from('students')
    .select('id, student_name, father_name, roll_number')
    .eq('list_id', listId)
    .eq('is_active', true)
    .order('roll_number');

  const studentCount = students?.length || 0;
  const studentsSummary = studentCount > 0
    ? 'Added: ' + students.map(s => (s.father_name
        ? `${s.roll_number}. ${s.student_name.split(' ')[0]} ${s.father_name}`
        : `${s.roll_number}. ${s.student_name}`)).join(', ')
    : '';

  return {
    screen: 'ADD_STUDENT',
    data: {
      list_id: listId,
      class_display: classDisplay,
      heading: `Add Student #${studentCount + 1}`,
      class_info: `Class: ${classDisplay} | Students: ${studentCount}`,
      students_list: studentsSummary,
      form_init_values: { first_name: '', last_name: '', parent_phone: '' }
    }
  };
}

/**
 * Build REMOVE_STUDENTS screen with student CheckboxGroup data.
 */
async function buildRemoveStudentsScreen(listId, classDisplay) {
  const { data: students } = await supabase
    .from('students')
    .select('id, student_name, father_name, roll_number')
    .eq('list_id', listId)
    .eq('is_active', true)
    .order('roll_number');

  if (!students || students.length === 0) {
    return await buildSuccessScreen(listId, classDisplay);
  }

  const studentOptions = students.map(s => ({
    id: s.id,
    title: s.father_name
      ? `${s.roll_number}. ${s.student_name} (${s.father_name})`
      : `${s.roll_number}. ${s.student_name}`
  }));

  return {
    screen: 'REMOVE_STUDENTS',
    data: {
      list_id: listId,
      class_display: classDisplay,
      class_info: `Class: ${classDisplay} | Select students to remove`,
      students: studentOptions
    }
  };
}

/**
 * Handle adding a student — self-loop back to ADD_STUDENT with updated list.
 */
async function handleAddStudent(listId, classDisplay, screenData) {
  const { first_name, last_name, parent_phone: rawPhone } = screenData;

  if (!first_name || first_name.trim() === '') {
    return {
      screen: 'ADD_STUDENT',
      data: {
        list_id: listId,
        class_display: classDisplay,
        heading: 'Add Student',
        class_info: `Class: ${classDisplay}`,
        students_list: '',
        form_init_values: { first_name: '', last_name: '', parent_phone: '' },
        error: { message: 'Student name is required' }
      }
    };
  }

  try {
    const { data: existing } = await supabase
      .from('students')
      .select('roll_number')
      .eq('list_id', listId)
      .order('roll_number', { ascending: false });

    const nextRoll = (existing?.[0]?.roll_number || 0) + 1;

    const studentName = last_name?.trim()
      ? `${first_name.trim()} ${last_name.trim()}`
      : first_name.trim();

    // Surface phone validation errors to the teacher instead of silently dropping.
    let normalizedPhone = null;
    if (rawPhone && rawPhone.trim()) {
      const phoneResult = validateAndNormalizePhone(rawPhone.trim());
      if (phoneResult.valid) {
        normalizedPhone = phoneResult.normalized;
      } else {
        logToFile('⚠️ Invalid parent phone in edit-class — returning error screen', { error: phoneResult.error });
        return {
          screen: 'ADD_STUDENT',
          data: {
            list_id: listId,
            class_display: classDisplay,
            heading: 'Add Student',
            class_info: `Class: ${classDisplay}`,
            students_list: '',
            form_init_values: { first_name: first_name || '', last_name: last_name || '', parent_phone: rawPhone },
            error: { message: phoneResult.error }
          }
        };
      }
    }

    await supabase
      .from('students')
      .insert({
        list_id: listId,
        student_name: studentName,
        father_name: last_name?.trim() || null,
        roll_number: nextRoll,
        is_active: true,
        parent_phone: normalizedPhone
      });

    logToFile('✅ Student added via edit-class', { listId, rollNumber: nextRoll });

    return await buildAddStudentScreen(listId, classDisplay);
  } catch (error) {
    logToFile('❌ Error adding student in edit-class', { error: error.message });
    return createErrorResponse('Failed to add student');
  }
}

/**
 * Handle removing selected students (soft-delete) then forward to SUCCESS.
 */
async function handleRemoveStudents(listId, classDisplay, studentIds) {
  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return await buildSuccessScreen(listId, classDisplay);
  }

  try {
    const { error } = await supabase
      .from('students')
      .update({ is_active: false })
      .in('id', studentIds)
      .eq('list_id', listId);

    if (error) {
      logToFile('❌ Error removing students', { error: error.message });
      return createErrorResponse('Failed to remove students');
    }

    logToFile('✅ Students removed via edit-class', { listId, removedCount: studentIds.length });
    return await buildSuccessScreen(listId, classDisplay);
  } catch (error) {
    logToFile('❌ Exception removing students', { error: error.message });
    return createErrorResponse('Failed to remove students');
  }
}

/**
 * Build SUCCESS screen.
 */
async function buildSuccessScreen(listId, classDisplay) {
  const { data: students } = await supabase
    .from('students')
    .select('id')
    .eq('list_id', listId)
    .eq('is_active', true);

  const count = students?.length || 0;

  return {
    screen: 'SUCCESS',
    data: {
      success_message: `Class ${classDisplay} updated. ${count} student${count !== 1 ? 's' : ''} in roster.\n\nSay "edit class" to make more changes.`,
      extension_message_response: {
        params: { list_id: listId, class_display: classDisplay, student_count: count }
      }
    }
  };
}

/**
 * Handle BACK navigation — returns to ROSTER_VIEW with refreshed data.
 */
async function handleEditClassBack(userId, screen, flowToken) {
  logToFile('📋 Edit class BACK', { userId, screen });
  const listId = flowToken?.split(':')[1];
  return await buildRosterView(listId);
}

// ─── Edit Student capability ───────────────────────────────────────────────

/**
 * Build SELECT_STUDENT_TO_EDIT screen — Dropdown of active students.
 * No students → fall through to SUCCESS (forward-only routing).
 */
async function buildSelectStudentToEditScreen(listId, classDisplay) {
  const { data: students } = await supabase
    .from('students')
    .select('id, student_name, father_name, roll_number')
    .eq('list_id', listId)
    .eq('is_active', true)
    .order('roll_number');

  if (!students || students.length === 0) {
    return await buildSuccessScreen(listId, classDisplay);
  }

  return {
    screen: 'SELECT_STUDENT_TO_EDIT',
    data: {
      list_id: listId,
      class_display: classDisplay,
      students: students.map(s => ({
        id: s.id,
        title: s.father_name
          ? `${s.roll_number}. ${s.student_name} (${s.father_name})`
          : `${s.roll_number}. ${s.student_name}`
      }))
    }
  };
}

/**
 * Build EDIT_STUDENT screen with the picked student's data pre-filled.
 * Cross-class injection guard: requires both student.id AND list_id match.
 */
async function buildEditStudentScreen(listId, classDisplay, studentId) {
  if (!studentId) {
    return createErrorResponse('No student selected');
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, student_name, father_name, parent_phone, roll_number')
    .eq('id', studentId)
    .eq('list_id', listId)        // defence-in-depth
    .eq('is_active', true)
    .single();

  if (!student) {
    return createErrorResponse('Student not found');
  }

  const fullName  = student.student_name || '';
  const fatherTok = student.father_name || '';
  let firstName = fullName;
  if (fatherTok && fullName.endsWith(` ${fatherTok}`)) {
    firstName = fullName.slice(0, -fatherTok.length - 1);
  } else if (fatherTok && fullName === fatherTok) {
    firstName = '';
  }

  return {
    screen: 'EDIT_STUDENT',
    data: {
      list_id: listId,
      student_id: studentId,
      class_display: classDisplay,
      heading: `Editing: ${fullName}`,
      form_init_values: {
        first_name: firstName,
        last_name: fatherTok,
        parent_phone: student.parent_phone || ''
      }
    }
  };
}

/**
 * Handle EDIT_STUDENT submission — UPDATE the row, then finish.
 * Phone validation surfaces errors (does not silently drop). An empty
 * parent_phone clears the existing value (explicit teacher choice).
 */
async function handleEditStudent(listId, classDisplay, screenData) {
  const { _student_id, first_name, last_name, parent_phone: rawPhone } = screenData;

  if (!_student_id) {
    return createErrorResponse('Student ID missing');
  }

  if (!first_name || first_name.trim() === '') {
    return {
      screen: 'EDIT_STUDENT',
      data: {
        list_id: listId,
        student_id: _student_id,
        class_display: classDisplay,
        heading: 'Edit Student',
        form_init_values: { first_name: '', last_name: last_name || '', parent_phone: rawPhone || '' },
        error: { message: 'Student name is required' }
      }
    };
  }

  let normalizedPhone = null;
  if (rawPhone && rawPhone.trim()) {
    const phoneResult = validateAndNormalizePhone(rawPhone.trim());
    if (!phoneResult.valid) {
      logToFile('⚠️ Invalid phone in edit-student — returning error screen', { error: phoneResult.error });
      return {
        screen: 'EDIT_STUDENT',
        data: {
          list_id: listId,
          student_id: _student_id,
          class_display: classDisplay,
          heading: 'Edit Student',
          form_init_values: { first_name, last_name: last_name || '', parent_phone: rawPhone },
          error: { message: phoneResult.error }
        }
      };
    }
    normalizedPhone = phoneResult.normalized;
  }

  const studentName = last_name?.trim()
    ? `${first_name.trim()} ${last_name.trim()}`
    : first_name.trim();

  const { error } = await supabase
    .from('students')
    .update({
      student_name: studentName,
      father_name: last_name?.trim() || null,
      parent_phone: normalizedPhone   // null clears it; explicit teacher choice
    })
    .eq('id', _student_id)
    .eq('list_id', listId);   // belt-and-braces

  if (error) {
    logToFile('❌ Error editing student', { studentId: _student_id, error: error.message });
    return createErrorResponse('Failed to save changes');
  }

  logToFile('✅ Student edited via edit-class', { studentId: _student_id, listId });

  // Forward-only routing: EDIT_STUDENT → SUCCESS.
  return await buildSuccessScreen(listId, classDisplay);
}

function createErrorResponse(message) {
  return { data: { error: { message } } };
}

module.exports = {
  handleEditClassInit,
  handleEditClassDataExchange,
  handleEditClassBack,
  createErrorResponse
};
