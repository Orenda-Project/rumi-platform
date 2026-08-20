/**
 * slack-interactions.routes.js's makeRoutedInteractionsHandler — the
 * dispatch fork between view_submission, modal open/back block_actions,
 * and ordinary chat block_actions. Exercised directly against the
 * exported mount() function's internal handler (via a constructed router),
 * with slack-modal-interactions.handler and the inbound adapter mocked so
 * this test is pure dispatch-logic, not integration.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/slack-signature.service', () => ({
  isConfigured: jest.fn(() => true),
  verify: jest.fn(() => true),
}));

function loadRoutedHandler() {
  jest.resetModules();

  const modalInteractions = {
    isOpenModalAction: (id) => typeof id === 'string' && id.startsWith('open_modal:'),
    isBackAction: (id) => typeof id === 'string' && id.endsWith('_back'),
    isAttendanceFinishAction: (id) => id === 'attendance_finish',
    isCountryBucketAction: (id) => id === 'country_bucket_select',
    handleOpenModal: jest.fn().mockResolvedValue(true),
    handleBackButton: jest.fn().mockResolvedValue(true),
    handleAttendanceFinish: jest.fn().mockResolvedValue(true),
    handleCountryBucketChange: jest.fn().mockResolvedValue(true),
    handleViewSubmission: jest.fn().mockResolvedValue({ response_action: 'clear' }),
  };
  jest.doMock('../../bot/shared/routes/slack-modal-interactions.handler', () => modalInteractions);

  const chatHandler = jest.fn().mockImplementation(async (req, res) => res.status(200).send(''));
  jest.doMock('../../bot/shared/services/messaging/inbound/slack-events.adapter', () => ({
    makeEventsHandler: jest.fn(() => async (req, res) => res.status(200).send('')),
    makeInteractionsHandler: jest.fn(() => chatHandler),
    makeSlashCommandHandler: jest.fn(() => async (req, res) => res.status(200).send('')),
  }));

  const mount = require('../../bot/shared/routes/slack-interactions.routes');
  const dispatch = jest.fn();
  const router = mount(dispatch);
  const interactionsLayer = router.stack.find((l) => l.route?.path === '/interactions');
  // Last handler in the stack is the routed handler itself (after verifyAndParse).
  const routedHandler = interactionsLayer.route.stack[interactionsLayer.route.stack.length - 1].handle;

  return { routedHandler, modalInteractions, chatHandler };
}

function fakeRes() {
  const calls = { status: [], json: [], send: [] };
  const res = {
    status(code) { calls.status.push(code); return res; },
    json(body) { calls.json.push(body); return res; },
    send(body) { calls.send.push(body); return res; },
  };
  res._calls = calls;
  return res;
}

describe('makeRoutedInteractionsHandler dispatch', () => {
  it('routes view_submission to handleViewSubmission and returns its response_action as JSON', async () => {
    const { routedHandler, modalInteractions } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'view_submission' }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleViewSubmission).toHaveBeenCalledTimes(1);
    expect(res._calls.status).toEqual([200]);
    expect(res._calls.json).toEqual([{ response_action: 'clear' }]);
  });

  it('routes an open_modal: block_actions to handleOpenModal, acking 200 immediately', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'open_modal:registration' }] }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleOpenModal).toHaveBeenCalledTimes(1);
    expect(chatHandler).not.toHaveBeenCalled();
    expect(res._calls.status).toEqual([200]);
  });

  it('routes a *_back block_actions to handleBackButton', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'registration_back' }] }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleBackButton).toHaveBeenCalledTimes(1);
    expect(chatHandler).not.toHaveBeenCalled();
  });

  it('routes an attendance_finish block_actions to handleAttendanceFinish, acking 200 immediately', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'attendance_finish' }] }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleAttendanceFinish).toHaveBeenCalledTimes(1);
    expect(modalInteractions.handleOpenModal).not.toHaveBeenCalled();
    expect(modalInteractions.handleBackButton).not.toHaveBeenCalled();
    expect(chatHandler).not.toHaveBeenCalled();
    expect(res._calls.status).toEqual([200]);
  });

  it('routes a country_bucket_select block_actions to handleCountryBucketChange, acking 200 immediately', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'country_bucket_select', selected_option: { value: 'europe' } }] }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleCountryBucketChange).toHaveBeenCalledTimes(1);
    expect(modalInteractions.handleOpenModal).not.toHaveBeenCalled();
    expect(modalInteractions.handleBackButton).not.toHaveBeenCalled();
    expect(modalInteractions.handleAttendanceFinish).not.toHaveBeenCalled();
    expect(chatHandler).not.toHaveBeenCalled();
    expect(res._calls.status).toEqual([200]);
  });

  it('falls through to the ordinary chat handler for a ordinary block_actions click', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'menu_lesson_plan' }] }) } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(modalInteractions.handleOpenModal).not.toHaveBeenCalled();
    expect(modalInteractions.handleBackButton).not.toHaveBeenCalled();
    expect(chatHandler).toHaveBeenCalledTimes(1);
  });

  it('responds 400 for unparseable payload JSON, touching neither path', async () => {
    const { routedHandler, modalInteractions, chatHandler } = loadRoutedHandler();
    const req = { body: { payload: '{not json' } };
    const res = fakeRes();

    await routedHandler(req, res);

    expect(res._calls.status).toEqual([400]);
    expect(modalInteractions.handleOpenModal).not.toHaveBeenCalled();
    expect(chatHandler).not.toHaveBeenCalled();
  });
});
