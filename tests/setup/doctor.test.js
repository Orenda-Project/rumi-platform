/**
 * doctor — preflight diagnostics.
 *
 * Probes are injected so we never hit the network. The key guarantees:
 *   - a missing REQUIRED var makes the run not-ok
 *   - a probe that THROWS or returns ok:false is reported 'fail' (never silently green)
 *   - presence-based features turn on/off purely from env keys
 *   - "key present" is not treated as "service works" (probe still runs)
 */

const {
  analyzeEnv, analyzeFlows, runDoctor, formatReport, keySource, REQUIRED_VARS, CHANNEL_REQUIRED_VARS, requiredVarsFor,
} = require('../../bot/scripts/setup/doctor');

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
};

describe('analyzeEnv', () => {
  it('reports all required present when the full env is set', () => {
    const a = analyzeEnv(FULL_ENV);
    expect(a.missingRequired).toEqual([]);
    // FULL_ENV sets all 4 Meta vars with no explicit CHANNEL_DRIVER, so the
    // channel is inferred as `meta` and the full 8-var list applies.
    expect(a.requiredPresent.sort()).toEqual(requiredVarsFor(FULL_ENV).sort());
    expect(a.channel).toBe('meta');
  });

  it('resolves to the sandbox (baileys) channel and requires only the 4 core vars when no Meta vars are set', () => {
    const env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      OPENROUTER_API_KEY: 'k',
      REDIS_URL: 'redis://localhost:6379',
    };
    const a = analyzeEnv(env);
    expect(a.channel).toBe('baileys');
    expect(a.missingRequired).toEqual([]);
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
    const azure = azureOff.features.find((f) => f.name.includes('Azure'));
    expect(azure.available).toBe(false);
    expect(azure.missingKeys).toContain('AZURE_SPEECH_REGION');

    const azureOn = analyzeEnv({ ...FULL_ENV, AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' });
    expect(azureOn.features.find((f) => f.name.includes('Azure')).available).toBe(true);
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

  it('exam-checker feature turns on by MISTRAL_API_KEY presence (not AWS Textract)', async () => {
    const off = await runDoctor({ env: FULL_ENV, probes: allPassProbes });
    expect(off.featureResults.find((f) => f.name.includes('Exam')).status).toBe('off');
    const on = await runDoctor({ env: { ...FULL_ENV, MISTRAL_API_KEY: 'k' }, probes: allPassProbes });
    expect(on.featureResults.find((f) => f.name.includes('Exam')).status).toBe('on');
  });

  it('sandbox (baileys) deployments are ok=true without any Meta credentials, and the WhatsApp probe is skipped', async () => {
    const env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      OPENROUTER_API_KEY: 'k',
      REDIS_URL: 'redis://localhost:6379',
      CHANNEL_DRIVER: 'baileys',
    };
    let whatsappProbed = false;
    const probes = { ...allPassProbes, whatsapp: async () => { whatsappProbed = true; return { ok: true, detail: 'HTTP 200' }; } };
    const r = await runDoctor({ env, probes });
    expect(r.channel).toBe('baileys');
    expect(r.ok).toBe(true);
    expect(whatsappProbed).toBe(false);
    expect(r.probeResults.find((p) => p.name.includes('WhatsApp')).status).toBe('skip');
  });
});

describe('formatReport — channel driver line', () => {
  it('shows the resolved channel and its tier', async () => {
    const r = await runDoctor({ env: FULL_ENV, probes: allPassProbes });
    expect(formatReport(r)).toMatch(/Channel driver: meta \(production\)/);
  });

  it('does not print a channel line when the result has no channel field (hand-built result objects)', () => {
    const result = { ok: true, missingRequired: [], probeResults: [], featureResults: [], flowResults: [] };
    expect(formatReport(result)).not.toMatch(/Channel driver:/);
  });

  it('notes that a green result does not by itself confirm Baileys messaging works end to end', async () => {
    const env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      OPENROUTER_API_KEY: 'k',
      REDIS_URL: 'redis://localhost:6379',
      CHANNEL_DRIVER: 'baileys',
    };
    const r = await runDoctor({ env, probes: allPassProbes });
    const report = formatReport(r);
    expect(report).toMatch(/Channel driver: baileys \(sandbox\)/);
    expect(report).toMatch(/does NOT confirm messaging works end to end/i);
    expect(report).toMatch(/rumi pair/);
  });

  it('does not print the Baileys-specific note for the meta channel', async () => {
    const r = await runDoctor({ env: FULL_ENV, probes: allPassProbes });
    expect(formatReport(r)).not.toMatch(/rumi pair/);
  });

  it('warns when CHANNEL_DRIVER is set to an unrecognized value, naming the typo and the fallback', async () => {
    const env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      OPENROUTER_API_KEY: 'k',
      REDIS_URL: 'redis://localhost:6379',
      CHANNEL_DRIVER: 'mta',
    };
    const a = analyzeEnv(env);
    expect(a.channelDriverTypo).toBe('mta');
    expect(a.channel).toBe('baileys');

    const r = await runDoctor({ env, probes: allPassProbes });
    const report = formatReport(r);
    expect(report).toMatch(/CHANNEL_DRIVER="mta" is not a recognized driver/);
    expect(report).toMatch(/falling back to baileys/);
  });

  it('does not warn about a typo when CHANNEL_DRIVER is unset (inference is not a typo)', () => {
    const a = analyzeEnv({ ...FULL_ENV });
    expect(a.channelDriverTypo).toBeNull();
  });
});

