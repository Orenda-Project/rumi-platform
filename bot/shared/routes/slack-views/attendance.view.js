/**
 * Block Kit screen mapping for the attendance/class-setup Flow-equivalent —
 * the counterpart to discord-views/attendance.view.js, shaped for Slack's
 * slack-modal-flow.js screenToView()/viewToScreenData() contract.
 *
 * CLASS_INFO: one enum field (attendance_frequency: once/twice — a static
 * 2-option list, confirmed against docs/flows/attendance-setup-flow.json)
 * plus two text fields (class_name, section).
 *
 * ADD_STUDENT: both fields (first_name, last_name) are free text, zero enum.
 * The Add/Done duality: the modal's native Submit button stays "Add & Continue"
 * (an ordinary view_submission, handled by buildEndpointModal's own
 * handleSubmission -> attendance-setup-endpoint.js's handleAddStudentAction).
 * A SEPARATE "I'm Done" button lives in this same view as a plain `actions`
 * block (a block_actions interaction, NOT a modal submission — Slack modals
 * may contain `actions` blocks alongside `input` blocks; the registration
 * view's own back_block already proves this coexists fine). That button's
 * action_id is `attendance_finish` — recognized and handled by
 * slack-modal-interactions.handler.js, which calls handleDoneAction directly
 * with screenData._action = 'done', matching what
 * attendance-setup-endpoint.js's handleSetupDataExchange already expects at
 * `_action`/`_list_id`/`_class_display` (the same hidden-field round-trip
 * convention docs/flows/attendance-setup-flow.json:188-190 uses for Meta).
 *
 * {list_id, class_display} are never collected from the teacher — they're
 * threaded through private_metadata's `carry` field (see this file's own
 * metadataCarry() and slack-modal-flow.js's encodeMetadata `carry` param),
 * exactly like discord-views/attendance.view.js's mergeScreenData
 * carriedData param serves the same role for Discord's Redis-backed state.
 */

function toOption(row) {
  return { text: { type: 'plain_text', text: String(row.title).slice(0, 75) }, value: String(row.id) };
}

const FREQUENCY_OPTIONS = [
  { id: 'once', title: 'Once per day' },
  { id: 'twice', title: 'Twice (morning & afternoon)' },
];

