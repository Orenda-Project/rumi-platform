/**
 * slack-modal-interactions.handler.js — dispatches the three
 * modal-specific Slack interaction shapes: opening the first modal,
 * the Back button, and view_submission.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUserByChannel: jest.fn(async () => ({ id: 'db-user-1' })),
}));

function loadHandler({ renderer } = {}) {
  jest.resetModules();
  const flowRegistry = {
    ensureRegistered: jest.fn(),
    get: jest.fn(() => renderer),
    buildFlowToken: jest.fn((userId, kind) => `${userId}:${kind}:169`),
  };
  jest.doMock('../../bot/shared/routes/slack-flow-registry', () => flowRegistry);

  const slackWebClient = {
    openView: jest.fn().mockResolvedValue(undefined),
    updateView: jest.fn().mockResolvedValue(undefined),
    postMessage: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock('../../bot/shared/services/messaging/slack-web-client', () => slackWebClient);

  const handler = require('../../bot/shared/routes/slack-modal-interactions.handler');
  const { getOrCreateUserByChannel } = require('../../bot/shared/database/bot-helpers');
  return { handler, flowRegistry, slackWebClient, getOrCreateUserByChannel };
}

describe('isOpenModalAction / isBackAction', () => {
  it('recognizes the open_modal: prefix and the _back suffix', () => {
    const { handler } = loadHandler();
    expect(handler.isOpenModalAction('open_modal:registration')).toBe(true);
    expect(handler.isOpenModalAction('menu_lesson_plan')).toBe(false);
    expect(handler.isBackAction('registration_back')).toBe(true);
    expect(handler.isBackAction('registration')).toBe(false);
  });
});

describe('handleOpenModal', () => {
  it('returns false for a payload whose action is not open_modal:', async () => {
    const { handler } = loadHandler();
    const handled = await handler.handleOpenModal({ actions: [{ action_id: 'menu_lesson_plan' }] });
    expect(handled).toBe(false);
  });

  it('resolves the DB user, mints a flow token, and opens the initial view via trigger_id', async () => {
    const renderer = { buildInitialView: jest.fn().mockResolvedValue({ type: 'modal' }) };
    const { handler, getOrCreateUserByChannel, slackWebClient, flowRegistry } = loadHandler({ renderer });

    const payload = {
      trigger_id: 'trigger-123',
      user: { id: 'U0123ABC' },
      actions: [{ action_id: 'open_modal:registration' }],
    };
    const handled = await handler.handleOpenModal(payload);

    expect(handled).toBe(true);
    expect(getOrCreateUserByChannel).toHaveBeenCalledWith('slack', 'U0123ABC');
    expect(flowRegistry.buildFlowToken).toHaveBeenCalledWith('db-user-1', 'registration');
    expect(renderer.buildInitialView).toHaveBeenCalledWith({
      userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169',
    });
    expect(slackWebClient.openView).toHaveBeenCalledWith('trigger-123', { type: 'modal' });
  });

  it('does not throw when no renderer is registered for the kind — logs and returns true (handled, nothing to open)', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const handled = await handler.handleOpenModal({
      trigger_id: 't', user: { id: 'U1' }, actions: [{ action_id: 'open_modal:unknown_kind' }],
    });
    expect(handled).toBe(true);
  });
});

describe('handleBackButton', () => {
  it('returns false for a payload whose action is not a *_back action', async () => {
    const { handler } = loadHandler();
    const handled = await handler.handleBackButton({ actions: [{ action_id: 'menu_lesson_plan' }] });
    expect(handled).toBe(false);
  });

  it('calls the renderer\'s handleBack and updates the current view via view.id', async () => {
    const renderer = { handleBack: jest.fn().mockResolvedValue({ type: 'modal', screen: 'PERSONAL_INFO' }) };
    const { handler, slackWebClient } = loadHandler({ renderer });

    const metadata = JSON.stringify({ kind: 'registration', screen: 'PROFESSIONAL_INFO', flowToken: 'db-user-1:registration:169' });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { id: 'V0123VIEW', private_metadata: metadata },
      actions: [{ action_id: 'registration_back' }],
    };
    const handled = await handler.handleBackButton(payload);

    expect(handled).toBe(true);
    expect(renderer.handleBack).toHaveBeenCalledWith(
      { userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169' },
      'PROFESSIONAL_INFO'
    );
    expect(slackWebClient.updateView).toHaveBeenCalledWith('V0123VIEW', { type: 'modal', screen: 'PERSONAL_INFO' });
  });
});

describe('handleViewSubmission', () => {
  it('resolves kind/screen/flowToken from private_metadata and calls the renderer\'s handleSubmission', async () => {
    const renderer = { handleSubmission: jest.fn().mockResolvedValue({ response_action: 'push', view: {} }) };
    const { handler } = loadHandler({ renderer });

    const metadata = JSON.stringify({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'db-user-1:registration:169' });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { private_metadata: metadata, state: { values: { some: 'values' } } },
    };
    const result = await handler.handleViewSubmission(payload);

    expect(renderer.handleSubmission).toHaveBeenCalledWith(
      { userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169' },
      'PERSONAL_INFO',
      { some: 'values' },
    );
    expect(result).toEqual({ response_action: 'push', view: {} });
  });

  it('returns null when no renderer is registered for the decoded kind', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const metadata = JSON.stringify({ kind: 'unknown', screen: 'X', flowToken: 't' });
    const result = await handler.handleViewSubmission({ user: { id: 'U1' }, view: { private_metadata: metadata } });
    expect(result).toBeNull();
  });

  it('returns a safe errors response_action if the renderer throws', async () => {
    const renderer = { handleSubmission: jest.fn().mockRejectedValue(new Error('boom')) };
    const { handler } = loadHandler({ renderer });
    const metadata = JSON.stringify({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 't' });
    const result = await handler.handleViewSubmission({ user: { id: 'U1' }, view: { private_metadata: metadata, state: { values: {} } } });
    expect(result).toEqual({ response_action: 'errors', errors: {} });
  });
});
