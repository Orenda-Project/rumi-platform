/**
 * Settings Flow Endpoint Handler
 *
 * Handles the endpoint-based WhatsApp Flow for user settings.
 * Uses data_api_version 3.0 with encrypted data exchange.
 *
 * Flow screens:
 *   SETTINGS_MAIN → SUCCESS
 *
 * SETTINGS_MAIN: language, observation_framework
 *   Endpoint provides: languages, frameworks (dropdown data-sources),
 *     current_language, current_framework, info_text (pre-selected values)
 *
 * SUCCESS: terminal screen
 *   Endpoint provides: confirmation_message, details_message, extension_message_response
 *
 * Key patterns (shared with the registration endpoint):
 * - Response format: {screen, data} ONLY — NO version field
 * - INIT returns dropdown data + current values for init-values
 * - data_exchange saves preferences and returns SUCCESS
 *
 * Region-agnostic: the default observation framework comes from
 * region-config (env-driven), never a hardcoded region list.
 */

const { logToFile } = require('../utils/logger');
const { LANGUAGES_DROPDOWN, FRAMEWORKS_DROPDOWN } = require('../config/settings-config');
const { FRAMEWORK_LABELS, defaultFrameworkForRegion } = require('../config/region-config');
const supabase = require('../config/supabase');

// Look up a language's display label from the configured dropdown.
function languageLabel(code) {
  const match = LANGUAGES_DROPDOWN.find(l => l.id === code);
  return match ? match.title : (LANGUAGES_DROPDOWN[0]?.title || 'English');
}

/**
 * Handle INIT action — return SETTINGS_MAIN with current user preferences
 */
async function handleSettingsInit(userId) {
  logToFile('⚙️ Settings flow INIT', { userId });

  // Fetch user's current preferences + region
  const { data: user } = await supabase
    .from('users')
    .select('preferred_language, preferences, region')
    .eq('id', userId)
    .single();

  const prefs = user?.preferences || {};
  const region = (user?.region || '').toLowerCase();
  const regionDefault = defaultFrameworkForRegion(region);

  const currentLang = prefs.language || user?.preferred_language || 'en';
  const currentFramework = prefs.observation_framework || regionDefault;

  const regionLabel = region ? region.charAt(0).toUpperCase() + region.slice(1) : 'your region';
  const defaultLabel = FRAMEWORK_LABELS[regionDefault] || regionDefault;

  const response = {
    screen: 'SETTINGS_MAIN',
    data: {
      languages: LANGUAGES_DROPDOWN,
      frameworks: FRAMEWORKS_DROPDOWN,
      current_language: currentLang,
      current_framework: currentFramework,
      info_text: `Default for ${regionLabel}: ${defaultLabel}. You can change this anytime.`
    }
  };

  logToFile('📤 Settings INIT response', { userId, response: JSON.stringify(response) });
  return response;
}

/**
 * Handle data_exchange for settings screens
 */
async function handleSettingsDataExchange(userId, screen, screenData, flowToken) {
  logToFile('⚙️ Settings flow data_exchange', {
    userId,
    screen,
    screenDataKeys: Object.keys(screenData || {}),
    screenData
  });

  if (screen === 'SETTINGS_MAIN') {
    return await handleSettingsMainSubmit(userId, screenData, flowToken);
  }

  logToFile('⚠️ Unknown screen in settings flow', { screen });
  return { data: { error: { message: 'Unknown screen' } } };
}

/**
 * Handle SETTINGS_MAIN submission — validate and save preferences to DB
 */
async function handleSettingsMainSubmit(userId, screenData, flowToken) {
  const language = screenData.language || 'en';
  const framework = screenData.observation_framework || 'oecd';

  // Validate framework is one we support
  if (!FRAMEWORK_LABELS[framework]) {
    logToFile('⚠️ Invalid framework in settings', { userId, framework });
    return { data: { error: { message: 'Invalid observation framework' } } };
  }

  // Fetch existing preferences to merge (preserve lesson_plan_source, curriculum, etc.)
  const { data: user } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();

  const existingPrefs = user?.preferences || {};
  const updatedPrefs = {
    ...existingPrefs,
    language,
    observation_framework: framework,
  };

  // Update preferences JSONB + preferred_language column (legacy compat)
  await supabase
    .from('users')
    .update({
      preferences: updatedPrefs,
      preferred_language: language,
    })
    .eq('id', userId);

  const langLabel = languageLabel(language);
  const frameworkLabel = FRAMEWORK_LABELS[framework] || framework;

  const response = {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: {
          flow_token: flowToken,
          language,
          observation_framework: framework,
        }
      },
      confirmation_message: 'Your settings have been saved successfully.',
      details_message: `Language: ${langLabel} | Observation: ${frameworkLabel}`
    }
  };

  logToFile('📤 SETTINGS_MAIN → SUCCESS', {
    userId, language, framework, response: JSON.stringify(response)
  });

  return response;
}

/**
 * Handle BACK navigation — return to SETTINGS_MAIN with current values
 */
async function handleSettingsBack(userId, screen, flowToken) {
  logToFile('⚙️ Settings flow BACK', { userId, screen });
  return await handleSettingsInit(userId);
}

module.exports = {
  handleSettingsInit,
  handleSettingsDataExchange,
  handleSettingsBack,
};
