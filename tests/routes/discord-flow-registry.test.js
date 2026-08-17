/**
 * discord-flow-registry.js — wires registration/settings/attendance/
 * exam_confirm/reading_assessment endpoints + their Discord views into
 * buildEndpointModal, mirroring tests/routes/slack-flow-registry.test.js's
 * conventions: mock the real endpoint modules, drive the renderer, assert
 * against the mock's calls.
 */

jest.mock('../../bot/shared/routes/registration-endpoint', () => ({
  handleRegistrationInit: jest.fn(async () => ({ screen: 'PERSONAL_INFO', data: {} })),
  handleRegistrationDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: { welcome_message: 'Welcome!', portal_message: 'Portal ready' } })),
  handleRegistrationBack: jest.fn(async () => ({ screen: 'PERSONAL_INFO', data: {} })),
}));
jest.mock('../../bot/shared/routes/settings-endpoint', () => ({
  handleSettingsInit: jest.fn(async () => ({ screen: 'SETTINGS_MAIN', data: { languages: [], frameworks: [], current_language: 'en', current_framework: 'oecd' } })),
  handleSettingsDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: { confirmation_message: 'Saved.', details_message: 'Language: English' } })),
  handleSettingsBack: jest.fn(async () => ({ screen: 'SETTINGS_MAIN', data: {} })),
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
  handleExamConfirmInit: jest.fn(async () => ({ screen: 'CONFIRM_STUDENTS', data: { students: [{ id: '0', title: '1. Zara' }] } })),
  handleExamConfirmDataExchange: jest.fn(async () => ({
    screen: 'SUCCESS',
    data: { extension_message_response: { params: { flow_token: 'session-1', confirmed_students: ['0'] } } },
  })),
  handleExamConfirmBack: jest.fn(async () => ({ screen: 'CONFIRM_STUDENTS', data: {} })),
}));
jest.mock('../../bot/shared/routes/reading-assessment-endpoint', () => ({
  handleReadingAssessmentInit: jest.fn(async () => ({
    screen: 'BASIC_INFO',
    data: { languages: [{ id: '0_English', title: 'English' }], assessment_modes: [{ id: '0_Auto', title: 'Auto' }] },
  })),
  handleReadingAssessmentDataExchange: jest.fn(async () => ({
    screen: 'SUCCESS',
    data: { student_full_name: 'Zara', Language: '0_English', assessment_mode: '0_Auto' },
  })),
  startAssessment: jest.fn(async () => ({ assessmentId: 'assessment-1' })),
}));
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  getById: jest.fn(async () => ({ id: 'session-1', user_id: 'u1', recipient_identifier: 'discord:D0123' })),
}));
jest.mock('../../bot/shared/services/exam-checker/exam-checker.orchestrator', () => ({
  ExamCheckerOrchestrator: { process: jest.fn(async () => ({})) },
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/messaging/discord-channel.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));

function load() {
  jest.resetModules();
  jest.clearAllMocks();
  return require('../../bot/shared/routes/discord-flow-registry');
}

/**
 * A trigger interaction whose client.users.fetch() resolves to a real DM
 * channel — needed only by startFlow() tests, since startFlow() runs
 * runScreen(), which calls collectEnumAnswers() for any screen with enum
 * fields (CLASS_INFO/CONFIRM_STUDENTS/BASIC_INFO all have at least one).
 * Each select-menu message's awaitMessageComponent() resolves immediately
 * with a fake selection, so startFlow() completes without hanging.
 */
function fakeTrigger() {
  const selectInteraction = { values: ['some_value'], deferUpdate: jest.fn().mockResolvedValue(undefined), showModal: jest.fn().mockResolvedValue(undefined) };
  const dmChannel = { send: jest.fn().mockResolvedValue({ awaitMessageComponent: jest.fn().mockResolvedValue(selectInteraction) }) };
  const user = { id: 'D0123', dmChannel, createDM: jest.fn().mockResolvedValue(dmChannel) };
  return { client: { users: { fetch: jest.fn().mockResolvedValue(user) } }, deferUpdate: jest.fn(), showModal: jest.fn() };
}

describe('discord-flow-registry', () => {
  it('ensureRegistered() registers all five renderers', () => {
    const registry = load();
    registry.ensureRegistered();
    expect(registry.get('registration')).toBeTruthy();
    expect(registry.get('settings')).toBeTruthy();
    expect(registry.get('attendance')).toBeTruthy();
    expect(registry.get('exam_confirm')).toBeTruthy();
    expect(registry.get('reading_assessment')).toBeTruthy();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('ensureRegistered() is idempotent — a second call does not re-register', () => {
    const registry = load();
    registry.ensureRegistered();
    const first = registry.get('registration');
    registry.ensureRegistered();
    expect(registry.get('registration')).toBe(first);
  });

  it('_resetForTests() forces the next ensureRegistered() to re-run registerAll()', () => {
    const registry = load();
    registry.ensureRegistered();
    expect(registry.get('registration')).toBeTruthy();
    registry._resetForTests();
    expect(registry.get('registration')).toBeUndefined();
    registry.ensureRegistered();
    expect(registry.get('registration')).toBeTruthy();
  });

  it('buildFlowToken follows the "userId:kind:timestamp" convention', () => {
    const registry = load();
    const token = registry.buildFlowToken('u1', 'registration');
    expect(token).toMatch(/^u1:registration:\d+$/);
  });

  it('registration renderer\'s onFinish sends the welcome/portal message to the Discord user', async () => {
    const registry = load();
    registry.ensureRegistered();
    const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');
    const registration = require('../../bot/shared/routes/registration-endpoint');
    registration.handleRegistrationDataExchange.mockResolvedValueOnce({
      screen: 'SUCCESS', data: { welcome_message: 'Welcome!', portal_message: 'Portal ready' },
    });

    const renderer = registry.get('registration');
    const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:registration:169' };
    await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'PERSONAL_INFO', {});

    expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', 'Welcome!\n\nPortal ready');
  });

  it('settings renderer\'s onFinish sends the confirmation + details message', async () => {
    const registry = load();
    registry.ensureRegistered();
    const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');

    const renderer = registry.get('settings');
    const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:settings:169' };
    await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'SETTINGS_MAIN', {});

    expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', 'Saved.\nLanguage: English');
  });

  describe('attendance renderer', () => {
    it('calls handleSetupInit with the resolved userId', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { handleSetupInit } = require('../../bot/shared/routes/attendance-setup-endpoint');

      const renderer = registry.get('attendance');
      await renderer.startFlow(
        { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:attendance:169' },
        fakeTrigger(),
      );

      expect(handleSetupInit).toHaveBeenCalledWith('u1');
    });

    it('ADD_STUDENT is a loopScreens entry — onFinish is never called for it, onScreenLoop fires instead', async () => {
      const registry = load();
      registry.ensureRegistered();
      const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');

      const renderer = registry.get('attendance');
      const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:attendance:169' };
      const result = await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'CLASS_INFO', {});

      expect(result).toBe('awaiting_choice');
      expect(discordChannel.sendInteractiveButtons).toHaveBeenCalledWith('discord:D0123', expect.objectContaining({
        buttons: [
          { id: 'discord_attendance_add:u1:attendance:169', title: 'Add Another' },
          { id: 'discord_attendance_done:u1:attendance:169', title: "I'm Done" },
        ],
      }));
    });

    it('onFinish sends the success_message once the flow reaches SUCCESS', async () => {
      const registry = load();
      registry.ensureRegistered();
      const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');
      const attendance = require('../../bot/shared/routes/attendance-setup-endpoint');
      attendance.handleSetupDataExchange.mockResolvedValueOnce({ screen: 'SUCCESS', data: { success_message: 'Class ready with 3 students.' } });

      const renderer = registry.get('attendance');
      const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:attendance:169' };
      await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'ADD_STUDENT', {});

      expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', 'Class ready with 3 students.');
    });
  });

  describe('exam_confirm renderer', () => {
    it('calls handleExamConfirmInit with the session id passed as flowToken (not a minted token)', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { handleExamConfirmInit } = require('../../bot/shared/routes/exam-confirm-endpoint');

      const renderer = registry.get('exam_confirm');
      await renderer.startFlow(
        { userId: null, discordUserId: 'D0123', flowToken: 'session-1' },
        fakeTrigger(),
      );

      expect(handleExamConfirmInit).toHaveBeenCalledWith('session-1');
    });

    it('onFinish looks up the session by id and hands off to ExamCheckerOrchestrator.process with the confirmed students', async () => {
      const registry = load();
      registry.ensureRegistered();
      const ExamSessionService = require('../../bot/shared/services/exam-checker/exam-session.service');
      const { ExamCheckerOrchestrator } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

      const renderer = registry.get('exam_confirm');
      const ctx = { userId: null, discordUserId: 'D0123', flowToken: 'session-1' };
      await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'CONFIRM_STUDENTS', {});

      expect(ExamSessionService.getById).toHaveBeenCalledWith('session-1');
      expect(ExamCheckerOrchestrator.process).toHaveBeenCalledWith(
        { type: 'flow', flowResponse: { confirmed_students: ['0'] } },
        'u1',
        'discord:D0123',
      );
    });

    it('onFinish is a no-op when the session no longer exists (expired/deleted)', async () => {
      const registry = load();
      registry.ensureRegistered();
      const ExamSessionService = require('../../bot/shared/services/exam-checker/exam-session.service');
      ExamSessionService.getById.mockResolvedValueOnce(null);
      const { ExamCheckerOrchestrator } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

      const renderer = registry.get('exam_confirm');
      const ctx = { userId: null, discordUserId: 'D0123', flowToken: 'session-gone' };
      await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'CONFIRM_STUDENTS', {});

      expect(ExamCheckerOrchestrator.process).not.toHaveBeenCalled();
    });
  });

  describe('reading_assessment renderer', () => {
    it('calls handleReadingAssessmentInit with the resolved userId', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { handleReadingAssessmentInit } = require('../../bot/shared/routes/reading-assessment-endpoint');

      const renderer = registry.get('reading_assessment');
      await renderer.startFlow(
        { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:reading_assessment:169' },
        fakeTrigger(),
      );

      expect(handleReadingAssessmentInit).toHaveBeenCalledWith('u1');
    });

    it('onFinish calls startAssessment with fields parsed from the SUCCESS screen data', async () => {
      const registry = load();
      registry.ensureRegistered();
      const { startAssessment } = require('../../bot/shared/routes/reading-assessment-endpoint');

      const renderer = registry.get('reading_assessment');
      const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:reading_assessment:169' };
      await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'BASIC_INFO', {});

      expect(startAssessment).toHaveBeenCalledWith('u1', 'discord:D0123', {
        studentName: 'Zara', language: 'en', isAutoMode: true, levelIndex: '0', comprehensionRequired: false,
      });
    });

    it('onFinish sends an error message and does not throw when startAssessment fails', async () => {
      const registry = load();
      registry.ensureRegistered();
      const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');
      const { startAssessment } = require('../../bot/shared/routes/reading-assessment-endpoint');
      startAssessment.mockRejectedValueOnce(new Error('DB unreachable'));

      const renderer = registry.get('reading_assessment');
      const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:reading_assessment:169' };
      await expect(renderer._advance(ctx, { deferUpdate: jest.fn() }, 'BASIC_INFO', {})).resolves.not.toThrow();

      expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', expect.stringMatching(/something went wrong/i));
    });

    it('extracts manual-mode Urdu + comprehension fields correctly', async () => {
      const registry = load();
      registry.ensureRegistered();
      const readingAssessment = require('../../bot/shared/routes/reading-assessment-endpoint');
      readingAssessment.handleReadingAssessmentDataExchange.mockResolvedValueOnce({
        screen: 'SUCCESS',
        data: {
          student_full_name: 'Ayesha', Language: '1_Urdu', assessment_mode: '1_Manual',
          select_the_reading_level: '2_Sentences_(Grade_1-2)', scope_of_assessment_: '1_Fluency_+_Comprehension',
        },
      });

      const renderer = registry.get('reading_assessment');
      const ctx = { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:reading_assessment:169' };
      await renderer._advance(ctx, { deferUpdate: jest.fn() }, 'OPTIONS', {});

      expect(readingAssessment.startAssessment).toHaveBeenCalledWith('u1', 'discord:D0123', {
        studentName: 'Ayesha', language: 'ur', isAutoMode: false, levelIndex: '2', comprehensionRequired: true,
      });
    });
  });
});