function screenToView(screen, data, ctx) {
  const metadata = ctx.metadata;

  if (screen === 'CLASS_INFO') {
    return {
      type: 'modal',
      callback_id: 'attendance',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Set up your class' },
      submit: { type: 'plain_text', text: 'Next: Add Students' },
      blocks: [
        {
          type: 'input', block_id: 'class_name_block',
          label: { type: 'plain_text', text: 'Class / grade name' },
          element: { type: 'plain_text_input', action_id: 'class_name' },
        },
        {
          type: 'input', block_id: 'section_block', optional: true,
          label: { type: 'plain_text', text: 'Section (optional)' },
          element: { type: 'plain_text_input', action_id: 'section' },
        },
        {
          type: 'input', block_id: 'attendance_frequency_block',
          label: { type: 'plain_text', text: 'How often do you take attendance?' },
          element: { type: 'static_select', action_id: 'attendance_frequency', options: FREQUENCY_OPTIONS.map(toOption) },
        },
      ],
    };
  }

  if (screen === 'ADD_STUDENT') {
    return {
      type: 'modal',
      callback_id: 'attendance',
      private_metadata: metadata,
      title: { type: 'plain_text', text: (data?.heading || 'Add a student').slice(0, 24) },
      submit: { type: 'plain_text', text: 'Add & Continue' },
      blocks: [
        ...(data?.class_info ? [{ type: 'section', block_id: 'class_info_block', text: { type: 'plain_text', text: data.class_info } }] : []),
        ...(data?.students_list ? [{ type: 'section', block_id: 'students_list_block', text: { type: 'plain_text', text: data.students_list } }] : []),
        // handleDoneAction rejects "I'm Done" with 0 students by re-returning
        // this same ADD_STUDENT screen with a `data.error`. Without this block
        // the reopened modal was pixel-identical to before, so the rejection
        // was invisible — see slack-modal-interactions.handler.js's
        // handleAttendanceFinish for the other half of this fix.
        ...(data?.error ? [{ type: 'section', block_id: 'add_student_error_block', text: { type: 'plain_text', text: `⚠️ ${data.error.message}` } }] : []),
        {
          type: 'input', block_id: 'first_name_block',
          label: { type: 'plain_text', text: 'Student first name' },
          element: { type: 'plain_text_input', action_id: 'first_name' },
        },
        {
          type: 'input', block_id: 'last_name_block', optional: true,
          label: { type: 'plain_text', text: 'Student last name (optional)' },
          element: { type: 'plain_text_input', action_id: 'last_name' },
        },
        {
          type: 'actions', block_id: 'attendance_finish_block',
          elements: [{ type: 'button', action_id: 'attendance_finish', style: 'primary', text: { type: 'plain_text', text: "I'm Done" } }],
        },
      ],
    };
  }

  if (screen === 'SUCCESS') {
    // Terminal confirmation, shown via views.update after handleDoneAction
    // succeeds — replaces the stale ADD_STUDENT form so the modal itself
    // reflects completion rather than relying solely on the separate DM
    // (see slack-modal-interactions.handler.js's handleAttendanceFinish).
    // No `submit` — this is a dead-end screen, closeable via the modal's
    // native X only.
    return {
      type: 'modal',
      callback_id: 'attendance',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'All set!' },
      blocks: [
        { type: 'section', block_id: 'success_block', text: { type: 'plain_text', text: data?.success_message || 'Class created.' } },
      ],
    };
  }

  throw new Error(`slack-views/attendance: no view mapping for screen "${screen}"`);
}

/**
 * @param {string} screen
 * @param {object} stateValues
 * @param {object} [carried] - {list_id, class_display} recovered from
 *   private_metadata's `carry` field (see slack-modal-flow.js's
 *   metadataCarry config) — ADD_STUDENT's own screenData needs these under
 *   `_list_id`/`_class_display` exactly like the Meta Flow's hidden-field
 *   round-trip (docs/flows/attendance-setup-flow.json:188-190), since
 *   attendance-setup-endpoint.js's handleSetupDataExchange reads them from
 *   screenData directly, never from anywhere else.
 */
function viewToScreenData(screen, stateValues, carried = {}) {
  const get = (blockId, actionId) => stateValues?.[blockId]?.[actionId];

  if (screen === 'CLASS_INFO') {
    return {
      class_name: get('class_name_block', 'class_name')?.value || '',
      section: get('section_block', 'section')?.value || '',
      attendance_frequency: get('attendance_frequency_block', 'attendance_frequency')?.selected_option?.value || '',
    };
  }
  if (screen === 'ADD_STUDENT') {
    return {
      first_name: get('first_name_block', 'first_name')?.value || '',
      last_name: get('last_name_block', 'last_name')?.value || '',
      _action: 'add',
      _list_id: carried?.list_id,
      _class_display: carried?.class_display,
    };
  }
  return {};
}

/**
 * Picks {list_id, class_display} out of ADD_STUDENT's response `data` to
 * round-trip via private_metadata's `carry` field — see
 * slack-modal-flow.js's buildEndpointModal `metadataCarry` config param and
 * viewToScreenData's own doc comment above for why this is needed at all
 * (the `attendance_finish` block_actions button has no view_submission
 * state.values to read them from).
 */
function metadataCarry(screen, data) {
  if (screen !== 'ADD_STUDENT') return undefined;
  return { list_id: data?.list_id, class_display: data?.class_display };
}

const FIRST_INPUT_BLOCK_ID = {
  CLASS_INFO: 'class_name_block',
  ADD_STUDENT: 'first_name_block',
};

module.exports = { screenToView, viewToScreenData, metadataCarry, FIRST_INPUT_BLOCK_ID, toOption, FREQUENCY_OPTIONS };
