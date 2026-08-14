/**
 * slack-signature.service.js — HMAC request-signature verification.
 * Each test computes its own EXPECTED signature independently via Node's own
 * crypto (not by calling the service), so this isn't a tautological check of
 * the service's own math.
 */

const crypto = require('crypto');

const SIGNING_SECRET = 'test-signing-secret';

function computeSignature(timestamp, rawBody, secret = SIGNING_SECRET) {
  const base = `v0:${timestamp}:${rawBody}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
}

function loadService() {
  jest.resetModules();
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  return require('../../bot/shared/services/slack-signature.service');
}

afterEach(() => {
  delete process.env.SLACK_SIGNING_SECRET;
  jest.resetModules();
});

describe('slack-signature.service', () => {
  it('isConfigured() reflects whether SLACK_SIGNING_SECRET is set', () => {
    jest.resetModules();
    delete process.env.SLACK_SIGNING_SECRET;
    const unconfigured = require('../../bot/shared/services/slack-signature.service');
    expect(unconfigured.isConfigured()).toBe(false);

    const service = loadService();
    expect(service.isConfigured()).toBe(true);
  });

  it('accepts a correctly-signed, fresh request', () => {
    const service = loadService();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"event_callback"}';
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': computeSignature(timestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
    };
    expect(service.verify(req)).toBe(true);
  });

  it('rejects a tampered body (signature was computed over different bytes)', () => {
    const service = loadService();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signedBody = '{"type":"event_callback"}';
    const tamperedBody = '{"type":"event_callback","extra":"injected"}';
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': computeSignature(timestamp, signedBody),
      },
      rawBody: Buffer.from(tamperedBody),
    };
    expect(service.verify(req)).toBe(false);
  });

  it('rejects a request signed with the wrong secret', () => {
    const service = loadService();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"event_callback"}';
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': computeSignature(timestamp, rawBody, 'wrong-secret'),
      },
      rawBody: Buffer.from(rawBody),
    };
    expect(service.verify(req)).toBe(false);
  });

  it('rejects a stale timestamp outside the replay-protection window', () => {
    const service = loadService();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 10); // 10 minutes old
    const rawBody = '{"type":"event_callback"}';
    const req = {
      headers: {
        'x-slack-request-timestamp': staleTimestamp,
        'x-slack-signature': computeSignature(staleTimestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
    };
    expect(service.verify(req)).toBe(false);
  });

  it('rejects a request missing either header', () => {
    const service = loadService();
    expect(service.verify({ headers: {}, rawBody: Buffer.from('{}') })).toBe(false);
    expect(service.verify({
      headers: { 'x-slack-request-timestamp': '169' },
      rawBody: Buffer.from('{}'),
    })).toBe(false);
  });

  it('rejects everything when SLACK_SIGNING_SECRET is not configured', () => {
    jest.resetModules();
    delete process.env.SLACK_SIGNING_SECRET;
    const service = require('../../bot/shared/services/slack-signature.service');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{}';
    const req = {
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': computeSignature(timestamp, rawBody),
      },
      rawBody: Buffer.from(rawBody),
    };
    expect(service.verify(req)).toBe(false);
  });
});
