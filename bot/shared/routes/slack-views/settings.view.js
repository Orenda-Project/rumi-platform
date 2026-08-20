/**
 * Block Kit screen mapping for the settings Flow — the Slack renderer's
 * counterpart to settings-endpoint.js's single-screen {screen, data} contract.
 */

function toOption(row) {
  return { text: { type: 'plain_text', text: String(row.title).slice(0, 75) }, value: String(row.id) };
}

function screenToView(screen, data, ctx) {
  const metadata = ctx.metadata;
  const currentLangOpt = data.languages.find((l) => l.id === data.current_language);
  const currentFwOpt = data.frameworks.find((f) => f.id === data.current_framework);

  return {
    type: 'modal',
    callback_id: 'settings',
    private_metadata: metadata,
    title: { type: 'plain_text', text: 'Rumi Settings' },
    submit: { type: 'plain_text', text: 'Save' },
    blocks: [
      {
        type: 'input', block_id: 'language_block',
        label: { type: 'plain_text', text: 'Reply language' },
        element: {
          type: 'static_select', action_id: 'language',
          options: data.languages.map(toOption),
          ...(currentLangOpt ? { initial_option: toOption(currentLangOpt) } : {}),
        },
      },
      {
        type: 'input', block_id: 'framework_block',
        label: { type: 'plain_text', text: 'Observation framework' },
        element: {
          type: 'static_select', action_id: 'observation_framework',
          options: data.frameworks.map(toOption),
          ...(currentFwOpt ? { initial_option: toOption(currentFwOpt) } : {}),
        },
        ...(data.info_text ? { hint: { type: 'plain_text', text: data.info_text.slice(0, 150) } } : {}),
      },
    ],
  };
}

function viewToScreenData(screen, stateValues) {
  const get = (blockId, actionId) => stateValues?.[blockId]?.[actionId];
  return {
    language: get('language_block', 'language')?.selected_option?.value || 'en',
    observation_framework: get('framework_block', 'observation_framework')?.selected_option?.value || 'oecd',
  };
}

const FIRST_INPUT_BLOCK_ID = { SETTINGS_MAIN: 'language_block' };

module.exports = { screenToView, viewToScreenData, FIRST_INPUT_BLOCK_ID, toOption };
