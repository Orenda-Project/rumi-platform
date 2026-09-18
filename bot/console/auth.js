/**
 * auth — who is allowed to see the console, decided by how it is reachable.
 *
 * There are exactly two worlds, and conflating them is how consoles leak:
 *
 *   LOCAL   The console is bound to loopback on someone's laptop. The person at
 *           the keyboard already has the `.env` file open in an editor if they
 *           want it, and `rumi setup` asks them nothing. Demanding a password
 *           here buys no security and costs us the non-technical operator, who
 *           will not invent one. So: no password. Instead a per-process token is
 *           injected into the served HTML, and every API call must echo it.
 *           Nothing hands the token out — that is the property that matters. A
 *           malicious page can POST to 127.0.0.1, but it cannot read our HTML
 *           cross-origin (we send no CORS headers, ever), so it cannot learn the
 *           token, so its POST is rejected.
 *
 *   GATED   Anything else. A public Railway URL, a LAN address, a container
 *           bound to 0.0.0.0. A password is required, and if one is not
 *           configured the console serves a single locked page and nothing else.
 *           It never silently opens.
 *
 * RFC1918 and CGNAT count as PUBLIC. The threat is a hostile device on the same
 * office or school wifi, which is a realistic position for this deployment and
 * an unrealistic one to defend with "well, it's an internal network".
 *
 * `CONSOLE_INSECURE` is accepted, logged, and ignored. Keeping it inert is
 * deliberate: people who need an escape hatch invent worse ones, and a flag we
 * can see in logs is better than a reverse proxy someone built at 2am.
 *
 * @module console/auth
 */

const crypto = require('crypto');

/** Hosts that mean "only this machine can reach me". */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

/**
 * Private and carrier-grade-NAT ranges. Present so that they can be treated as
 * PUBLIC — see the module header for why.
 */
const PRIVATE_RANGE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|169\.254\.)/;

/**
 * Is this deployment reachable from somewhere other than the local machine?
 *
 * Bind address alone is not enough: on Railway the process binds 0.0.0.0 and is
 * reached through a proxy, so the platform's own injected variables are the
 * honest signal. Any of them present means public, whatever the bind says.
 *
 * @param {object} env
 * @param {string} bind the address the server was told to listen on
 * @returns {{public: boolean, reason: string}}
 */
function reachability(env, bind) {
  for (const hint of ['RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_STATIC_URL', 'RAILWAY_ENVIRONMENT', 'RENDER', 'FLY_APP_NAME']) {
    if (env[hint]) return { public: true, reason: `${hint} is set — this is a hosted deployment` };
  }
  const host = String(bind || '').trim();
  if (!host || LOOPBACK.has(host)) return { public: false, reason: 'bound to loopback only' };
  if (host === '0.0.0.0' || host === '::') return { public: true, reason: `bound to ${host} — reachable from the network` };
  if (PRIVATE_RANGE.test(host)) return { public: true, reason: `bound to ${host} — reachable from your local network` };
  return { public: true, reason: `bound to ${host}` };
}

/** A bcrypt hash, rather than something that merely looks like one. */
function looksLikeBcrypt(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(value.trim());
}

/**
 * The session secret shipped as a default in `bot/dashboard/index.js`. Anyone
 * copying that file's pattern inherits it, so it is rejected by name.
 */
const KNOWN_BAD_SECRET = 'your-secret-key-change-in-production';

/**
 * Decide the console's security posture from the environment alone.
 *
 * Pure, so the whole matrix can be tested without an HTTP request.
 *
 * One case cannot be settled here, and says so: the bot binds `0.0.0.0` because
 * Railway requires it, and `.env.template` ships `PORT=3000`, so a laptop
 * running `rumi start` binds the wildcard too. The bind address therefore tells
 * us nothing about who can actually reach it, and deciding from it alone would
 * either lock every laptop out (destroying the zero-friction case this design
 * rests on) or trust every network. That case returns `per-request`, and
 * `modeForRequest` settles it by looking at where the request actually came
 * from — see below.
 *
 * @param {object} env
 * @param {string} bind
 * @returns {{mode: 'local'|'gated'|'locked'|'per-request', public: boolean, reason: string, problems: string[]}}
 */
function resolveMode(env, bind) {
  // An operator who has deliberately set a password gets a login, everywhere.
  const problems = credentialProblems(env);
  if (!problems.length) {
    return { mode: 'gated', public: true, reason: 'a console password is set', problems: [] };
  }

  // A hosted deployment is reachable from the internet whatever it binds to,
  // and its own platform variables are the honest signal.
  for (const hint of ['RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_STATIC_URL', 'RAILWAY_ENVIRONMENT', 'RENDER', 'FLY_APP_NAME']) {
    if (env[hint]) {
      return { mode: 'locked', public: true, reason: `${hint} is set — this is a hosted deployment`, problems };
    }
  }

  const host = String(bind || '').trim();
  if (!host || LOOPBACK.has(host)) {
    return { mode: 'local', public: false, reason: 'bound to loopback only', problems: [] };
  }
  if (PRIVATE_RANGE.test(host)) {
    return { mode: 'locked', public: true, reason: `bound to ${host} — reachable from your local network`, problems };
  }
  if (host === '0.0.0.0' || host === '::') {
    return { mode: 'per-request', public: true, reason: 'bound to every interface — access depends on where you browse from', problems };
  }
  return { mode: 'locked', public: true, reason: `bound to ${host}`, problems };
}

