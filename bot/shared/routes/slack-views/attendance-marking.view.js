/**
 * Block Kit screen mapping for the tap-to-mark attendance Flow-equivalent —
 * shaped for Slack's slack-modal-flow.js screenToView()/viewToScreenData()
 * contract, modeled directly on slack-views/exam-confirm.view.js's
 * `checkboxes` pattern.
 *
 * MARK_ABSENT renders the dynamically-sized roster (attendance-marking-
 * endpoint.js's `data.students`, an array of {id, title}) as a single Block
 * Kit `checkboxes` element. Like exam-confirm's roster, Slack's `checkboxes`
 * element has no documented hard option cap (unlike Discord's 25-option
 * StringSelectMenu, which needs chunking) — one block holds the whole class.
 *
 * Convention matches docs/flows/attendance-marking-flow.json's CheckboxGroup:
 * checking a box marks that student ABSENT. Nothing is pre-checked (the
 * default — everyone present), unlike exam-confirm's all-pre-checked
 * "confirmed" semantics, since the two screens mean opposite things by a
 * checked box.
 */

function toOption(row) {
  // Block Kit option text is capped at 75 chars; the endpoint's rows are {id, title}.
  return { text: { type: 'plain_text', text: String(row.title).slice(0, 75) }, value: String(row.id) };
}

function screenToView(screen, data, ctx) {
  const metadata = ctx.metadata;

  if (screen === 'MARK_ABSENT') {
    const students = data?.students || [];
    const options = students.map(toOption);

    return {
      type: 'modal',
      callback_id: 'attendance_mark',
      private_metadata: metadata,
      title: { type: 'plain_text', text: (data?.class_display || 'Attendance').slice(0, 24) },
      submit: { type: 'plain_text', text: 'Mark Attendance' },
      blocks: [
        {
          type: 'section', block_id: 'instructions_block',
          text: { type: 'plain_text', text: 'Check the students who are ABSENT. Everyone else will be marked present.' },
        },
        {
          // optional: true — submitting with nobody checked (everyone
          // present) is a valid, common case, not a validation failure.
          type: 'input', block_id: 'absent_students_block', optional: true,
          label: { type: 'plain_text', text: 'Absent students' },
          element: {
            type: 'checkboxes',
            action_id: 'absent_students',
            options,
          },
        },
      ],
    };
  }

  if (screen === 'SUCCESS') {
    // Terminal confirmation shown in-modal; onFinish (slack-flow-registry.js)
    // also DMs the same success_message and drives the actual Excel
    // generation/delivery — this view is just the visual close-out.
    return {
      type: 'modal',
      callback_id: 'attendance_mark',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Attendance recorded' },
      blocks: [
        { type: 'section', block_id: 'success_block', text: { type: 'plain_text', text: data?.success_message || 'Attendance recorded!' } },
      ],
    };
  }

  throw new Error(`slack-views/attendance-marking: no view mapping for screen "${screen}"`);
}

function viewToScreenData(screen, stateValues) {
  const get = (blockId, actionId) => stateValues?.[blockId]?.[actionId];

  if (screen === 'MARK_ABSENT') {
    const selected = get('absent_students_block', 'absent_students')?.selected_options || [];
    return { absent_student_ids: selected.map((o) => o.value) };
  }
  return {};
}

const FIRST_INPUT_BLOCK_ID = { MARK_ABSENT: 'absent_students_block' };

module.exports = { screenToView, viewToScreenData, FIRST_INPUT_BLOCK_ID, toOption };
