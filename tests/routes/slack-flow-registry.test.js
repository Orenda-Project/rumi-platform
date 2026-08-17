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
jest.mock('../../bot/shared/routes/attendance-setup-endpoint', () => ({
  handleSetupInit: jest.fn(async () => ({ screen: 'CLASS_INFO', data: {} })),
  handleSetupDataExchange: jest.fn(async () => ({
    screen: 'ADD_STUDENT',
    data: { list_id: 'list-1', class_display: 'Grade 3 - A', heading: 'Add Student #1' },
  })),
  handleDoneAction: jest.fn(async () => ({ screen: 'SUCCESS', data: { success_message: 'Class ready with 3 students.' } })),
}));
jest.mock('../../bot/shared/routes/exam-confirm-endpoint', () => ({
  handleExamConfirmInit: jest.fn(async () => ({
    screen: 'CONFIRM_STUDENTS',
    data: { heading: 'I found 2 students', students: [{ id: '0', title: '1. Zara' }] },
  })),
  handleExamConfirmDataExchange: jest.fn(async () => ({
    screen: 'SUCCESS',
    data: { extension_message_response: { params: { flow_token: 'session-1', confirmed_students: ['0'] } } },
  })),
  handleExamConfirmBack: jest.fn(async () => ({ screen: 'CONFIRM_STUDENTS', data: { students: [] } })),
}));
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  getById: jest.fn(async () => ({ id: 'session-1', user_id: 'u1', recipient_identifier: 'slack:U0123ABC' })),
}));
jest.mock('../../bot/shared/services/exam-checker/exam-checker.orchestrator', () => ({
  ExamCheckerOrchestrator: { process: jest.fn(async () => ({})) },
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
  it('ensureRegistered() registers registration, settings, attendance, and exam_confirm renderers', () => {
    const registry = load();
    registry.ensureRegistered();
    expect(registry.get('registration')).toBeTruthy();
    expect(registry.get('settings')).toBeTruthy();
    expect(registry.get('attendance')).toBeTruthy();
    expect(registry.get('exam_confirm')).toBeTruthy();
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

  describe('attendance renderer', () => {
    it('calls handleSetupInit with the resolved userId on buildInitialView', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { handleSetupInit } = require('../../bot/shared/routes/attendance-setup-endpoint');

      const renderer = registry.get('attendance');
      await renderer.buildInitialView({ userId: 'u1', flowToken: 'u1:attendance:169' });

      expect(handleSetupInit).toHaveBeenCalledWith('u1');
    });

    it('ADD_STUDENT submission carries {list_id, class_display} in the pushed view\'s private_metadata (metadataCarry)', async () => {
      const registry = load();
      registry.ensureRegistered();

      const renderer = registry.get('attendance');
      const ctx = { userId: 'u1', flowToken: 'u1:attendance:169', slackUserId: 'U0123ABC' };
      const result = await renderer.handleSubmission(ctx, 'CLASS_INFO', {
        class_name_block: { class_name: { value: 'Grade 3' } },
        section_block: { section: { value: 'A' } },
        attendance_frequency_block: { attendance_frequency: { selected_option: { value: 'once' } } },
      });

      expect(result.response_action).toBe('push');
      const metadata = JSON.parse(result.view.private_metadata);
      expect(metadata.carry).toEqual({ list_id: 'list-1', class_display: 'Grade 3 - A' });
    });

    it('onFinish posts the success_message to the Slack user on the terminal screen', async () => {
      const registry = load();
      registry.ensureRegistered();
      const attendanceEndpoint = require('../../bot/shared/routes/attendance-setup-endpoint');
      attendanceEndpoint.handleSetupDataExchange.mockResolvedValueOnce({
        screen: 'SUCCESS', data: { success_message: 'Class ready with 3 students.' },
      });
      const slackWebClient = require('../../bot/shared/services/messaging/slack-web-client');

      const renderer = registry.get('attendance');
      const ctx = { userId: 'u1', flowToken: 'u1:attendance:169', slackUserId: 'U0123ABC' };
      const result = await renderer.handleSubmission(ctx, 'ADD_STUDENT', {
        first_name_block: { first_name: { value: 'Zara' } },
        last_name_block: { last_name: { value: '' } },
      });

      expect(result).toEqual({ response_action: 'clear' });
      expect(slackWebClient.postMessage).toHaveBeenCalledWith('U0123ABC', 'Class ready with 3 students.');
    });
  });

  describe('exam_confirm renderer', () => {
    it('calls handleExamConfirmInit with the session id passed as flowToken (not a minted token)', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { handleExamConfirmInit } = require('../../bot/shared/routes/exam-confirm-endpoint');

      const renderer = registry.get('exam_confirm');
      await renderer.buildInitialView({ userId: null, flowToken: 'session-1' });

      expect(handleExamConfirmInit).toHaveBeenCalledWith('session-1');
    });

    it('onFinish looks up the session by id and hands off to ExamCheckerOrchestrator.process with the confirmed students', async () => {
      const registry = load();
      registry.ensureRegistered();
      const ExamSessionService = require('../../bot/shared/services/exam-checker/exam-session.service');
      const { ExamCheckerOrchestrator } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

      const renderer = registry.get('exam_confirm');
      const ctx = { userId: null, flowToken: 'session-1', slackUserId: 'U0123ABC' };
      const result = await renderer.handleSubmission(ctx, 'CONFIRM_STUDENTS', {
        confirmed_students_block: { confirmed_students: { selected_options: [{ value: '0' }] } },
      });

      expect(result).toEqual({ response_action: 'clear' });
      expect(ExamSessionService.getById).toHaveBeenCalledWith('session-1');
      expect(ExamCheckerOrchestrator.process).toHaveBeenCalledWith(
        { type: 'flow', flowResponse: { confirmed_students: ['0'] } },
        'u1',
        'slack:U0123ABC',
      );
    });

    it('onFinish is a no-op when the session no longer exists (expired/deleted)', async () => {
      const registry = load();
      registry.ensureRegistered();
      const ExamSessionService = require('../../bot/shared/services/exam-checker/exam-session.service');
      ExamSessionService.getById.mockResolvedValueOnce(null);
      const { ExamCheckerOrchestrator } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

      const renderer = registry.get('exam_confirm');
      const ctx = { userId: null, flowToken: 'session-gone', slackUserId: 'U0123ABC' };
      await renderer.handleSubmission(ctx, 'CONFIRM_STUDENTS', {});

      expect(ExamCheckerOrchestrator.process).not.toHaveBeenCalled();
    });
  });
});
