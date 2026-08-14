/**
 * slack-flow-registry.js — wires registration/settings endpoints + their
 * views into buildEndpointModal, exactly the pattern
 * tests/messaging/text-flow-definitions.test.js already uses: mock the real
 * endpoint modules, drive the renderer, assert against the mock's calls.
 */

jest.mock('../../bot/shared/routes/registration-endpoint', () => ({
  handleRegistrationInit: jest.fn(async () => ({ screen: 'PERSONAL_INFO', data: { countries: [{ id: 'PK', title: 'Pakistan' }] } })),
  handleRegistrationDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: { welcome_message: 'Welcome!' } })),
  handleRegistrationBack: jest.fn(async () => ({ screen: 'PERSONAL_INFO', data: { countries: [] } })),
}));
jest.mock('../../bot/shared/routes/settings-endpoint', () => ({
  handleSettingsInit: jest.fn(async () => ({
    screen: 'SETTINGS_MAIN',
    data: { languages: [{ id: 'en', title: 'English' }], frameworks: [{ id: 'oecd', title: 'OECD' }], current_language: 'en', current_framework: 'oecd' },
  })),
  handleSettingsDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: { confirmation_message: 'Saved.' } })),
  handleSettingsBack: jest.fn(async () => ({
    screen: 'SETTINGS_MAIN',
    data: { languages: [], frameworks: [], current_language: 'en', current_framework: 'oecd' },
  })),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/messaging/slack-web-client', () => ({
  postMessage: jest.fn().mockResolvedValue(undefined),
  openView: jest.fn().mockResolvedValue(undefined),
  pushView: jest.fn().mockResolvedValue(undefined),
  updateView: jest.fn().mockResolvedValue(undefined),
}));

function load() {
  jest.resetModules();
  jest.clearAllMocks();
  return require('../../bot/shared/routes/slack-flow-registry');
}

describe('slack-flow-registry', () => {
  it('ensureRegistered() registers both registration and settings renderers', () => {
    const registry = load();
    registry.ensureRegistered();
    expect(registry.get('registration')).toBeTruthy();
    expect(registry.get('settings')).toBeTruthy();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('ensureRegistered() is idempotent — a second call does not re-register (no duplicate work)', () => {
    const registry = load();
    registry.ensureRegistered();
    const first = registry.get('registration');
    registry.ensureRegistered();
    expect(registry.get('registration')).toBe(first);
  });

  it('registration renderer calls handleRegistrationInit with the resolved userId', async () => {
    const registry = load();
    registry.ensureRegistered();
    const { handleRegistrationInit } = require('../../bot/shared/routes/registration-endpoint');

    const renderer = registry.get('registration');
    await renderer.buildInitialView({ userId: 'u1', flowToken: 'u1:registration:169' });

    expect(handleRegistrationInit).toHaveBeenCalledWith('u1');
  });

  it('registration renderer\'s onFinish posts the welcome/portal message to the Slack user', async () => {
    const registry = load();
    registry.ensureRegistered();
    const slackWebClient = require('../../bot/shared/services/messaging/slack-web-client');

    const renderer = registry.get('registration');
    const ctx = { userId: 'u1', flowToken: 'u1:registration:169', slackUserId: 'U0123ABC' };
    await renderer.handleSubmission(ctx, 'PROFESSIONAL_INFO', {
      organization_block: { organization: { selected_option: { value: 'fde' } } },
      school_name_block: { school_name: { value: '' } },
      grade_block: { grade: { selected_option: { value: 'grade_1' } } },
      subjects_block: { subjects: { selected_options: [] } },
    });

    expect(slackWebClient.postMessage).toHaveBeenCalledWith('U0123ABC', expect.stringContaining('Welcome!'));
  });

  it('settings renderer\'s onFinish posts the confirmation message', async () => {
    const registry = load();
    registry.ensureRegistered();
    const slackWebClient = require('../../bot/shared/services/messaging/slack-web-client');

    const renderer = registry.get('settings');
    const ctx = { userId: 'u1', flowToken: 'u1:settings:169', slackUserId: 'U0123ABC' };
    await renderer.handleSubmission(ctx, 'SETTINGS_MAIN', {
      language_block: { language: { selected_option: { value: 'en' } } },
      framework_block: { observation_framework: { selected_option: { value: 'oecd' } } },
    });

    expect(slackWebClient.postMessage).toHaveBeenCalledWith('U0123ABC', 'Saved.');
  });

  it('buildFlowToken follows the existing "userId:kind:timestamp" convention', () => {
    const registry = load();
    const token = registry.buildFlowToken('u1', 'registration');
    expect(token).toMatch(/^u1:registration:\d+$/);
  });
});
