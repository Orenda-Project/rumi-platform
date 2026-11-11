/**
 * "On after restart": a key saved while the bot runs is in .env but not in the
 * running process. The console must not call that "on".
 */

const { isLive } = require('../../bot/console/live-state');
const { buildCatalog } = require('../../bot/console/env-catalog');
const { snapshot } = require('../../bot/console/features');
const { requiredVarsFor } = require('../../bot/shared/config/feature-availability');

const ESSENTIALS = Object.fromEntries(requiredVarsFor({}).map((k) => [k, 'sk-or-test']));

function ability(catalog, title) {
  return catalog.groups.flatMap((g) => g.abilities).find((a) => a.title === title);
}

describe('isLive', () => {
  it('is true when there is no running process to compare with (standalone)', () => {
    expect(isLive(['SONIOX_API_KEY'], null)).toBe(true);
  });
  it('needs every key set in the running process', () => {
    expect(isLive(['SONIOX_API_KEY'], {})).toBe(false);
    expect(isLive(['SONIOX_API_KEY'], { SONIOX_API_KEY: 'k' })).toBe(true);
    expect(isLive(['SONIOX_API_KEY'], { SONIOX_API_KEY: 'CHANGEME-x' })).toBe(false);
    expect(isLive(['A', 'B'], { A: '1' })).toBe(false);
  });
  it('needs only one key with anyOf', () => {
    expect(isLive(['A', 'B'], { A: '1' }, { anyOf: true })).toBe(true);
    expect(isLive(['A', 'B'], {}, { anyOf: true })).toBe(false);
  });
});

describe('buildCatalog pendingRestart', () => {
  const fileEnv = { ...ESSENTIALS, SONIOX_API_KEY: 'k' };
  it('flags an ability that is in the file but not in the process', () => {
    const a = ability(buildCatalog(fileEnv, { liveEnv: ESSENTIALS }), 'Understand voice notes');
    expect(a.on).toBe(true);
    expect(a.pendingRestart).toBe(true);
  });
  it('does not flag it when there is no running process', () => {
    const a = ability(buildCatalog(fileEnv, { liveEnv: null }), 'Understand voice notes');
    expect(a.pendingRestart).toBe(false);
  });
  it('does not flag it when the process has it too', () => {
    const a = ability(buildCatalog(fileEnv, { liveEnv: fileEnv }), 'Understand voice notes');
    expect(a.pendingRestart).toBe(false);
  });
});

describe('features snapshot pending-restart', () => {
  it('marks a configured-but-not-live feature', () => {
    const snap = snapshot({ ...ESSENTIALS, SONIOX_API_KEY: 'k' }, { liveEnv: ESSENTIALS });
    expect(snap.rows.find((r) => r.id === 'stt_soniox').state).toBe('pending-restart');
    expect(snap.counts.pendingRestart).toBe(1);
  });
  it('keeps a feature on when only its value changed', () => {
    const snap = snapshot(
      { ...ESSENTIALS, SONIOX_API_KEY: 'new' },
      { liveEnv: { ...ESSENTIALS, SONIOX_API_KEY: 'old' } },
    );
    expect(snap.rows.find((r) => r.id === 'stt_soniox').state).toBe('on');
  });
});
