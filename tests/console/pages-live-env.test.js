/**
 * The pages must compare saved keys with the BOOT snapshot: a save mirrors the
 * value into process.env, so process.env would call every saved key "live".
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRuntime } = require('../../bot/console/runtime');
const { buildCatalog } = require('../../bot/console/env-catalog');
const { readEnvFile } = require('../../bot/scripts/setup/env-file');
const { requiredVarsFor } = require('../../bot/shared/config/feature-availability');

const ESSENTIALS = Object.fromEntries(requiredVarsFor({}).map((k) => [k, 'sk-or-test']));

// Mirrors the route: liveEnv = standalone ? null : runtime.bootEnv()
async function pendingAfterSave(standalone) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-live-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, '');
  const saved = Object.keys(ESSENTIALS).concat('SONIOX_API_KEY');
  const before = {};
  saved.forEach((k) => { before[k] = process.env[k]; delete process.env[k]; });
  try {
    const runtime = createRuntime({ envPath, standalone });
    await runtime.save({ ...ESSENTIALS, SONIOX_API_KEY: 'k' });
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    const liveEnv = runtime.standalone ? null : runtime.bootEnv();
    const catalog = buildCatalog(env, { liveEnv });
    return catalog.groups.flatMap((g) => g.abilities).find((a) => a.title === 'Understand voice notes');
  } finally {
    saved.forEach((k) => { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('pages liveEnv', () => {
  it('flags a key saved after boot as on after restart', async () => {
    const a = await pendingAfterSave(false);
    expect(a.on).toBe(true);
    expect(a.pendingRestart).toBe(true);
  });
  it('never flags it when standalone', async () => {
    const a = await pendingAfterSave(true);
    expect(a.pendingRestart).toBe(false);
  });
});
