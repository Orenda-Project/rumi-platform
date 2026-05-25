'use strict';
/**
 * Quiz readiness gate.
 *
 * Before opening the Quiz Manager Flow for a "Send to class" tap,
 * check whether the teacher has the prerequisites:
 *   1. At least one active student_lists row
 *   2. At least one is_active student in any of those classes
 *   3. At least one student with a non-empty parent_phone
 *
 * If any check fails, return the gap-filler gate so the caller can
 * route the teacher into the smallest possible Flow (Add Class →
 * Edit Class). Otherwise return `ready` and the caller proceeds with
 * the Quiz Manager Flow.
 *
 * Pure function: never sends WhatsApp messages, never writes Redis.
 * The caller decides what to do with the gate.
 *
 * Defensive: any DB error or null userId fails to `no_class` so the
 * teacher always lands in a valid setup path — never a silent dead end.
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

/**
 * @param {string} userId — teacher users.id
 * @returns {Promise<{ gate: 'no_class'|'no_students'|'no_phones'|'ready', classes?: Array<{id, class_name, section}> }>}
 */
async function checkQuizReadiness(userId) {
  if (!userId) return { gate: 'no_class' };

  try {
    // Step 1 — active classes
    const { data: classes, error: classErr } = await supabase
      .from('student_lists')
      .select('id, class_name, section')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (classErr) {
      logToFile('⚠️ checkQuizReadiness: student_lists query failed — defaulting to no_class', { userId, error: classErr.message });
      return { gate: 'no_class' };
    }
    if (!classes || classes.length === 0) {
      return { gate: 'no_class' };
    }

    const classIds = classes.map(c => c.id);

    // Step 2 — active students in any of those classes
    const { data: students, error: studentErr } = await supabase
      .from('students')
      .select('id, list_id, parent_phone, is_active')
      .in('list_id', classIds)
      .eq('is_active', true);

    if (studentErr) {
      logToFile('⚠️ checkQuizReadiness: students query failed — defaulting to no_students', { userId, error: studentErr.message });
      return { gate: 'no_students', classes };
    }

    const activeStudents = students || [];
    if (activeStudents.length === 0) {
      return { gate: 'no_students', classes };
    }

    // Step 3 — at least one parent phone
    const withPhone = activeStudents.filter(s => (s.parent_phone || '').trim().length > 0);
    if (withPhone.length === 0) {
      return { gate: 'no_phones', classes };
    }

    return { gate: 'ready', classes };
  } catch (err) {
    logToFile('⚠️ checkQuizReadiness: unexpected error — defaulting to no_class', { userId, error: err.message });
    return { gate: 'no_class' };
  }
}

module.exports = { checkQuizReadiness };
