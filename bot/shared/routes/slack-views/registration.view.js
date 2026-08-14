/**
 * Block Kit screen mapping for the registration Flow — the Slack renderer's
 * counterpart to registration-endpoint.js's {screen, data} contract.
 *
 * One small per-screen mapping file, not a generic field-type inferrer: a
 * generic mapper can't tell "a form field" from "just narrative text to
 * show" (SUCCESS's welcome_message/portal_message aren't form fields at
 * all), and can't guess UX-specific choices like `subjects` needing a
 * multi_static_select rather than checkboxes. Lives next to the endpoint it
 * renders, same principle as docs/flows/ keeping sanitized JSON next to the
 * Flow it documents.
 */

function toOption(row) {
  // Block Kit option text is capped at 75 chars; Flow dropdown rows are {id, title}.
  return { text: { type: 'plain_text', text: String(row.title).slice(0, 75) }, value: String(row.id) };
}

function backButton() {
  return {
    type: 'button',
    action_id: 'registration_back',
    text: { type: 'plain_text', text: 'Back' },
  };
}

function screenToView(screen, data, ctx) {
  const metadata = ctx.metadata;

  if (screen === 'PERSONAL_INFO') {
    return {
      type: 'modal',
      callback_id: 'registration',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Register with Rumi' },
      submit: { type: 'plain_text', text: 'Next' },
      blocks: [
        {
          type: 'input', block_id: 'full_name_block',
          label: { type: 'plain_text', text: 'Full name' },
          element: { type: 'plain_text_input', action_id: 'full_name' },
        },
        {
          type: 'input', block_id: 'country_block',
          label: { type: 'plain_text', text: 'Country' },
          element: { type: 'static_select', action_id: 'country', options: data.countries.map(toOption) },
        },
      ],
    };
  }

  if (screen === 'REGION_INFO') {
    return {
      type: 'modal',
      callback_id: 'registration',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Register with Rumi' },
      submit: { type: 'plain_text', text: 'Next' },
      blocks: [
        {
          type: 'input', block_id: 'region_block',
          label: { type: 'plain_text', text: 'Region' },
          element: { type: 'static_select', action_id: 'region', options: data.regions.map(toOption) },
        },
        { type: 'actions', block_id: 'back_block', elements: [backButton()] },
      ],
    };
  }

  if (screen === 'PROFESSIONAL_INFO') {
    return {
      type: 'modal',
      callback_id: 'registration',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Register with Rumi' },
      submit: { type: 'plain_text', text: 'Next' },
      blocks: [
        {
          type: 'input', block_id: 'organization_block',
          label: { type: 'plain_text', text: 'Organization' },
          element: { type: 'static_select', action_id: 'organization', options: data.organizations.map(toOption) },
        },
        {
          type: 'input', block_id: 'school_name_block', optional: true,
          label: { type: 'plain_text', text: 'School name' },
          element: { type: 'plain_text_input', action_id: 'school_name' },
        },
        {
          type: 'input', block_id: 'grade_block',
          label: { type: 'plain_text', text: 'Grade' },
          element: { type: 'static_select', action_id: 'grade', options: data.grades.map(toOption) },
        },
        {
          type: 'input', block_id: 'subjects_block',
          label: { type: 'plain_text', text: 'Subjects' },
          element: { type: 'multi_static_select', action_id: 'subjects', options: data.subjects.map(toOption) },
        },
        { type: 'actions', block_id: 'back_block', elements: [backButton()] },
      ],
    };
  }

  if (screen === 'ORG_DETAILS') {
    return {
      type: 'modal',
      callback_id: 'registration',
      private_metadata: metadata,
      title: { type: 'plain_text', text: 'Register with Rumi' },
      submit: { type: 'plain_text', text: 'Finish' },
      blocks: [
        {
          type: 'input', block_id: 'organization_other_block',
          label: { type: 'plain_text', text: 'Organization name' },
          element: { type: 'plain_text_input', action_id: 'organization_other' },
        },
        { type: 'actions', block_id: 'back_block', elements: [backButton()] },
      ],
    };
  }

  throw new Error(`registration.view: no view mapping for screen "${screen}"`);
}

function viewToScreenData(screen, stateValues) {
  const get = (blockId, actionId) => stateValues?.[blockId]?.[actionId];

  if (screen === 'PERSONAL_INFO') {
    return {
      full_name: get('full_name_block', 'full_name')?.value || '',
      country: get('country_block', 'country')?.selected_option?.value || '',
    };
  }
  if (screen === 'REGION_INFO') {
    return { region: get('region_block', 'region')?.selected_option?.value || null };
  }
  if (screen === 'PROFESSIONAL_INFO') {
    return {
      organization: get('organization_block', 'organization')?.selected_option?.value || '',
      school_name: get('school_name_block', 'school_name')?.value || '',
      grade: get('grade_block', 'grade')?.selected_option?.value || '',
      subjects: (get('subjects_block', 'subjects')?.selected_options || []).map((o) => o.value),
    };
  }
  if (screen === 'ORG_DETAILS') {
    return { organization_other: get('organization_other_block', 'organization_other')?.value || '' };
  }
  return {};
}

// The block_id carrying the FIRST input on each screen — where a validation
// error from exchange() surfaces via Slack's response_action: 'errors'.
const FIRST_INPUT_BLOCK_ID = {
  PERSONAL_INFO: 'full_name_block',
  REGION_INFO: 'region_block',
  PROFESSIONAL_INFO: 'organization_block',
  ORG_DETAILS: 'organization_other_block',
};

module.exports = { screenToView, viewToScreenData, FIRST_INPUT_BLOCK_ID, toOption };
