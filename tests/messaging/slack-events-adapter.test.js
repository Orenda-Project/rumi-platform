/**
 * slack-events.adapter.js — mapping Slack's Events API messages and
 * block_actions interactivity payloads into the Meta-webhook-shaped payload
 * whatsapp-bot.js's handleWebhookPost already dispatches on. Mirrors
 * baileys-socket.adapter.js's own test coverage style, adapted for an
 * HTTP-handler adapter rather than a persistent-socket listener.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const {
  mapEventToMetaShape,
  mapBlockActionToMetaShape,
  toPrefixedIdentity,
  isDuplicateDelivery,
  makeEventsHandler,
  makeInteractionsHandler,
  _resetSeenEventsForTests,
} = require('../../bot/shared/services/messaging/inbound/slack-events.adapter');

afterEach(() => _resetSeenEventsForTests());

describe('toPrefixedIdentity', () => {
  it('prefixes a bare Slack user id with "slack:"', () => {
    expect(toPrefixedIdentity('U0123ABC')).toBe('slack:U0123ABC');
  });
});

describe('mapEventToMetaShape', () => {
  it('maps a plain user text message to the Meta text shape, with the prefixed identity', () => {
    const event = { type: 'message', user: 'U0123ABC', text: 'Hello Rumi', ts: '1699999999.000100' };
    const mapped = mapEventToMetaShape(event);
    expect(mapped).toEqual({
      from: 'slack:U0123ABC',
      id: '1699999999.000100',
      timestamp: 1699999999,
      type: 'text',
      text: { body: 'Hello Rumi' },
    });
  });

  it('skips a bot message (has bot_id)', () => {
    expect(mapEventToMetaShape({ type: 'message', bot_id: 'B0123', user: 'U0123ABC', text: 'echo', ts: '169' })).toBeNull();
  });

  it('skips a message with a subtype (edits, deletes, channel-join notices, etc.)', () => {
    expect(mapEventToMetaShape({ type: 'message', subtype: 'message_changed', user: 'U0123ABC', text: 'edited', ts: '169' })).toBeNull();
  });

  it('skips an event with no user or no text', () => {
    expect(mapEventToMetaShape({ type: 'message', text: 'no user', ts: '169' })).toBeNull();
    expect(mapEventToMetaShape({ type: 'message', user: 'U0123ABC', ts: '169' })).toBeNull();
  });

  it('returns null for a nullish event', () => {
    expect(mapEventToMetaShape(null)).toBeNull();
    expect(mapEventToMetaShape(undefined)).toBeNull();
  });
});

describe('mapBlockActionToMetaShape', () => {
  it('maps a button click to the Meta button_reply shape, using the button value as the id directly (no menu bookkeeping)', () => {
    const payload = {
      user: { id: 'U0123ABC' },
      container: { message_ts: '1699999999.000100' },
      actions: [{ type: 'button', value: 'menu_lesson_plan', text: { text: 'Lesson Plans' } }],
    };
    const mapped = mapBlockActionToMetaShape(payload);
    expect(mapped).toEqual({
      from: 'slack:U0123ABC',
      id: '1699999999.000100',
      timestamp: expect.any(Number),
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'menu_lesson_plan', title: 'Lesson Plans' } },
    });
  });

  it('maps a static_select choice to the Meta list_reply shape', () => {
    const payload = {
      user: { id: 'U0123ABC' },
      container: { message_ts: '1699999999.000100' },
      actions: [{
        type: 'static_select',
        selected_option: { value: 'lang_ur', text: { text: 'اردو' } },
      }],
    };
    const mapped = mapBlockActionToMetaShape(payload);
    expect(mapped.interactive).toEqual({ type: 'list_reply', list_reply: { id: 'lang_ur', title: 'اردو' } });
  });

  it('returns null when there is no action, or an unhandled action type', () => {
    expect(mapBlockActionToMetaShape({ user: { id: 'U1' }, actions: [] })).toBeNull();
    expect(mapBlockActionToMetaShape({ user: { id: 'U1' }, actions: [{ type: 'overflow' }] })).toBeNull();
  });

  it('returns null for a static_select with no selected_option', () => {
    expect(mapBlockActionToMetaShape({ user: { id: 'U1' }, actions: [{ type: 'static_select' }] })).toBeNull();
  });
});

describe('isDuplicateDelivery', () => {
  it('returns false for an unseen id and true for the same id seen again', () => {
    expect(isDuplicateDelivery('Ev0123')).toBe(false);
    expect(isDuplicateDelivery('Ev0123')).toBe(true);
  });

  it('treats an absent id as never a duplicate (never records it)', () => {
    expect(isDuplicateDelivery(undefined)).toBe(false);
    expect(isDuplicateDelivery(undefined)).toBe(false);
  });
});

describe('makeEventsHandler', () => {
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

  it('answers the url_verification handshake by echoing the challenge, unsigned', async () => {
    const dispatch = jest.fn();
    const handler = makeEventsHandler(dispatch);
    const req = { body: { type: 'url_verification', challenge: 'abc123' } };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([200]);
    expect(res._calls.json).toEqual([{ challenge: 'abc123' }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('acks immediately with 200 and dispatches a mapped text event', async () => {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const handler = makeEventsHandler(dispatch);
    const req = {
      body: {
        type: 'event_callback',
        event_id: 'Ev001',
        event: { type: 'message', user: 'U0123ABC', text: 'hi', ts: '169.001' },
      },
    };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([200]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'slack:U0123ABC', type: 'text', text: { body: 'hi' } })
    );
  });

  it('does not dispatch twice for a redelivered event_id', async () => {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const handler = makeEventsHandler(dispatch);
    const body = {
      type: 'event_callback',
      event_id: 'Ev002',
      event: { type: 'message', user: 'U0123ABC', text: 'hi again', ts: '169.002' },
    };
    await handler({ body }, fakeRes());
    await handler({ body }, fakeRes());
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch for a skippable event (e.g. bot echo)', async () => {
    const dispatch = jest.fn();
    const handler = makeEventsHandler(dispatch);
    const req = {
      body: {
        type: 'event_callback',
        event_id: 'Ev003',
        event: { type: 'message', bot_id: 'B1', user: 'U0123ABC', text: 'echo', ts: '169.003' },
      },
    };
    await handler(req, fakeRes());
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('makeInteractionsHandler', () => {
  function fakeRes() {
    const calls = { status: [], send: [] };
    const res = {
      status(code) { calls.status.push(code); return res; },
      send(body) { calls.send.push(body); return res; },
    };
    res._calls = calls;
    return res;
  }

  it('parses the form-encoded payload field, acks 200, and dispatches a mapped button click', async () => {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const handler = makeInteractionsHandler(dispatch);
    const payloadObj = {
      type: 'block_actions',
      user: { id: 'U0123ABC' },
      container: { message_ts: '169.010' },
      actions: [{ type: 'button', value: 'menu_video', text: { text: 'Video' } }],
    };
    const req = { body: { payload: JSON.stringify(payloadObj) } };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([200]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch for a view_submission payload — that is a separate modal-renderer concern', async () => {
    const dispatch = jest.fn();
    const handler = makeInteractionsHandler(dispatch);
    const req = { body: { payload: JSON.stringify({ type: 'view_submission' }) } };
    await handler(req, fakeRes());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('responds 400 on unparseable payload JSON', async () => {
    const dispatch = jest.fn();
    const handler = makeInteractionsHandler(dispatch);
    const req = { body: { payload: '{not json' } };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([400]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