/**
 * Settle the `per-request` case: who is actually asking?
 *
 * Reads `req.socket.remoteAddress` rather than `req.ip` deliberately. With
 * Express's `trust proxy` enabled, `req.ip` is taken from `X-Forwarded-For`,
 * which the client sets — so the decision about whether this request deserves
 * password-free access would be made by the attacker. `remoteAddress` is the
 * actual TCP peer and cannot be spoofed by a header. Behind a real proxy
 * (Railway) the peer is the proxy, which is not loopback, so those requests
 * correctly fall through to locked.
 *
 * @param {{mode: string}} posture from resolveMode
 * @param {import('express').Request} req
 * @returns {'local'|'gated'|'locked'}
 */
function modeForRequest(posture, req) {
  if (posture.mode !== 'per-request') return posture.mode;
  const peer = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
  return LOOPBACK.has(peer) ? 'local' : 'locked';
}

/**
 * What is wrong with the configured console credentials, if anything. An empty
 * array means a password gate can be opened.
 *
 * @param {object} env
 * @returns {string[]}
 */
function credentialProblems(env) {
  const problems = [];
  if (!looksLikeBcrypt(env.ADMIN_PASSWORD_HASH)) {
    problems.push('ADMIN_PASSWORD_HASH is not set to a bcrypt hash');
  }
  const secret = String(env.SESSION_SECRET || '');
  if (secret.length < 32) problems.push('SESSION_SECRET is missing or shorter than 32 characters');
  else if (secret === KNOWN_BAD_SECRET) problems.push('SESSION_SECRET is still the example value');
  return problems;
}

/**
 * A session store backed by the Redis the bot already requires, so the console
 * needs no new dependency and no in-memory store that forgets every restart and
 * leaks across cluster workers.
 *
 * Implements the four methods express-session actually calls.
 */
function createRedisStore(session, redis, { prefix = 'rumi:console:sess:', ttlSeconds = 8 * 3600 } = {}) {
  return new (class RedisStore extends session.Store {
    get(sid, cb) {
      redis.get(prefix + sid)
        .then((raw) => cb(null, raw ? JSON.parse(raw) : null))
        .catch((err) => cb(err));
    }

    set(sid, sess, cb) {
      redis.set(prefix + sid, JSON.stringify(sess), 'EX', ttlSeconds)
        .then(() => cb(null)).catch((err) => cb(err));
    }

    destroy(sid, cb) {
      redis.del(prefix + sid).then(() => cb(null)).catch((err) => cb(err));
    }

    touch(sid, sess, cb) {
      redis.expire(prefix + sid, ttlSeconds).then(() => cb(null)).catch((err) => cb(err));
    }
  })();
}

/**
 * Reject a request whose Host header we do not recognise.
 *
 * This is the DNS-rebinding defence, and it has to run on GET as well as POST:
 * an attacker's domain can be made to resolve to 127.0.0.1, at which point the
 * browser considers their page same-origin with our console and Origin checks
 * stop helping. The Host header is what still gives them away.
 *
 * @param {{bind: string, publicHost?: string}} opts
 */
function hostGuard({ bind, publicHost }) {
  const allowed = new Set([...LOOPBACK]);
  if (bind && bind !== '0.0.0.0' && bind !== '::') allowed.add(bind);
  if (publicHost) allowed.add(String(publicHost).toLowerCase());

  return function guard(req, res, next) {
    const raw = String(req.headers.host || '');
    // Strip the port, and the brackets an IPv6 literal arrives wrapped in.
    const host = raw.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (allowed.has(host)) return next();
    // A hosted deployment is reached through a proxy under a domain we were
    // never told about; trust the platform's own value when it agrees.
    const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase();
    if (forwarded && allowed.has(forwarded.replace(/:\d+$/, ''))) return next();
    res.status(403).type('text/plain').send('Host not allowed');
  };
}

/** Constant-time compare that tolerates differing lengths without throwing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // Still do the comparison so timing does not reveal the length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  resolveMode,
  modeForRequest,
  credentialProblems,
  reachability,
  createRedisStore,
  hostGuard,
  safeEqual,
  looksLikeBcrypt,
  LOOPBACK,
  PRIVATE_RANGE,
  KNOWN_BAD_SECRET,
};
