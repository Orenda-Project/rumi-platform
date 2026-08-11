/**
 * ESM-interop wrapper for the `baileys` package.
 *
 * `baileys` ships as pure ESM (`"type": "module"`, no `exports`/CJS interop
 * field) — `require('baileys')` throws `ERR_REQUIRE_ESM` on Node < 20.19 /
 * 22.12. Dynamic `import()` is the correct interop path from CJS and works
 * on every Node version this repo supports (>=18).
 *
 * This is its own module (rather than `await import('baileys')` inlined at
 * each call site) specifically so tests can `jest.doMock` THIS file: Jest's
 * mocking replaces the whole module before its body ever runs, so the real
 * `import()` below — which this repo's Jest config can't execute at all
 * (see tests/jest.config.js's `experimentalVmModules: false`) — is never
 * reached in a test. Real callers (baileys-connection.js,
 * inbound/baileys-socket.adapter.js) always go through loadBaileys().
 */

/** @returns {Promise<typeof import('baileys')>} */
async function loadBaileys() {
  return import('baileys');
}

module.exports = { loadBaileys };
