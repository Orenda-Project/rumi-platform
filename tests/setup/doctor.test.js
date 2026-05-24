/**
 * doctor — preflight diagnostics.
 *
 * Probes are injected so we never hit the network. The key guarantees:
 *   - a missing REQUIRED var makes the run not-ok
 *   - a probe that THROWS or returns ok:false is reported 'fail' (never silently green)
 *   - presence-based features turn on/off purely from env keys
 *   - "key present" is not treated as "service works" (probe still runs)
 */

const { analyzeEnv, runDoctor, REQUIRED_VARS } = require('../../bot/scripts/setup/doctor');

const FULL_ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  OPENROUTER_API_KEY: 'k',
  REDIS_URL: 'redis://localhost:6379',
  WHATSAPP_TOKEN: 'k',
  PHONE_NUMBER_ID: 'k',
  WEBHOOK_VERIFY_TOKEN: 'k',
  WABA_ID: 'k',
};

const allPassProbes = {
  supabase: async () => ({ ok: true, detail: 'HTTP 200' }),
  openrouter: async () => ({ ok: true, detail: 'HTTP 200' }),
  whatsapp: async () => ({ ok: true, detail: 'HTTP 200' }),
  redis: async () => ({ ok: true, detail: 'PONG' }),
  chromium: async () => ({ ok: false, detail: 'none' }),
};

describe('analyzeEnv', () => {
  it('reports all required present when the full env is set', () => {
    const a = analyzeEnv(FULL_ENV);
    expect(a.missingRequired).toEqual([]);
    expect(a.requiredPresent.sort()).toEqual([...REQUIRED_VARS].sort());
  });

  it('flags a missing required var', () => {
    const env = { ...FULL_ENV };
    delete env.WABA_ID;
    expect(analyzeEnv(env).missingRequired).toContain('WABA_ID');
  });

  it('treats a CHANGEME placeholder as NOT set', () => {
    const env = { ...FULL_ENV, OPENROUTER_API_KEY: 'CHANGEME-sk-or-v1-x' };
    expect(analyzeEnv(env).missingRequired).toContain('OPENROUTER_API_KEY');
  });

  it('marks an optional feature available only when all its keys are set', () => {
    const azureOff = analyzeEnv({ ...FULL_ENV, AZURE_SPEECH_KEY: 'k' }); // region missing
    const azure = azureOff.features.find((f) => f.name.includes('Pronunciation'));
    expect(azure.available).toBe(false);
    expect(azure.missingKeys).toContain('AZURE_SPEECH_REGION');

    const azureOn = analyzeEnv({ ...FULL_ENV, AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' });
    expect(azureOn.features.find((f) => f.name.includes('Pronunciation')).available).toBe(true);
  });
});

describe('runDoctor', () => {
  it('is ok=true when all required present and all probes pass', async () => {
    const r = await runDoctor({ env: FULL_ENV, probes: allPassProbes });
    expect(r.ok).toBe(true);
    expect(r.probeResults.every((p) => p.status === 'pass')).toBe(true);
  });

  it('is ok=false when a required var is missing (even if probes would pass)', async () => {
    const env = { ...FULL_ENV };
    delete env.SUPABASE_URL;
    const r = await runDoctor({ env, probes: allPassProbes });
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toContain('SUPABASE_URL');
  });

  it('reports fail (never silent green) when a probe THROWS', async () => {
    const probes = { ...allPassProbes, whatsapp: async () => { throw new Error('boom'); } };
    const r = await runDoctor({ env: FULL_ENV, probes });
    const wa = r.probeResults.find((p) => p.name.includes('WhatsApp'));
    expect(wa.status).toBe('fail');
    expect(wa.detail).toMatch(/boom/);
    expect(r.ok).toBe(false);
  });

  it('reports fail when a probe returns ok:false (key set but service rejected it)', async () => {
    const probes = { ...allPassProbes, openrouter: async () => ({ ok: false, detail: 'HTTP 401' }) };
    const r = await runDoctor({ env: FULL_ENV, probes });
    expect(r.probeResults.find((p) => p.name.includes('OpenRouter')).status).toBe('fail');
    expect(r.ok).toBe(false);
  });

  it('skips a probe (not fail) when its required var is absent — no spurious connection attempt', async () => {
    const env = { ...FULL_ENV };
    delete env.REDIS_URL;
    let redisProbed = false;
    const probes = { ...allPassProbes, redis: async () => { redisProbed = true; return { ok: true, detail: 'PONG' }; } };
    const r = await runDoctor({ env, probes });
    const redis = r.probeResults.find((p) => p.name === 'Redis');
    expect(redis.status).toBe('skip');
    expect(redisProbed).toBe(false); // never even attempted the connection
    expect(r.ok).toBe(false); // still not ok — REDIS_URL is a required var
  });

  it('feature with a probe (Chromium) reflects the probe result, not env keys', async () => {
    const onProbes = { ...allPassProbes, chromium: async () => ({ ok: true, detail: '/usr/bin/chromium' }) };
    const r = await runDoctor({ env: FULL_ENV, probes: onProbes });
    expect(r.featureResults.find((f) => f.name.includes('Chromium')).status).toBe('on');
  });
});
