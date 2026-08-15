/**
 * slack-interactions.routes.js — the route-layer wiring: signature
 * verification runs BEFORE any dispatch, and the two content-type shapes
 * (Events API JSON vs Interactivity form-encoded `payload`) are parsed
 * correctly before handing off to the inbound adapter.
 *
 * Exercised as plain Express middleware functions (not over a real HTTP
 * server) — mirrors this repo's existing route-test style for
 * flow-endpoint.routes.js.
 */

const crypto = require('crypto');

const SIGNING_SECRET = 'test-signing-secret';

function sign(timestamp, rawBody) {
  const base = `v0:${timestamp}:${rawBody}`;
  return 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
}

function loadRouter() {
  jest.resetModules();
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  // slack-interactions.routes.js requires slack-modal-interactions.handler.js,
  // which requires bot-helpers.js -> the real config/supabase.js ->
  // @supabase/supabase-js — a bot/-only dependency CI installs AFTER root
  // `npm test` runs (see CLAUDE.md's "TDD" note). Mocking supabase here, same
  // as every other suite that touches bot-helpers.js, keeps this test from
  // needing that package installed at all.
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
  const dispatch = jest.fn().mockResolvedValue(undefined);
  const mountSlackRoutes = require('../../bot/shared/routes/slack-interactions.routes');
  const router = mountSlackRoutes(dispatch);
  return { router, dispatch };
}

afterEach(() => {
  delete process.env.SLACK_SIGNING_SECRET;
  jest.resetModules();
});

/** Finds the layer handling `method`+`path` on an Express Router, and invokes its stack of handlers in order. */
async function invokeRoute(router, method, urlPath, req) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === urlPath && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route registered for ${method.toUpperCase()} ${urlPath}`);

  const calls = { status: [], json: [], send: [] };
  const res = {
    status(code) { calls.status.push(code); return res; },
    json(body) { calls.json.push(body); return res; },
    send(body) { calls.send.push(body); return res; },
  };

  for (const handler of layer.route.stack) {
    let nextCalled = false;
    await new Promise((resolve, reject) => {
      const next = () => { nextCalled = true; resolve(); };
      Promise.resolve(handler.handle(req, res, next)).then(() => {
        if (!nextCalled) resolve();
      }).catch(reject);
    });
    if (!nextCalled) break; // a handler that didn't call next() ended the chain (e.g. sent a response)
  }

  return { res, calls };
}

describe('slack-interactions.routes — /events', () => {
  it('verifies the signature and dispatches on a correctly-signed Events API request', async () => {
    const { router, dispatch } = loadRouter();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev001',
      event: { type: 'message', user: 'U0123ABC', text: 'hi', ts: '169.001' },
    });
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': sign(timestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
      path: '/events',
    };

    const { calls } = await invokeRoute(router, 'post', '/events', req);
    expect(calls.status).toContain(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects an incorrectly-signed request with 401, never dispatching', async () => {
    const { router, dispatch } = loadRouter();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ type: 'event_callback', event_id: 'Ev002', event: {} });
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': 'v0=deadbeef',
      },
      rawBody: Buffer.from(rawBody),
      path: '/events',
    };

    const { calls } = await invokeRoute(router, 'post', '/events', req);
    expect(calls.status).toEqual([401]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('slack-interactions.routes — /commands', () => {
  it('verifies the signature, parses the top-level form-encoded command body, and dispatches', async () => {
    const { router, dispatch } = loadRouter();
    const rawBody = 'command=%2Fquiz&text=fractions+for+grade+5&user_id=U0123ABC';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': sign(timestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
      path: '/commands',
    };

    const { calls } = await invokeRoute(router, 'post', '/commands', req);
    expect(calls.status).toEqual([200]);
    expect(calls.send).toEqual(['']);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'slack:U0123ABC', type: 'text', text: { body: '/quiz fractions for grade 5' } })
    );
  });

  it('rejects an incorrectly-signed slash command request with 401, never dispatching', async () => {
    const { router, dispatch } = loadRouter();
    const rawBody = 'command=%2Fmenu&text=&user_id=U0123ABC';
    const req = {
      headers: {
        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-slack-signature': 'v0=deadbeef',
      },
      rawBody: Buffer.from(rawBody),
      path: '/commands',
    };

    const { calls } = await invokeRoute(router, 'post', '/commands', req);
    expect(calls.status).toEqual([401]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('slack-interactions.routes — /interactions', () => {
  it('verifies the signature, parses the form-encoded payload, and dispatches', async () => {
    const { router, dispatch } = loadRouter();
    const payloadObj = {
      type: 'block_actions',
      user: { id: 'U0123ABC' },
      container: { message_ts: '169.010' },
      actions: [{ type: 'button', value: 'menu_video', text: { text: 'Video' } }],
    };
    const rawBody = `payload=${encodeURIComponent(JSON.stringify(payloadObj))}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': sign(timestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
      path: '/interactions',
    };

    const { calls } = await invokeRoute(router, 'post', '/interactions', req);
    expect(calls.status).toContain(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects an incorrectly-signed interactivity request with 401', async () => {
    const { router, dispatch } = loadRouter();
    const rawBody = 'payload=%7B%7D';
    const req = {
      headers: {
        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-slack-signature': 'v0=deadbeef',
      },
      rawBody: Buffer.from(rawBody),
      path: '/interactions',
    };

    const { calls } = await invokeRoute(router, 'post', '/interactions', req);
    expect(calls.status).toEqual([401]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
