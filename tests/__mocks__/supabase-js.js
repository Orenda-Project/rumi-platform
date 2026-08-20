/**
 * Lightweight stub for @supabase/supabase-js — the root test suite runs
 * before bot/node_modules installs, so source that requires it can't
 * resolve it. Same pattern as the axios/form-data/aws-sdk/pino/canvas stubs.
 *
 * Unlike those, this one is a safety net rather than the primary defense:
 * config/supabase.js is a high-traffic, deliberately narrow file, and most
 * suites already mock it directly (`jest.mock('.../config/supabase', ...)`)
 * to control query behavior. This stub only matters when config/supabase.js
 * itself is left unmocked and genuinely executes — without this mapping,
 * that only broke intermittently depending on which other test files shared
 * a Jest worker process and in what order, since per-file jest.mock() of
 * config/supabase does not reliably shadow this require in every ordering.
 */
function chainableStub() {
  const thrower = () => { throw new Error('supabase-js stub: not available in the root test suite — mock config/supabase.js in this test'); };
  return new Proxy({}, { get: () => thrower });
}

module.exports = {
  createClient: () => chainableStub(),
};
