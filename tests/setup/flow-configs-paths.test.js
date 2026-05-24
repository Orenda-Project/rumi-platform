/**
 * Flow config integrity — every flow JSON referenced by FLOW_CONFIGS must
 * actually exist on disk, and the flow set must be the single source of truth
 * shared by the registrar and the validators.
 *
 * Regression guard for the setup-contract bug: FLOW_CONFIGS pointed at
 * `shared/flows/*.json`, but the flow JSON lives in `docs/flows/*.json`, so
 * `register-all-flows` crashed with ENOENT before any Meta API call.
 */

const fs = require('fs');
const { FLOW_CONFIGS } = require('../../bot/scripts/setup/register-all-flows');

describe('FLOW_CONFIGS flow JSON paths', () => {
  it('exports at least one flow', () => {
    expect(Array.isArray(FLOW_CONFIGS)).toBe(true);
    expect(FLOW_CONFIGS.length).toBeGreaterThan(0);
  });

  it('every flow JSON path resolves to a file that exists on disk', () => {
    const missing = FLOW_CONFIGS
      .filter((c) => !fs.existsSync(c.jsonPath))
      .map((c) => `${c.name} -> ${c.jsonPath}`);

    expect(missing).toEqual([]);
  });

  it('every flow JSON is valid parseable JSON', () => {
    for (const c of FLOW_CONFIGS) {
      const raw = fs.readFileSync(c.jsonPath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });
});
