/**
 * LP Coaching Linker Service
 *
 * Handles LP selection responses from the interactive list.
 * Links selected LP to coaching session, fetches LP content
 * for analysis, or triggers upload flow.
 *
 * Bead: bd-620 (Phase 1C-D)
 */

const supabase = require('../../../config/supabase');
const { logToFile } = require('../../../utils/logger');

/**
 * Parse the LP selection button ID to determine action and LP id.
 *
 * Button ID formats:
 *   lp_select_{lpId}_{sessionId} → select a recent LP
 *   lp_upload_{sessionId}        → upload new
 *   lp_none_{sessionId}          → no LP
 *
 * @param {string} buttonId
 * @returns {{ action: 'select'|'upload'|'none', lpId: string|null }}
 */
function parseSelectionId(buttonId) {
  if (buttonId.startsWith('lp_select_')) {
    // lp_select_{lpId}_{sessionId} — lpId is between 'lp_select_' and last '_sessionId'
    const withoutPrefix = buttonId.slice('lp_select_'.length);
    const lastUnderscore = withoutPrefix.lastIndexOf('_');
    const lpId = withoutPrefix.slice(0, lastUnderscore);
    return { action: 'select', lpId };
  }
  if (buttonId.startsWith('lp_upload_')) {
    return { action: 'upload', lpId: null };
  }
  if (buttonId.startsWith('lp_none_')) {
    return { action: 'none', lpId: null };
  }
  return { action: 'none', lpId: null };
}

/**
 * Handle an LP selection response from the teacher.
 *
 * @param {string} coachingSessionId - Session UUID
 * @param {string} selectionId - Button/list row ID
 * @returns {Promise<{linked_lesson_plan_id: string|null, lesson_plan_link_method: string, lesson_plan_content: object|null, awaiting_upload: boolean}>}
 */
async function handleLPSelection(coachingSessionId, selectionId) {
  const { action, lpId } = parseSelectionId(selectionId);

  if (action === 'none') {
    try {
      await supabase
        .from('coaching_sessions')
        .update({
          linked_lesson_plan_id: null,
          lesson_plan_link_method: 'none',
          has_lesson_plan: false,
        })
        .eq('id', coachingSessionId);
    } catch (error) {
      logToFile('Error updating session for no LP', { error: error.message });
    }

    logToFile('LP selection: none', { coachingSessionId });
    return {
      linked_lesson_plan_id: null,
      lesson_plan_link_method: 'none',
      lesson_plan_content: null,
      awaiting_upload: false,
    };
  }

  if (action === 'upload') {
    try {
      await supabase
        .from('coaching_sessions')
        .update({ lesson_plan_link_method: 'uploaded' })
        .eq('id', coachingSessionId);
    } catch (error) {
      logToFile('Error updating session for LP upload', { error: error.message });
    }

    logToFile('LP selection: upload new', { coachingSessionId });
    return {
      linked_lesson_plan_id: null,
      lesson_plan_link_method: 'uploaded',
      lesson_plan_content: null,
      awaiting_upload: true,
    };
  }

  // action === 'select' — fetch the LP and link it
  try {
    const { data: lp, error } = await supabase
      .from('lesson_plans')
      .select('id, topic, grade, subject, content')
      .eq('id', lpId)
      .single();

    if (error || !lp) {
      logToFile('LP not found for linking', { lpId, error: error?.message });
      return {
        linked_lesson_plan_id: null,
        lesson_plan_link_method: 'none',
        lesson_plan_content: null,
        awaiting_upload: false,
      };
    }

    await supabase
      .from('coaching_sessions')
      .update({
        linked_lesson_plan_id: lp.id,
        lesson_plan_link_method: 'selected_recent',
        has_lesson_plan: true,
      })
      .eq('id', coachingSessionId);

    logToFile('LP linked to coaching session', {
      coachingSessionId,
      lpId: lp.id,
      topic: lp.topic,
    });

    return {
      linked_lesson_plan_id: lp.id,
      lesson_plan_link_method: 'selected_recent',
      lesson_plan_content: lp,
      awaiting_upload: false,
    };
  } catch (error) {
    logToFile('Error linking LP to session', { error: error.message, lpId });
    return {
      linked_lesson_plan_id: null,
      lesson_plan_link_method: 'none',
      lesson_plan_content: null,
      awaiting_upload: false,
    };
  }
}

module.exports = { handleLPSelection, parseSelectionId };
