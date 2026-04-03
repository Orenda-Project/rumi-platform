/**
 * LP Selection List Builder
 *
 * Builds the WhatsApp interactive list for selecting a lesson plan
 * to link to a coaching session. Falls back to Yes/No buttons
 * when the teacher has no recent LPs.
 *
 * Bead: bd-619 (Phase 1C-D)
 */

const { logToFile } = require('../../../utils/logger');

/**
 * Truncate a string to maxLen, appending '...' if truncated.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Build either an interactive list (if recent LPs exist) or
 * fallback Yes/No buttons for LP selection.
 *
 * @param {string} coachingSessionId - Session UUID
 * @param {Array<{id: string, topic: string, grade: string, created_at: string}>} recentLPs
 * @param {string} language - User's language (en, ur, etc.)
 * @returns {{ type: 'list'|'buttons', listData?: object, body?: string, buttons?: Array }}
 */
function buildLPSelectionList(coachingSessionId, recentLPs, language = 'en') {
  const isUrdu = language === 'ur';

  // Fallback: no recent LPs → simple Yes/No buttons
  if (!recentLPs || recentLPs.length === 0) {
    return {
      type: 'buttons',
      body: isUrdu
        ? 'کیا آپ کے پاس اس کلاس کا سبق کا منصوبہ ہے؟'
        : 'Do you have a lesson plan for this class?',
      buttons: [
        { id: `lessonplan_yes_${coachingSessionId}`, title: isUrdu ? 'ہاں' : 'Yes' },
        { id: `lessonplan_no_${coachingSessionId}`, title: isUrdu ? 'نہیں' : 'No' },
      ],
    };
  }

  // Build interactive list rows from recent LPs
  const lpRows = recentLPs.map((lp) => {
    const date = lp.created_at ? new Date(lp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return {
      id: `lp_select_${lp.id}_${coachingSessionId}`,
      title: truncate(lp.topic || 'Untitled', 24),
      description: truncate(`Grade ${lp.grade || '?'} • ${date}`, 72),
    };
  });

  // Options section: Upload new + No LP
  const optionRows = [
    {
      id: `lp_upload_${coachingSessionId}`,
      title: isUrdu ? 'نیا اپلوڈ کریں' : 'Upload new',
      description: isUrdu ? 'اپنا سبق کا منصوبہ بھیجیں' : 'Send your lesson plan document',
    },
    {
      id: `lp_none_${coachingSessionId}`,
      title: isUrdu ? 'نہیں' : 'No lesson plan',
      description: isUrdu ? 'بغیر سبق کے جاری رکھیں' : 'Continue without a lesson plan',
    },
  ];

  const listData = {
    header: { type: 'text', text: isUrdu ? 'سبق کا منصوبہ' : 'Lesson Plan' },
    body: {
      text: isUrdu
        ? 'کیا آپ اپنا حالیہ سبق کا منصوبہ منسلک کرنا چاہیں گے؟ درس کے تجزیے کو بہتر بنائے گا۔'
        : 'Would you like to link a recent lesson plan? It improves the analysis.',
    },
    footer: { text: isUrdu ? 'رومی ڈیجیٹل کوچ' : 'Rumi Digital Coach' },
    action: {
      button: isUrdu ? 'منتخب کریں' : 'Select',
      sections: [
        {
          title: 'Recent Lesson Plans',
          rows: lpRows,
        },
        {
          title: 'Options',
          rows: optionRows,
        },
      ],
    },
  };

  logToFile('LP selection list built', {
    coachingSessionId,
    lpCount: recentLPs.length,
    language,
  });

  return { type: 'list', listData };
}

module.exports = { buildLPSelectionList };