describe('key sourcing ("get it here" guidance)', () => {
  it('returns a source hint for a known env var and empty string for unknown', () => {
    expect(keySource('OPENROUTER_API_KEY')).toMatch(/openrouter/i);
    expect(keySource('NOT_A_REAL_VAR')).toBe('');
  });

  it('every REQUIRED var (core + every channel driver) has a documented "get it here" source', () => {
    const allVars = [...REQUIRED_VARS, ...Object.values(CHANNEL_REQUIRED_VARS).flat()];
    const undocumented = allVars.filter((v) => !keySource(v));
    expect(undocumented).toEqual([]);
  });

  it('formatReport shows the source next to a missing required var + points at the guides', async () => {
    const env = { ...FULL_ENV };
    delete env.OPENROUTER_API_KEY;
    const result = await runDoctor({ env, probes: allPassProbes });
    const report = formatReport(result);
    expect(report).toMatch(/OPENROUTER_API_KEY.*get it: .*openrouter/i);
    expect(report).toContain('docs/onboarding/api-keys.md');
    expect(report).toContain('docs/onboarding/whatsapp.md');
  });

  it('formatReport shows where to get the key for an OFF optional feature', async () => {
    const result = await runDoctor({ env: FULL_ENV, probes: allPassProbes });
    const report = formatReport(result);
    // Soniox is off in FULL_ENV (no SONIOX_API_KEY) → hint should appear.
    expect(report).toMatch(/get it: .*soniox/i);
  });
});

describe('flow registration state (analyzeFlows + doctor reporting)', () => {
  it('reports every configured flow as not-registered when there is no setup state', () => {
    const flows = analyzeFlows(null);
    expect(flows.length).toBeGreaterThan(0);
    expect(flows.every((f) => f.registered === false)).toBe(true);
    expect(flows.every((f) => f.status === 'not registered')).toBe(true);
  });

  it('reflects recorded status for registered flows', () => {
    const state = { flows: { 'Settings': { flowId: 'f', status: 'PUBLISHED', envVar: 'SETTINGS_FLOW_ID' } } };
    const flows = analyzeFlows(state);
    const settings = flows.find((f) => f.envVar === 'SETTINGS_FLOW_ID');
    expect(settings.registered).toBe(true);
    expect(settings.status).toBe('PUBLISHED');
  });

  it('flow state is informational — unregistered flows do NOT make doctor not-ok', async () => {
    const r = await runDoctor({ env: FULL_ENV, probes: allPassProbes, setupState: null });
    expect(r.ok).toBe(true); // required present + probes pass; flows don't gate readiness
    expect(r.flowResults.every((f) => !f.registered)).toBe(true);
  });

  it('formatReport tells the user to run setup:flows when no flows are registered', async () => {
    const r = await runDoctor({ env: FULL_ENV, probes: allPassProbes, setupState: null });
    expect(formatReport(r)).toMatch(/npm run setup:flows/);
  });
});

describe('the real OpenRouter probe — a valid key is not the same as a usable one', () => {
  // Live finding: doctor reported "✅ OpenRouter (LLM) — HTTP 200" and "All
  // required services are configured and reachable" on an account with zero
  // credits, while every substantial LLM call failed with HTTP 402. A green tick
  // there sends the operator hunting for a bug in the bot.
  const { defaultProbes } = require('../../bot/scripts/setup/doctor');
  const ENV = { OPENROUTER_API_KEY: 'test-key' };

  const mockFetch = (routes) => jest.fn(async (url) => {
    for (const [fragment, response] of Object.entries(routes)) {
      if (String(url).includes(fragment)) return response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

  let realFetch;
  beforeEach(() => { realFetch = global.fetch; });
  afterEach(() => { global.fetch = realFetch; });

  it('is exported so the credit behaviour can be tested at all', () => {
    expect(typeof defaultProbes.openrouter).toBe('function');
  });

  it('fails a key whose account has no credits, and says where to fix it', async () => {
    global.fetch = mockFetch({
      '/v1/key': okJson({}),
      '/v1/credits': okJson({ data: { total_credits: 0, total_usage: 0.088 } }),
    });
    const result = await defaultProbes.openrouter(ENV);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/no credits/i);
    expect(result.detail).toMatch(/openrouter\.ai\/settings\/credits/);
  });

  it('fails a key whose granted credits are spent', async () => {
    global.fetch = mockFetch({
      '/v1/key': okJson({}),
      '/v1/credits': okJson({ data: { total_credits: 5, total_usage: 5 } }),
    });
    const result = await defaultProbes.openrouter(ENV);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/exhausted/i);
  });

  it('passes a funded key and reports what is left', async () => {
    global.fetch = mockFetch({
      '/v1/key': okJson({}),
      '/v1/credits': okJson({ data: { total_credits: 10, total_usage: 2.5 } }),
    });
    const result = await defaultProbes.openrouter(ENV);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/\$7\.50 credit remaining/);
  });

  it('fails an invalid key without even asking about credits', async () => {
    global.fetch = mockFetch({ '/v1/key': { ok: false, status: 401 } });
    const result = await defaultProbes.openrouter(ENV);
    expect(result).toEqual({ ok: false, detail: 'HTTP 401' });
  });

  it('still passes a working key when the credits endpoint is unavailable', async () => {
    // Only a definite answer may downgrade the result; an unreadable credits
    // endpoint must not turn a perfectly good key red.
    global.fetch = mockFetch({
      '/v1/key': okJson({}),
      '/v1/credits': { ok: false, status: 500 },
    });
    await expect(defaultProbes.openrouter(ENV)).resolves.toEqual({ ok: true, detail: 'HTTP 200' });
  });
});
