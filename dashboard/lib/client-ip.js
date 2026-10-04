/**
 * The client address the dashboard's per-IP limits count.
 *
 * Which address is the caller's depends on what sits in front of the
 * dashboard, so two settings say it (docs/running-in-public.md has a table):
 *
 *   TRUST_PROXY  passed to express's `trust proxy`, which decides how much of
 *                X-Forwarded-For req.ip believes. Accepted values:
 *                  1, 2, ... (up to 10)  that many proxies in front    (default 1)
 *                  false or 0            no proxy: use the socket address
 *                  an address list       e.g. "loopback, 10.0.0.0/8": trust
 *                                        hops from these addresses only
 *                  ("loopback", "linklocal", "uniquelocal", IPs, IP/prefix
 *                  or IP/netmask, comma-separated)
 *                `true` is refused: it would believe whatever X-Forwarded-For
 *                a client sends. Anything not accepted means the default 1,
 *                with one warning.
 *
 *   PORTAL_CLIENT_IP_HEADER  optional header name (x-real-ip,
 *                cf-connecting-ip, fly-client-ip). When set, the limiters use
 *                its first value if it is a valid IP, else req.ip. Set it only
 *                when the proxy in front always overwrites that header — if a
 *                client's own value can get through, it chooses its own key.
 */

const net = require('net');

const DEFAULT_TRUST_PROXY = 1;
const MAX_HOPS = 10;
const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const warnedHeaders = new Set(); // each limiter builds a getter; warn once per process

/** "10.0.0.0/8", "2001:db8::/32", "10.0.0.0/255.0.0.0", "192.0.2.1", "loopback". */
function isTrustEntry(entry) {
  if (NAMED_RANGES.has(entry)) return true;
  const slash = entry.indexOf('/');
  if (slash === -1) return net.isIP(entry) !== 0;
  const addr = entry.slice(0, slash);
  const range = entry.slice(slash + 1);
  const family = net.isIP(addr);
  if (!family) return false;
  if (/^\d+$/.test(range)) return Number(range) <= (family === 4 ? 32 : 128);
  return net.isIP(range) === family;
}

/**
 * TRUST_PROXY -> { value, warning }. `value` is ready for app.set('trust proxy');
 * `warning` is null, or one line saying why the default was used instead.
 */
function parseTrustProxy(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { value: DEFAULT_TRUST_PROXY, warning: null };
  const lower = s.toLowerCase();
  const reject = (why) => ({
    value: DEFAULT_TRUST_PROXY,
    warning: `[client-ip] TRUST_PROXY=${JSON.stringify(s)} ${why}; using the default (${DEFAULT_TRUST_PROXY} proxy).`,
  });

  if (lower === 'false' || lower === '0') return { value: false, warning: null };
  if (lower === 'true') {
    return reject('is not allowed: it would trust any X-Forwarded-For, so any client could pick its own address. Set a hop count or the proxy addresses');
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= MAX_HOPS) return { value: n, warning: null };
    return reject(`is not a hop count from 1 to ${MAX_HOPS}`);
  }
  const entries = lower.split(',').map((e) => e.trim());
  if (entries.length && entries.every((e) => e !== '' && isTrustEntry(e))) {
    return { value: entries.join(', '), warning: null };
  }
  return reject('is not a hop count, false, or a list of proxy addresses');
}

/** Sets express's `trust proxy` from TRUST_PROXY; returns the value set. */
function applyTrustProxy(app, env = process.env, warn = console.warn) {
  const { value, warning } = parseTrustProxy(env.TRUST_PROXY);
  if (warning) warn(warning);
  app.set('trust proxy', value);
  return value;
}

/** PORTAL_CLIENT_IP_HEADER -> a lower-case header name, or null when unset or invalid. */
function readClientIpHeader(env = process.env, warn = console.warn) {
  const s = String(env.PORTAL_CLIENT_IP_HEADER ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (!/^[a-z0-9-]+$/.test(s)) {
    if (warnedHeaders.has(s)) return null;
    warnedHeaders.add(s);
    warn(`[client-ip] PORTAL_CLIENT_IP_HEADER=${JSON.stringify(s)} is not a header name; using the request address.`);
    return null;
  }
  return s;
}

/**
 * The address to count a request under: the header's first value when a
 * header is configured and it holds a valid IP, else req.ip.
 */
function clientIpOf(req, headerName) {
  if (headerName) {
    let v = req.headers?.[headerName];
    if (Array.isArray(v)) v = v[0];
    if (typeof v === 'string') {
      const first = v.split(',')[0].trim();
      if (net.isIP(first)) return first;
    }
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

/** One getter for every per-IP limiter (portal auth, portal data, admin sign-in). */
function createClientIpGetter(env = process.env, warn = console.warn) {
  const headerName = readClientIpHeader(env, warn);
  return (req) => clientIpOf(req, headerName);
}

module.exports = {
  DEFAULT_TRUST_PROXY,
  applyTrustProxy,
  clientIpOf,
  createClientIpGetter,
  parseTrustProxy,
  readClientIpHeader,
};
