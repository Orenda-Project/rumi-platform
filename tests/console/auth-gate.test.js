/**
 * The console's fail-closed rule, exhaustively.
 *
 * The rule is: the console opens without a password ONLY when we can positively
 * recognise it as loopback-only. Every other case — including cases we do not
 * recognise — demands a password, and refuses to serve anything without one.
 *
 * This is a matrix test rather than a handful of examples because the failure it
 * guards against is a single missed branch putting sixteen API keys on the open
 * internet.
 */

const {
  resolveMode, modeForRequest, reachability, looksLikeBcrypt, KNOWN_BAD_SECRET,
} = require('../../bot/console/auth');

/** A request that arrived from the given TCP peer. */
const from = (remoteAddress) => ({ socket: { remoteAddress } });

const GOOD_HASH = `$2b$10$${'x'.repeat(53)}`;
const GOOD_SECRET = 'z'.repeat(40);
const CREDENTIALS = { ADMIN_PASSWORD_HASH: GOOD_HASH, SESSION_SECRET: GOOD_SECRET };

describe('loopback is the only ungated case', () => {
  it.each(['127.0.0.1', '::1', 'localhost'])('opens without a password on %s', (bind) => {
    expect(resolveMode({}, bind).mode).toBe('local');
  });
});

describe('everything else is gated, and locked until a password exists', () => {
  const publicBinds = [
    ['192.168.1.5', 'a home or office LAN'],
    ['10.0.0.4', 'a corporate LAN'],
    ['172.16.4.2', 'the other RFC1918 block'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['169.254.10.1', 'link-local'],
    ['203.0.113.9', 'a routable public address'],
  ];

  it.each(publicBinds)('%s (%s) refuses to open with no password', (bind) => {
    expect(resolveMode({}, bind).mode).toBe('locked');
  });

  it.each(publicBinds)('%s (%s) opens once a password and secret are set', (bind) => {
    expect(resolveMode(CREDENTIALS, bind).mode).toBe('gated');
  });

  it('treats a private network address as public — the threat is a device on the same wifi', () => {
    expect(reachability({}, '192.168.1.5').public).toBe(true);
  });
});

describe('a wildcard bind is settled by who is asking, not by the bind', () => {
  // The bot binds 0.0.0.0 because Railway requires it, and .env.template ships
  // PORT=3000, so a laptop binds the wildcard too. Deciding from the bind alone
  // would either lock every laptop out or trust every network.
  it.each(['0.0.0.0', '::'])('%s defers the decision to the request', (bind) => {
    expect(resolveMode({}, bind).mode).toBe('per-request');
  });

  it('opens for a browser on the same machine', () => {
    const posture = resolveMode({}, '0.0.0.0');
    expect(modeForRequest(posture, from('127.0.0.1'))).toBe('local');
    expect(modeForRequest(posture, from('::1'))).toBe('local');
    expect(modeForRequest(posture, from('::ffff:127.0.0.1'))).toBe('local');
  });

  it('locks out anyone else, including the rest of the local network', () => {
    const posture = resolveMode({}, '0.0.0.0');
    for (const peer of ['192.168.1.22', '10.1.2.3', '100.64.0.9', '203.0.113.7', '', undefined]) {
      expect(modeForRequest(posture, from(peer))).toBe('locked');
    }
  });

  it('reads the TCP peer, so a forged X-Forwarded-For cannot buy access', () => {
    const posture = resolveMode({}, '0.0.0.0');
    const spoofed = {
      socket: { remoteAddress: '203.0.113.7' },
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    expect(modeForRequest(posture, spoofed)).toBe('locked');
  });

  it('passes a settled decision straight through', () => {
    for (const mode of ['local', 'gated', 'locked']) {
      expect(modeForRequest({ mode }, from('203.0.113.7'))).toBe(mode);
    }
  });
});

describe('a hosted deployment is public whatever it binds to', () => {
  // On Railway the process binds 0.0.0.0 behind a proxy, so bind-address
  // sniffing alone would be fooled by a loopback CONSOLE_BIND.
  it.each(['RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_STATIC_URL', 'RAILWAY_ENVIRONMENT', 'RENDER', 'FLY_APP_NAME'])(
    '%s being set locks a loopback bind',
    (hint) => {
      expect(resolveMode({ [hint]: 'yes' }, '127.0.0.1').mode).toBe('locked');
      expect(resolveMode({ [hint]: 'yes' }, '0.0.0.0').mode).toBe('locked');
      // ...and a loopback request cannot talk its way past a hosted deployment.
      expect(modeForRequest(resolveMode({ [hint]: 'yes' }, '0.0.0.0'), from('127.0.0.1'))).toBe('locked');
      expect(resolveMode({ [hint]: 'yes', ...CREDENTIALS }, '127.0.0.1').mode).toBe('gated');
    },
  );
});

describe('credential quality is checked, not just presence', () => {
  // Each of these is "as good as no password". The property under test is that
  // none of them opens the console to the network — NOT that they lock the
  // local operator out, who is the person who has to go and fix them.
  const BAD = [
    ['a password that is not a bcrypt hash', { ADMIN_PASSWORD_HASH: 'letmein', SESSION_SECRET: GOOD_SECRET }, /bcrypt/],
    ['a short session secret', { ADMIN_PASSWORD_HASH: GOOD_HASH, SESSION_SECRET: 'short' }, /SESSION_SECRET/],
    // The example value is in this same repo, in bot/dashboard/index.js, in the
    // file that looks most like a template — so someone will copy it.
    ['the example session secret', { ADMIN_PASSWORD_HASH: GOOD_HASH, SESSION_SECRET: KNOWN_BAD_SECRET }, /example value/],
  ];

  it.each(BAD)('rejects %s and says why', (_label, env, expected) => {
    const r = resolveMode(env, '192.168.1.5');
    expect(r.mode).toBe('locked');
    expect(r.problems.join(' ')).toMatch(expected);
  });

  it.each(BAD)('%s does not open the console to the network', (_label, env) => {
    expect(modeForRequest(resolveMode(env, '0.0.0.0'), from('192.168.1.22'))).toBe('locked');
    expect(resolveMode({ ...env, RAILWAY_ENVIRONMENT: 'production' }, '0.0.0.0').mode).toBe('locked');
  });

  it.each(BAD)('%s still lets the operator in from the machine itself, to fix it', (_label, env) => {
    expect(modeForRequest(resolveMode(env, '0.0.0.0'), from('127.0.0.1'))).toBe('local');
  });

  it('recognises real bcrypt prefixes and rejects look-alikes', () => {
    expect(looksLikeBcrypt(`$2a$12$${'y'.repeat(53)}`)).toBe(true);
    expect(looksLikeBcrypt(`$2y$10$${'y'.repeat(53)}`)).toBe(true);
    expect(looksLikeBcrypt('$2b$10$tooshort')).toBe(false);
    expect(looksLikeBcrypt('not-a-hash')).toBe(false);
    expect(looksLikeBcrypt(undefined)).toBe(false);
  });
});

describe('there is no escape hatch', () => {
  it.each(['CONSOLE_INSECURE', 'INSECURE', 'ALLOW_INSECURE_CONSOLE'])(
    '%s does not unlock access from the network',
    (flag) => {
      expect(resolveMode({ [flag]: 'true' }, '192.168.1.5').mode).toBe('locked');
      const posture = resolveMode({ [flag]: '1' }, '0.0.0.0');
      expect(modeForRequest(posture, from('192.168.1.22'))).toBe('locked');
    },
  );
});

describe('the reason is always explainable to a person', () => {
  it('says why, in words, for every mode', () => {
    for (const [env, bind] of [[{}, '127.0.0.1'], [{}, '0.0.0.0'], [{}, '10.0.0.1'], [CREDENTIALS, '0.0.0.0']]) {
      const r = resolveMode(env, bind);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});
