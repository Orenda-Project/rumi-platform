/**
 * Discord screen mapping for the attendance/class-setup Flow-equivalent —
 * the counterpart to slack-views/attendance.view.js, shaped for
 * discord-modal-flow.js's screenToSteps()/mergeScreenData() contract.
 *
 * CLASS_INFO: one enum field (attendance_frequency: once/twice — a static
 * 2-option list, confirmed against docs/flows/attendance-setup-flow.json)
 * plus two text fields (class_name, section).
 *
 * ADD_STUDENT: both fields (first_name, last_name) are free text, zero enum
 * — modal-only, no collector step. The Add/Done duality is handled OUTSIDE
 * this file (in discord-modal-interactions.handler.js's post-submission
 * message with two real buttons — "Add Another" / "I'm Done" — since a
 * modal itself can carry no such choice; see that file's own doc comment).
 * mergeScreenData reads `_action`/`_list_id`/`_class_display` from
 * screenData exactly like the Slack/Meta renderers already do — these are
 * carried through by discord-modal-interactions.handler.js, not collected
 * from the teacher at all.
 */

const { StringSelectMenuBuilder } = require('discord.js');

const FREQUENCY_OPTIONS = [
  { id: 'once', title: 'Once per day' },
  { id: 'twice', title: 'Twice (morning & afternoon)' },
];

function buildFrequencyMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('attendance_frequency')
    .setPlaceholder('How often do you take attendance?')
    .addOptions(FREQUENCY_OPTIONS.map((o) => ({ label: o.title, value: o.id })));
}

function screenToSteps(screen, data) {
  if (screen === 'CLASS_INFO') {
    return {
      steps: [
        { fieldName: 'attendance_frequency', promptText: 'How often do you take attendance?', buildMenu: buildFrequencyMenu },
      ],
      textFields: [
        { name: 'class_name', label: 'Class / grade name', required: true },
        { name: 'section', label: 'Section (optional)', required: false },
      ],
      title: 'Set up your class',
    };
  }

  if (screen === 'ADD_STUDENT') {
    return {
      steps: [],
      textFields: [
        { name: 'first_name', label: 'Student first name', required: true },
        { name: 'last_name', label: 'Student last name (optional)', required: false },
      ],
      title: data?.heading || 'Add a student',
    };
  }

  throw new Error(`discord-views/attendance: no screen mapping for "${screen}"`);
}

/**
 * @param {string} screen
 * @param {object} enumAnswers
 * @param {object} textAnswers
 * @param {object} [carriedData] - ADD_STUDENT's previous response `data`
 *   (list_id/class_display), never collected from the teacher — matching how
 *   the Meta Flow round-trips these as hidden `_list_id`/`_class_display`
 *   form fields (see docs/flows/attendance-setup-flow.json:188-190).
 *   `_action` defaults to 'add' here; discord-modal-interactions.handler.js's
 *   "I'm Done" button overrides it to 'done' before calling exchange() directly.
 */
function mergeScreenData(screen, enumAnswers, textAnswers, carriedData = {}) {
  if (screen === 'CLASS_INFO') {
    return {
      class_name: textAnswers.class_name || '',
      section: textAnswers.section || '',
      attendance_frequency: enumAnswers.attendance_frequency || '',
    };
  }
  if (screen === 'ADD_STUDENT') {
    return {
      first_name: textAnswers.first_name || '',
      last_name: textAnswers.last_name || '',
      _action: 'add',
      _list_id: carriedData.list_id,
      _class_display: carriedData.class_display,
    };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, FREQUENCY_OPTIONS };
