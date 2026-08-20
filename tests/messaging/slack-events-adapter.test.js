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
  mapFileShareToMetaShape,
  mapBlockActionToMetaShape,
  mapSlashCommandToMetaShape,
  toPrefixedIdentity,
  toPrefixedMediaId,
  isDuplicateDelivery,
  makeEventsHandler,
  makeInteractionsHandler,
  makeSlashCommandHandler,
  _resetSeenEventsForTests,
} = require('../../bot/shared/services/messaging/inbound/slack-events.adapter');

afterEach(() => _resetSeenEventsForTests());

describe('toPrefixedIdentity', () => {
  it('prefixes a bare Slack user id with "slack:"', () => {
    expect(toPrefixedIdentity('U0123ABC')).toBe('slack:U0123ABC');
  });
});

describe('toPrefixedMediaId', () => {
  it('prefixes a bare Slack file id with "slack:" — required so the messaging router (channel-registry.js#driverForIdentifier) sends getMediaInfo/downloadMedia to the Slack driver, not the WhatsApp one', () => {
    expect(toPrefixedMediaId('F0123FILE')).toBe('slack:F0123FILE');
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

  it('skips a message with a non-file subtype (edits, deletes, channel-join notices, etc.)', () => {
    expect(mapEventToMetaShape({ type: 'message', subtype: 'message_changed', user: 'U0123ABC', text: 'edited', ts: '169' })).toBeNull();
  });

  it('delegates a file_share subtype to mapFileShareToMetaShape instead of skipping it', () => {
    const event = {
      type: 'message', subtype: 'file_share', user: 'U0123ABC', ts: '169.500',
      files: [{ id: 'F0123FILE', mimetype: 'audio/ogg', name: 'voice.ogg' }],
    };
    const mapped = mapEventToMetaShape(event);
    expect(mapped).toEqual(mapFileShareToMetaShape(event));
    expect(mapped.type).toBe('audio');
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

describe('mapFileShareToMetaShape', () => {
  it('maps an audio file to the Meta audio shape, with the media id prefixed for router dispatch', () => {
    const event = {
      user: 'U0123ABC', ts: '169.100',
      files: [{ id: 'F0123FILE', mimetype: 'audio/ogg', name: 'voice.ogg' }],
    };
    expect(mapFileShareToMetaShape(event)).toEqual({
      from: 'slack:U0123ABC',
      id: '169.100',
      timestamp: 169,
      type: 'audio',
      audio: { id: 'slack:F0123FILE', mime_type: 'audio/ogg' },
    });
  });

  it('maps an image file to the Meta image shape, carrying the event text as the caption', () => {
    const event = {
      user: 'U0123ABC', ts: '169.200', text: 'look at this',
      files: [{ id: 'F0456FILE', mimetype: 'image/png', name: 'photo.png' }],
    };
    expect(mapFileShareToMetaShape(event)).toEqual({
      from: 'slack:U0123ABC',
      id: '169.200',
      timestamp: 169,
      type: 'image',
      image: { id: 'slack:F0456FILE', mime_type: 'image/png', caption: 'look at this' },
    });
  });

  it('maps anything else (e.g. a PDF) to the Meta document shape', () => {
    const event = {
      user: 'U0123ABC', ts: '169.300',
      files: [{ id: 'F0789FILE', mimetype: 'application/pdf', name: 'lesson-plan.pdf' }],
    };
    expect(mapFileShareToMetaShape(event)).toEqual({
      from: 'slack:U0123ABC',
      id: '169.300',
      timestamp: 169,
      type: 'document',
      document: { id: 'slack:F0789FILE', mime_type: 'application/pdf', filename: 'lesson-plan.pdf' },
    });
  });

  it('only maps the first file of a multi-file share', () => {
    const event = {
      user: 'U0123ABC', ts: '169.400',
      files: [
        { id: 'F0001', mimetype: 'image/png', name: 'first.png' },
        { id: 'F0002', mimetype: 'image/png', name: 'second.png' },
      ],
    };
    expect(mapFileShareToMetaShape(event).image.id).toBe('slack:F0001');
  });

  it('returns null when there is no user, no files, or the event is a bot echo', () => {
    expect(mapFileShareToMetaShape({ ts: '1', files: [{ id: 'F1', mimetype: 'image/png' }] })).toBeNull();
    expect(mapFileShareToMetaShape({ user: 'U1', ts: '1', files: [] })).toBeNull();
    expect(mapFileShareToMetaShape({ user: 'U1', bot_id: 'B1', ts: '1', files: [{ id: 'F1', mimetype: 'image/png' }] })).toBeNull();
    expect(mapFileShareToMetaShape(null)).toBeNull();
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

  it('acks immediately with 200 and dispatches a mapped audio file_share event', async () => {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const handler = makeEventsHandler(dispatch);
    const req = {
      body: {
        type: 'event_callback',
        event_id: 'Ev010',
        event: {
          type: 'message', subtype: 'file_share', user: 'U0123ABC', ts: '169.010',
          files: [{ id: 'F0123FILE', mimetype: 'audio/ogg', name: 'voice.ogg' }],
        },
      },
    };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([200]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'slack:U0123ABC', type: 'audio', audio: { id: 'slack:F0123FILE', mime_type: 'audio/ogg' } })
    );
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

describe('mapSlashCommandToMetaShape', () => {
  it('maps a slash command with trailing text to the Meta text shape, reconstructing what the user would have typed on WhatsApp', () => {
    const body = { command: '/quiz', text: 'fractions for grade 5', user_id: 'U0123ABC' };
    const mapped = mapSlashCommandToMetaShape(body);
    expect(mapped).toEqual({
      from: 'slack:U0123ABC',
      id: expect.stringMatching(/^slash-\d+-U0123ABC$/),
      timestamp: expect.any(Number),
      type: 'text',
      text: { body: '/quiz fractions for grade 5' },
    });
  });

  it('maps a slash command with no trailing text to just the bare command', () => {
    const mapped = mapSlashCommandToMetaShape({ command: '/menu', text: '', user_id: 'U0123ABC' });
    expect(mapped.text).toEqual({ body: '/menu' });
  });

  it('drops any trailing text for /readingtest — text-message.handler.js matches it via an exact string, not a prefix', () => {
    const mapped = mapSlashCommandToMetaShape({ command: '/readingtest', text: 'grade 5 english', user_id: 'U0123ABC' });
    expect(mapped.text).toEqual({ body: '/readingtest' });
  });

  it('returns null when command or user_id is missing', () => {
    expect(mapSlashCommandToMetaShape({ text: 'x', user_id: 'U1' })).toBeNull();
    expect(mapSlashCommandToMetaShape({ command: '/quiz', text: 'x' })).toBeNull();
    expect(mapSlashCommandToMetaShape(null)).toBeNull();
  });
});

describe('makeSlashCommandHandler', () => {
  function fakeRes() {
    const calls = { status: [], send: [] };
    const res = {
      status(code) { calls.status.push(code); return res; },
      send(body) { calls.send.push(body); return res; },
    };
    res._calls = calls;
    return res;
  }

  it('acks immediately with an empty 200 and dispatches the mapped command as a text message', async () => {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const handler = makeSlashCommandHandler(dispatch);
    const req = { body: { command: '/settings', text: '', user_id: 'U0123ABC' } };
    const res = fakeRes();
    await handler(req, res);
    expect(res._calls.status).toEqual([200]);
    expect(res._calls.send).toEqual(['']);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'slack:U0123ABC', type: 'text', text: { body: '/settings' } })
    );
  });

  it('does not dispatch when the payload maps to null', async () => {
    const dispatch = jest.fn();
    const handler = makeSlashCommandHandler(dispatch);
    await handler({ body: { text: 'x' } }, fakeRes());
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
