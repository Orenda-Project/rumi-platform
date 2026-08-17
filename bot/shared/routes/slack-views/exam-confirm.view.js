/**
 * Block Kit screen mapping for the exam-checker student-confirmation
 * Flow-equivalent — the counterpart to discord-views/exam-confirm.view.js,
 * shaped for Slack's slack-modal-flow.js screenToView()/viewToScreenData()
 * contract.
 *
 * CONFIRM_STUDENTS renders the dynamically-sized roster
 * (exam-confirm-endpoint.js's `data.students`, an array of {id, title}) as a
 * single Block Kit `checkboxes` element — the same `data.countries.map(toOption)`
 * pattern slack-views/registration.view.js's PERSONAL_INFO screen already
 * uses for a runtime-sized array. Unlike Discord's StringSelectMenu (hard
 * capped at 25 options, forcing a 2-select chunking scheme on that side),
 * Slack's Block Kit `checkboxes` element has no documented hard option cap —
 * so no chunking is needed here. (Slack DOES cap a `static_select`'s options
 * at 100 and a modal at 100 total blocks, but `checkboxes` is a single block
 * holding all of its options as one element's `options` array, not one block
 * per option — so a 40-student roster is one block with 40 option entries,
 * nowhere near either limit.)
 *
 * Every option defaults to checked (matching Meta's CheckboxGroup default —
 * all pre-selected; the teacher unchecks anyone who isn't a real student),
 * via Block Kit's `initial_options`.
 *
 * No Back button (exam-confirm-endpoint.js's own handleExamConfirmBack just
 * re-renders this same screen — nothing upstream of it to navigate to), and
 * no separate Done-style action needed: the modal's native Submit IS the
 * confirm action, matching how exam-confirm-endpoint.js's own
 * handleExamConfirmDataExchange doesn't distinguish an intermediate action.
 */

function toOption(row) {
  // Block Kit option text is capped at 75 chars; the endpoint's rows are {id, title}.
  return { text: { type: 'plain_text', text: String(row.title).slice(0, 75) }, value: String(row.id) };
}

function screenToView(screen, data, ctx) {
  const metadata = ctx.metadata;

  if (screen === 'CONFIRM_STUDENTS') {
    const students = data?.students || [];
    const options = students.map(toOption);

    return {
      type: 'modal',
      callback_id: 'exam_confirm',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Confirm Students' },
      submit: { type: 'plain_text', text: 'Confirm & Grade' },
      blocks: [
        ...(data?.subheading ? [{ type: 'section', block_id: 'subheading_block', text: { type: 'plain_text', text: data.subheading } }] : []),
        {
          type: 'input', block_id: 'confirmed_students_block',
          label: { type: 'plain_text', text: (data?.heading || 'Students').slice(0, 2000) },
          element: {
            type: 'checkboxes',
            action_id: 'confirmed_students',
            options,
            initial_options: options,
          },
        },
      ],
    };
  }

  throw new Error(`slack-views/exam-confirm: no view mapping for screen "${screen}"`);
}

function viewToScreenData(screen, stateValues) {
  const get = (blockId, actionId) => stateValues?.[blockId]?.[actionId];

  if (screen === 'CONFIRM_STUDENTS') {
    const selected = get('confirmed_students_block', 'confirmed_students')?.selected_options || [];
    return { confirmed_students: selected.map((o) => o.value) };
  }
  return {};
}

const FIRST_INPUT_BLOCK_ID = { CONFIRM_STUDENTS: 'confirmed_students_block' };

module.exports = { screenToView, viewToScreenData, FIRST_INPUT_BLOCK_ID, toOption };
