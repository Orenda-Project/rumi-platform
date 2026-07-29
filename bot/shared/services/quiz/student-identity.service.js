'use strict';
/**
 * who is on this handset?
 *
 * A child who takes a shared quiz should type their name once, not before every
 * quiz their teacher sends. This is the small amount of memory that makes that
 * true.
 *
 * WHY THE EXISTING `students` TABLE AND NOT A NEW ONE
 * `students` already holds 1,425 children across 214 attendance rosters, and
 * already carries the teacher relation (students.list_id -> student_lists.user_id).
 * Two facts make it the right home rather than a parallel table:
 *   - list_id is NULLABLE, so a child who belongs to no roster fits as-is;
 *   - every existing read of `students` is scoped by list_id (or is a lookup by
 *     primary key), so a list_id NULL row is invisible to attendance,
 *     edit-class, reading assessment and the flow endpoint.
 * quiz_sessions.student_id was already a nullable FK to students. It had simply
 * never been populated.
 *
 * WHY PHONE IS NOT UNIQUE
 * Siblings share a handset. A unique constraint would either reject the second
 * child or silently file their score under the first one's name — and their
 * teacher would have no way to see that happening. So the lookup returns a LIST
 * and the caller asks which child it is. Guessing is the one thing this module
 * will not do.
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');

const NAME_MAX = 60;
const CLASS_MAX = 40;

/**
 * One handset, one key.
 *
 * Children arrive on whatever their parent's phone is saved as, so the same
 * number reaches us as `+92 300 1234567`, `03001234567` and `923001234567`
 * depending on the handset. Without this they would be three different children.
 * Same normalisation the rest of the bot uses for PK numbers.
 */
function normalisePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `92${d.slice(1)}`;
  else if (d.startsWith('3') && d.length === 10) d = `92${d}`;
  return d.slice(0, 15);
}

/**
 * Everyone known to be on this handset, most recently seen first.
 *
 * Returns [] for an unknown number — the caller asks for a name. Returns more
 * than one when siblings share the phone; the caller must then ask, never pick.
 */
async function findByPhone(phone) {
  const key = normalisePhone(phone);
  if (!key) return [];
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, student_name, self_reported_class, created_at')
      .eq('phone', key)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      // Fail OPEN: a lookup failure must not block a child from taking a quiz.
      // Worst case they type their name again, which is the old behaviour.
      logToFile('⚠️ student identity lookup failed', { error: error.message });
      return [];
    }
    return data || [];
  } catch (err) {
    logToFile('⚠️ student identity lookup threw', { error: err.message });
    return [];
  }
}

/**
 * Remember a child we have not met before.
 *
 * `list_id` is deliberately left unset: this child reached us through a quiz
 * link, belongs to no attendance roster, and must not appear in one.
 */
async function remember({ phone, name, className, enrolledByUserId = null }) {
  const key = normalisePhone(phone);
  if (!key || !name) return null;
  try {
    const { data, error } = await supabase
      .from('students')
      .insert({
        student_name: String(name).slice(0, NAME_MAX),
        self_reported_class: className ? String(className).slice(0, CLASS_MAX) : null,
        phone: key,
        // the teacher whose shared quiz brought this child in. Set here,
        // on first sight, and never rewritten — see touch().
        enrolled_by_user_id: enrolledByUserId,
        is_active: true,
      })
      .select('id, student_name, self_reported_class')
      .single();
    if (error) {
      logToFile('⚠️ could not remember student', { error: error.message });
      return null;
    }
    logEvent('video_quiz.student_remembered', { studentId: data.id });
    return data;
  } catch (err) {
    logToFile('⚠️ remember student threw', { error: err.message });
    return null;
  }
}

/**
 * A child we already know has come back. Keep the class current — children move
 * up a year, and the report should say where they are now, not where they were.
 */
async function touch(studentId, { className } = {}) {
  if (!studentId) return;
  const patch = { updated_at: new Date().toISOString() };
  if (className) patch.self_reported_class = String(className).slice(0, CLASS_MAX);
  try {
    await supabase.from('students').update(patch).eq('id', studentId);
  } catch (err) {
    logToFile('⚠️ could not touch student', { studentId, error: err.message });
  }
}

/**
 * the children a teacher has enrolled through her shared quizzes.
 *
 * This is the question `students` could not answer before: the only teacher
 * association was per-QUIZ (session -> share code -> teacher), so a returning
 * child was recognised as somebody, but never as HERS.
 */
async function findByTeacher(userId, { limit = 200 } = {}) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, student_name, self_reported_class, phone, created_at')
      .eq('enrolled_by_user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      logToFile('⚠️ could not list a teacher\'s students', { error: error.message });
      return [];
    }
    return data || [];
  } catch (err) {
    logToFile('⚠️ findByTeacher threw', { error: err.message });
    return [];
  }
}

module.exports = {
  normalisePhone, findByPhone, remember, touch, findByTeacher,
  NAME_MAX, CLASS_MAX,
};
