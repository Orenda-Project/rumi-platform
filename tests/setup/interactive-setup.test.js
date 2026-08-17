/**
 * interactive-setup.js — the `rumi setup` wizard.
 *
 * Tested as behaviour through a fake io (tests/setup/fake-io.js) rather than by
 * grepping the source, because the guarantees worth protecting here are about
 * what the wizard *does*: which questions it asks, in whose words, what it
 * writes to .env, and whether a re-run is cheap.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { fakeIo, captureLog } = require('./fake-io');

const WIZARD = '../../bot/scripts/setup/interactive-setup';

/**
 * Loads the wizard with chosen collaborators stubbed. The wizard requires
 * `./doctor` lazily (inside `probe`) and `./db-setup` eagerly, so mocks have to
 * be installed before the require either way.
 *
 * @param {{probes?: object, dbSetup?: object}} mocks
 */
function loadWizard(mocks = {}) {
  jest.resetModules();
  if (mocks.probes || mocks.doctor) {
    jest.doMock('../../bot/scripts/setup/doctor', () => ({
      defaultProbes: mocks.probes || {},
      runDoctor: (mocks.doctor && mocks.doctor.runDoctor) || jest.fn(),
    }));
  }
  if (mocks.dbSetup) {
    const real = jest.requireActual('../../bot/scripts/setup/db-setup');
    jest.doMock('../../bot/scripts/setup/db-setup', () => ({ ...real, ...mocks.dbSetup }));
  }
  // eslint-disable-next-line global-require
  return require(WIZARD);
}

const allPass = {
  supabase: async () => ({ ok: true, detail: 'HTTP 200' }),
  openrouter: async () => ({ ok: true, detail: 'HTTP 200 · $5.00 credit remaining' }),
  redis: async () => ({ ok: true, detail: 'PONG' }),
  whatsapp: async () => ({ ok: true, detail: 'HTTP 200' }),
};

let log;
beforeEach(() => { log = captureLog(); });
afterEach(() => { log.restore(); jest.restoreAllMocks(); });

describe('the channel question', () => {
  it('is asked in plain language and never names CHANNEL_DRIVER', async () => {
    const { chooseChannelDriver } = loadWizard();
    const io = fakeIo();
    await chooseChannelDriver(io);

    const { question, options } = io.asked.select[0];
    expect(question).toMatch(/how are you using rumi/i);
    const everythingShown = [question, ...options.map((o) => `${o.label} ${o.hint}`)].join(' ');
    expect(everythingShown).not.toMatch(/CHANNEL_DRIVER|baileys|sandbox|driver/i);
  });

  it('defaults to the sandbox — trying Rumi out must not require a Meta account', async () => {
    const { chooseChannelDriver } = loadWizard();
    expect(await chooseChannelDriver(fakeIo())).toBe('baileys');
  });

  it('resolves to meta when the user picks the real-deployment option', async () => {
    const { chooseChannelDriver } = loadWizard();
    expect(await chooseChannelDriver(fakeIo({ select: ['meta'] }))).toBe('meta');
  });
});

describe('stepChannel', () => {
  /** Collects what would have been written to .env. */
  function recordingSaver(env = {}) {
    const saved = {};
    return { env, saved, save: (vars) => { Object.assign(saved, vars); Object.assign(env, vars); } };
  }

  it('gives the sandbox a queue it can actually run — bullmq, on the Redis just configured', async () => {
    const { stepChannel } = loadWizard({ probes: allPass });
    const { env, saved, save } = recordingSaver();
    // Decline the QR so the test never reaches the real WhatsApp connection.
    const io = fakeIo({ select: ['baileys'], confirm: [false] });

    const result = await stepChannel(io, env, save);

    expect(result.channel).toBe('baileys');
    expect(saved.CHANNEL_DRIVER).toBe('baileys');
    // The template default is sqs, which needs an AWS account a sandbox user
    // does not have — a quiz that generated AND delivered still reported itself
    // as failed, because scheduling its report threw "SQS Queue not configured".
    expect(saved.QUEUE_DRIVER).toBe('bullmq');
    expect(saved.CHANNEL_STATE_DIR).toBe('.channel-state');
  });

  it('leaves a production deployment\'s queue choice alone', async () => {
    const { stepChannel } = loadWizard({ probes: allPass });
    const { env, saved, save } = recordingSaver();
    const io = fakeIo({
      select: ['meta'],
      ask: ['EAA'.padEnd(150, 'x'), '123456789012345', '987654321098765', 'a-webhook-password'],
    });

    const result = await stepChannel(io, env, save);

    expect(result.channel).toBe('meta');
    expect(saved.QUEUE_DRIVER).toBeUndefined();
    expect(saved.WHATSAPP_TOKEN).toMatch(/^EAA/);
    expect(saved.PHONE_NUMBER_ID).toBe('123456789012345');
  });

  it('asks for Meta\'s credentials by what they are called on Meta\'s own page', async () => {
    const { collectMetaCredentials } = loadWizard({ probes: allPass });
    const io = fakeIo({ ask: ['EAA'.padEnd(150, 'x'), '123456789012345', '987654321098765', 'a-webhook-password'] });

    await collectMetaCredentials(io, {}, () => {});

    const labels = io.asked.ask.map((a) => a.label);
    expect(labels).toEqual(['Access token', 'Phone number ID', 'WhatsApp Business Account ID', 'Webhook password']);
    expect(labels.join(' ')).not.toMatch(/WHATSAPP_TOKEN|PHONE_NUMBER_ID|WABA_ID/);
  });

  it('offers a generated webhook password, so nobody has to invent one', async () => {
    const { collectMetaCredentials } = loadWizard({ probes: allPass });
    const io = fakeIo({ ask: ['EAA'.padEnd(150, 'x'), '123456789012345', '987654321098765', ''] });
    const saved = {};

    await collectMetaCredentials(io, {}, (vars) => Object.assign(saved, vars));

    expect(saved.WEBHOOK_VERIFY_TOKEN).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hides the access token as it is typed, and does not hide the ids', async () => {
    const { collectMetaCredentials } = loadWizard({ probes: allPass });
    const io = fakeIo({ ask: ['EAA'.padEnd(150, 'x'), '123456789012345', '987654321098765', 'pw123456'] });

    await collectMetaCredentials(io, {}, () => {});

    const byLabel = Object.fromEntries(io.asked.ask.map((a) => [a.label, Boolean(a.secret)]));
    expect(byLabel['Access token']).toBe(true);
    expect(byLabel['Phone number ID']).toBe(false);
  });
});

describe('re-running the wizard', () => {
  it('does not re-ask for a database that already works', async () => {
    const { stepDatabase } = loadWizard({
      probes: allPass,
      dbSetup: { inspectDatabase: async () => ({ state: 'ready', detail: 'the "users" table is already there' }) },
    });
    const io = fakeIo();

    await stepDatabase(io, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJok' }, () => {});

    expect(io.asked.ask).toHaveLength(0);
    expect(log.text).toMatch(/already connected/i);
  });

  it('re-asks anyway when --reconfigure was passed', async () => {
    const { stepDatabase } = loadWizard({
      probes: allPass,
      dbSetup: { inspectDatabase: async () => ({ state: 'ready', detail: 'ok' }) },
    });
    const io = fakeIo({ ask: ['https://new.supabase.co', `eyJ${Buffer.from('{"role":"service_role"}').toString('base64')}.x`] });

    await stepDatabase(io, { SUPABASE_URL: 'https://old.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJold' }, () => {}, { reconfigure: true });

    expect(io.asked.ask.map((a) => a.label)).toEqual(['API URL', 'Service key']);
  });

  it('re-asks when the stored credentials have stopped working', async () => {
    const { stepDatabase } = loadWizard({
      probes: { ...allPass, supabase: (() => { let call = 0; return async () => { call += 1; return call === 1 ? { ok: false, detail: 'HTTP 401' } : { ok: true, detail: 'HTTP 200' }; }; })() },
      dbSetup: { inspectDatabase: async () => ({ state: 'ready', detail: 'ok' }) },
    });
    const io = fakeIo({ ask: ['https://new.supabase.co', 'sb_secret_abc'] });

    await stepDatabase(io, { SUPABASE_URL: 'https://old.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJold' }, () => {});

    expect(io.asked.ask).toHaveLength(2);
  });
});

describe('creating the tables', () => {
  it('does nothing when they are already there', async () => {
    const applySchema = jest.fn();
    const { ensureTables } = loadWizard({
      probes: allPass,
      dbSetup: { inspectDatabase: async () => ({ state: 'ready', detail: 'ok' }), applySchema },
    });

    await ensureTables(fakeIo(), { SUPABASE_URL: 'https://x.supabase.co' });

    expect(applySchema).not.toHaveBeenCalled();
    expect(log.text).toMatch(/already set up/i);
  });

  it('shows the one-time SQL and a link to the right project\'s editor when the helper is missing', async () => {
    // Supabase has no API for running arbitrary SQL, so `exec_sql` must be
    // pasted in by hand once. This is the step a self-serve setup dies on when
    // it is glossed over, so the wizard has to name it and link straight to it.
    const applySchema = jest.fn(async () => ({ ok: true, applied: ['00_complete-schema.sql'], errors: [] }));
    const { ensureTables } = loadWizard({
      probes: allPass,
      dbSetup: {
        inspectDatabase: async () => ({ state: 'needs-helper', detail: 'exec_sql is missing (HTTP 404)' }),
        waitForExecSql: async () => ({ present: true, detail: 'exec_sql answered' }),
        applySchema,
      },
    });
    const io = fakeIo();

    await ensureTables(io, { SUPABASE_URL: 'https://abcdefgh.supabase.co' });

    expect(log.text).toContain('create or replace function public.exec_sql');
    expect(log.text).toContain('https://supabase.com/dashboard/project/abcdefgh/sql/new');
    expect(io.asked.pressEnter).toBe(1);
    expect(applySchema).toHaveBeenCalled();
  });

  it('stops setup when the helper still is not there — tables are not optional', async () => {
    const applySchema = jest.fn();
    const { ensureTables } = loadWizard({
      probes: allPass,
      dbSetup: {
        inspectDatabase: async () => ({ state: 'needs-helper', detail: 'missing' }),
        waitForExecSql: async () => ({ present: false, detail: 'still missing' }),
        applySchema,
      },
    });

    await expect(ensureTables(fakeIo(), { SUPABASE_URL: 'https://abcdefgh.supabase.co' }))
      .rejects.toThrow(/tables were not created/i);
    expect(applySchema).not.toHaveBeenCalled();
  });

  it('stops setup when schema apply fails — a bot without users is not set up', async () => {
    const { ensureTables } = loadWizard({
      probes: allPass,
      dbSetup: {
        inspectDatabase: async () => ({ state: 'needs-schema', detail: 'helper present' }),
        applySchema: async () => ({ ok: false, applied: [], errors: [{ file: '00_complete-schema.sql', error: 'statement timeout' }] }),
      },
    });

    await expect(ensureTables(fakeIo(), { SUPABASE_URL: 'https://x.supabase.co' }))
      .rejects.toThrow(/no Rumi tables/i);
    expect(log.text).toMatch(/statement timeout/);
  });
});

describe('the AI step', () => {
  it('treats "valid key, no credit" as a question, not a rejection', async () => {
    // The key is fine; the account cannot pay for a request. Re-asking for the
    // key would be nonsense — there is nothing wrong with it.
    const { stepBrain } = loadWizard({
      probes: {
        ...allPass,
        openrouter: async () => ({ ok: false, detail: 'key valid, but the account has no credits — add some at openrouter.ai/settings/credits' }),
      },
    });
    const io = fakeIo({ ask: ['sk-or-v1-abcdefghijklmnop'], confirm: [true] });

    await stepBrain(io, {}, () => {});

    expect(io.asked.ask).toHaveLength(1);
    expect(io.asked.confirm[0]).toMatch(/carry on/i);
  });

  it('re-asks when the key itself is rejected', async () => {
    let calls = 0;
    const { stepBrain } = loadWizard({
      probes: {
        ...allPass,
        openrouter: async () => { calls += 1; return calls === 1 ? { ok: false, detail: 'HTTP 401' } : { ok: true, detail: 'HTTP 200' }; },
      },
    });
    const io = fakeIo({ ask: ['sk-or-v1-wrongkeyvalue', 'sk-or-v1-rightkeyvalue'] });

    await stepBrain(io, {}, () => {});

    expect(io.asked.ask).toHaveLength(2);
  });
});

describe('the Redis step', () => {
  it('reuses the container from a previous run instead of failing on the name', () => {
    // Someone re-running setup would otherwise hit "the container name is
    // already in use" and be stranded at a Docker error mid-tutorial.
    const { startLocalRedis } = loadWizard();
    const run = jest.fn()
      .mockReturnValueOnce({ status: 1, stderr: 'docker: Error response from daemon: Conflict. The container name "/rumi-redis" is already in use' })
      .mockReturnValueOnce({ status: 0, stdout: 'rumi-redis' });

    const result = startLocalRedis(run);

    expect(result.ok).toBe(true);
    expect(run.mock.calls[1][1]).toEqual(['start', 'rumi-redis']);
  });

  it('reports the docker error rather than a generic failure', () => {
    const { startLocalRedis } = loadWizard();
    const run = jest.fn().mockReturnValue({ status: 1, stderr: 'Cannot connect to the Docker daemon' });

    expect(startLocalRedis(run)).toEqual({ ok: false, detail: 'Cannot connect to the Docker daemon' });
  });
});

describe('saving progress', () => {
  it('writes each answer to .env as it is given, so Ctrl+C costs nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-setup-test-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, '# existing\nOTHER_VAR=keep-me\n');

    const { createSaver } = loadWizard();
    const env = {};
    const save = createSaver(env, envPath);

    save({ SUPABASE_URL: 'https://x.supabase.co' });
    save({ REDIS_URL: 'redis://localhost:6379' });

    const written = fs.readFileSync(envPath, 'utf-8');
    expect(written).toContain('SUPABASE_URL=https://x.supabase.co');
    expect(written).toContain('REDIS_URL=redis://localhost:6379');
    expect(written).toContain('OTHER_VAR=keep-me');
    // The live env is updated too, so the next step's check sees this one's answer.
    expect(env.SUPABASE_URL).toBe('https://x.supabase.co');
  });

  it('never writes an empty value over something already set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-setup-test-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'SONIOX_API_KEY=already-here\n');

    const { createSaver } = loadWizard();
    createSaver({}, envPath)({ SONIOX_API_KEY: '' });

    expect(fs.readFileSync(envPath, 'utf-8')).toContain('SONIOX_API_KEY=already-here');
  });
});

describe('hasAll', () => {
  it('treats a CHANGEME placeholder as not set — the template ships those', () => {
    const { hasAll } = loadWizard();
    expect(hasAll({ WHATSAPP_TOKEN: 'CHANGEME-your-token' }, ['WHATSAPP_TOKEN'])).toBe(false);
    expect(hasAll({ WHATSAPP_TOKEN: 'EAAreal' }, ['WHATSAPP_TOKEN'])).toBe(true);
    expect(hasAll({}, ['WHATSAPP_TOKEN'])).toBe(false);
  });
});

describe('optional extras', () => {
  it('defaults to skipping — Rumi works without any of them', async () => {
    const { stepExtras } = loadWizard();
    const io = fakeIo();

    await stepExtras(io, {}, () => {});

    expect(io.asked.select[0].defaultValue).toBe('skip');
    expect(io.asked.ask).toHaveLength(0);
  });

  it('describes each one by what a teacher would notice, not by the vendor', async () => {
    const { OPTIONAL_EXTRAS } = require('../../bot/scripts/setup/fields');
    for (const extra of OPTIONAL_EXTRAS) {
      expect(extra.title).not.toMatch(/API|KEY|_/);
      expect(extra.why.length).toBeGreaterThan(40);
    }
  });

  it('only stores a multi-key extra when every one of its keys was given', async () => {
    // Azure needs a key AND a region; half of it configured is a feature that
    // reports itself available and then fails at runtime.
    const { stepExtras } = loadWizard();
    const saved = {};
    const io = fakeIo({ select: ['add'], ask: ['soniox-key', '', '', '', 'azure-key', '', ''] });

    await stepExtras(io, {}, (vars) => Object.assign(saved, vars));

    expect(saved.SONIOX_API_KEY).toBe('soniox-key');
    expect(saved.AZURE_SPEECH_KEY).toBeUndefined();
  });

  it('no longer lists Slack — it has its own step, not a single "Key" prompt (a whole channel with app-side config needs more than one field)', () => {
    const { OPTIONAL_EXTRAS } = require('../../bot/scripts/setup/fields');
    expect(OPTIONAL_EXTRAS.some((e) => e.keys.includes('SLACK_BOT_TOKEN'))).toBe(false);
  });
});

describe('stepMessagingChannels', () => {
  const slackPass = { slack: async () => ({ ok: true, detail: 'connected as My Workspace, all required scopes present' }) };

  it('defaults to declining Slack — WhatsApp alone is a complete setup', async () => {
    const { stepMessagingChannels } = loadWizard();
    const io = fakeIo({ confirm: [false] });

    const result = await stepMessagingChannels(io, {}, () => {});

    expect(io.asked.confirm[0]).toMatch(/also connect slack/i);
    expect(result).toEqual({ slack: false, discord: false });
    expect(io.asked.ask).toHaveLength(0);
  });

  it('prints the full checklist (scopes, event, all 3 Request URLs, every slash command) before asking for credentials', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const { SLACK_BOT_SCOPES, SLACK_SLASH_COMMANDS } = require('../../bot/scripts/setup/fields');
    const io = fakeIo({
      confirm: [true],
      ask: ['https://my-tunnel.ngrok-free.dev', 'signing-secret', 'xoxb-bot-token'],
    });

    await stepMessagingChannels(io, {}, () => {});

    for (const scope of SLACK_BOT_SCOPES) expect(log.text).toContain(scope);
    for (const cmd of SLACK_SLASH_COMMANDS) expect(log.text).toContain(cmd);
    expect(log.text).toContain('https://my-tunnel.ngrok-free.dev/api/slack/events');
    expect(log.text).toContain('https://my-tunnel.ngrok-free.dev/api/slack/interactions');
    expect(log.text).toContain('https://my-tunnel.ngrok-free.dev/api/slack/commands');
    expect(log.text).toContain('message.im');
    expect(log.text).toMatch(/Socket Mode OFF/i);
  });

  it('walks the app config as 6 separate screens, one Press Enter between each, not one wall of text', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const io = fakeIo({
      confirm: [true],
      ask: ['https://my-tunnel.ngrok-free.dev', 'signing-secret', 'xoxb-bot-token'],
    });

    await stepMessagingChannels(io, {}, () => {});

    // 6 app-config screens (create app, scopes, events, interactivity, slash
    // commands, install) — the credential prompts afterward are `ask`, not
    // `pressEnter`, so this count is exactly the config walkthrough's length.
    expect(io.asked.pressEnter).toBe(6);
  });

  it('presents the checklist in Slack\'s own sidebar order: create app -> scopes -> events -> interactivity -> slash commands -> install', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const io = fakeIo({
      confirm: [true],
      ask: ['https://my-tunnel.ngrok-free.dev', 'signing-secret', 'xoxb-bot-token'],
    });

    await stepMessagingChannels(io, {}, () => {});

    const order = ['Create the app', 'Bot Token Scopes', 'Event Subscriptions', 'Interactivity & Shortcuts', 'Slash Commands', 'Install the app']
      .map((label) => log.text.indexOf(label));
    expect(order.every((i) => i !== -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('masks both Slack credentials — the signing secret AND the bot token', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const io = fakeIo({
      confirm: [true],
      ask: ['https://my-tunnel.ngrok-free.dev', 'signing-secret', 'xoxb-bot-token'],
    });

    await stepMessagingChannels(io, {}, () => {});

    // ask[0] is the base-URL prompt; the two Slack credential prompts follow.
    expect(io.asked.ask[1].secret).toBe(true); // Signing Secret
    expect(io.asked.ask[2].secret).toBe(true); // Bot User OAuth Token
  });

  it('saves both credentials once the live scope check passes', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const saved = {};
    const io = fakeIo({
      confirm: [true],
      ask: ['https://my-tunnel.ngrok-free.dev', 'a-signing-secret', 'xoxb-a-bot-token'],
    });

    const result = await stepMessagingChannels(io, {}, (vars) => Object.assign(saved, vars));

    expect(saved.SLACK_SIGNING_SECRET).toBe('a-signing-secret');
    expect(saved.SLACK_BOT_TOKEN).toBe('xoxb-a-bot-token');
    expect(result).toEqual({ slack: true, discord: false });
  });

  it('reports exactly which scopes are missing rather than a generic failure, and lets the user retry', async () => {
    const scopeCheck = jest.fn()
      .mockResolvedValueOnce({ ok: false, detail: 'token works, but is missing scopes: files:read, files:write' })
      .mockResolvedValueOnce({ ok: true, detail: 'connected as My Workspace, all required scopes present' });
    const { stepMessagingChannels } = loadWizard({ probes: { slack: scopeCheck } });
    const io = fakeIo({
      confirm: [true, true], // connect Slack, then "try again" after the failure
      ask: [
        'https://my-tunnel.ngrok-free.dev',
        'signing-secret', 'xoxb-bot-token-1', // first attempt — missing scopes
        'signing-secret', 'xoxb-bot-token-2', // retry — succeeds
      ],
    });

    const result = await stepMessagingChannels(io, {}, () => {});

    expect(scopeCheck).toHaveBeenCalledTimes(2);
    expect(log.text).toContain('missing scopes: files:read, files:write');
    expect(result).toEqual({ slack: true, discord: false });
  });

  it('gives up cleanly if the user declines to retry after a failed check', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: { slack: async () => ({ ok: false, detail: 'HTTP 401' }) } });
    const io = fakeIo({
      confirm: [true, false], // connect Slack, then decline the retry
      ask: ['https://my-tunnel.ngrok-free.dev', 'signing-secret', 'xoxb-bot-token'],
    });

    const result = await stepMessagingChannels(io, {}, () => {});
    expect(result).toEqual({ slack: false, discord: false });
  });

  it('rejects a non-https base URL — Slack refuses anything else', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const io = fakeIo({
      confirm: [true],
      ask: ['http://not-secure.example.com', 'signing-secret', 'xoxb-bot-token'],
    });

    await stepMessagingChannels(io, {}, () => {});

    expect(io.validationFailures.some((f) => /https:\/\//.test(f.reason))).toBe(true);
  });

  it('skips straight through when Slack is already configured and still working', async () => {
    const { stepMessagingChannels } = loadWizard({ probes: slackPass });
    const env = { SLACK_SIGNING_SECRET: 'already-set', SLACK_BOT_TOKEN: 'xoxb-already-set' };
    const io = fakeIo();

    const result = await stepMessagingChannels(io, env, () => {});

    expect(result).toEqual({ slack: true, discord: false });
    // Never asked "also connect Slack?" (Slack's own live check short-circuited
    // that) — the one confirm() call that DOES happen is Discord's own
    // "Also connect Discord?" question, asked unconditionally afterward.
    expect(io.asked.confirm).toEqual(['Also connect Discord?']);
  });
});

describe('stepDiscordChannel', () => {
  const discordPass = { discord: async () => ({ ok: true, detail: 'connected as My App' }) };

  function loadWizardWithDiscordCommands(registerImpl) {
    jest.doMock('../../bot/scripts/setup/discord-register-commands', () => ({
      registerDiscordCommands: registerImpl || jest.fn().mockResolvedValue({ registered: 9, guildScoped: false, commands: [] }),
    }));
    return loadWizard({ probes: discordPass });
  }

  it('defaults to declining Discord — WhatsApp alone is a complete setup', async () => {
    const { stepDiscordChannel } = loadWizardWithDiscordCommands();
    const io = fakeIo({ confirm: [false] });

    const result = await stepDiscordChannel(io, {}, () => {});

    expect(io.asked.confirm[0]).toMatch(/also connect discord/i);
    expect(result).toEqual({ discord: false });
    expect(io.asked.ask).toHaveLength(0);
  });

  it('walks the app config as 5 separate screens, one Press Enter between each', async () => {
    const { stepDiscordChannel } = loadWizardWithDiscordCommands();
    const io = fakeIo({ confirm: [true], ask: ['bot-token', 'app-id'] });

    await stepDiscordChannel(io, {}, () => {});

    expect(io.asked.pressEnter).toBe(5);
  });

  it('saves both credentials, registers slash commands, and reports success once the live check passes', async () => {
    const registerImpl = jest.fn().mockResolvedValue({ registered: 9, guildScoped: false, commands: ['portal'] });
    const { stepDiscordChannel } = loadWizardWithDiscordCommands(registerImpl);
    const saved = {};
    const io = fakeIo({ confirm: [true], ask: ['a-bot-token', 'an-app-id'] });

    const result = await stepDiscordChannel(io, {}, (vars) => Object.assign(saved, vars));

    expect(saved.DISCORD_BOT_TOKEN).toBe('a-bot-token');
    expect(saved.DISCORD_APPLICATION_ID).toBe('an-app-id');
    expect(registerImpl).toHaveBeenCalledWith({ token: 'a-bot-token', applicationId: 'an-app-id', guildId: undefined });
    expect(result).toEqual({ discord: true });
  });

  it('masks the bot token but not the application id', async () => {
    const { stepDiscordChannel } = loadWizardWithDiscordCommands();
    const io = fakeIo({ confirm: [true], ask: ['a-bot-token', 'an-app-id'] });

    await stepDiscordChannel(io, {}, () => {});

    expect(io.asked.ask[0].secret).toBe(true); // Bot Token
    expect(io.asked.ask[1].secret).toBeFalsy(); // Application ID
  });

  it('still reports success even if slash-command registration itself fails — that is retriable separately', async () => {
    const registerImpl = jest.fn().mockRejectedValue(new Error('network error'));
    const { stepDiscordChannel } = loadWizardWithDiscordCommands(registerImpl);
    const io = fakeIo({ confirm: [true], ask: ['a-bot-token', 'an-app-id'] });

    const result = await stepDiscordChannel(io, {}, () => {});

    expect(result).toEqual({ discord: true });
  });

  it('gives up cleanly if the user declines to retry after a failed check', async () => {
    const { stepDiscordChannel } = loadWizardWithDiscordCommands();
    jest.resetModules();
    jest.doMock('../../bot/scripts/setup/discord-register-commands', () => ({ registerDiscordCommands: jest.fn() }));
    jest.doMock('../../bot/scripts/setup/doctor', () => ({
      defaultProbes: { discord: async () => ({ ok: false, detail: 'HTTP 401' }) },
      runDoctor: jest.fn(),
    }));
    const wizard = require(WIZARD);
    const io = fakeIo({ confirm: [true, false], ask: ['bad-token', 'an-app-id'] });

    const result = await wizard.stepDiscordChannel(io, {}, () => {});
    expect(result).toEqual({ discord: false });
  });

  it('skips straight through when Discord is already configured and still working', async () => {
    const { stepDiscordChannel } = loadWizardWithDiscordCommands();
    const env = { DISCORD_BOT_TOKEN: 'already-set', DISCORD_APPLICATION_ID: 'already-set' };
    const io = fakeIo();

    const result = await stepDiscordChannel(io, env, () => {});

    expect(result).toEqual({ discord: true });
    expect(io.asked.confirm).toHaveLength(0); // never even asked "also connect Discord?"
  });
});

describe('the template is a set of suggestions, not answers', () => {
  // `.env` is created by copying `.env.template`, which ships working-looking
  // values (`redis://localhost:6379`, `https://your-project.supabase.co`).
  // Counting those as configuration produced three wrong things in a live
  // fresh-clone run, each fixed and pinned below.
  const FRESH_ENV = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'CHANGEME-supabase-service-role-key',
    OPENROUTER_API_KEY: 'CHANGEME-sk-or-v1-your-openrouter-key',
    REDIS_URL: 'redis://localhost:6379',
    CHANNEL_DRIVER: 'baileys',
  };

  it('does not count a template placeholder as a configured service', () => {
    const { isProvided } = loadWizard();
    expect(isProvided(FRESH_ENV, 'SUPABASE_URL')).toBe(false);
    expect(isProvided(FRESH_ENV, 'REDIS_URL')).toBe(false);
    expect(isProvided(FRESH_ENV, 'OPENROUTER_API_KEY')).toBe(false);
    expect(isProvided({ REDIS_URL: 'redis://default:pw@host.rlwy.net:38580' }, 'REDIS_URL')).toBe(true);
  });

  it('never claims "picking up from last time" on a fresh clone', () => {
    const { welcome } = loadWizard();
    welcome(FRESH_ENV);
    expect(log.text).not.toMatch(/picking up/i);
  });

  it('says it is picking up when a real value is there', () => {
    const { welcome } = loadWizard();
    welcome({ ...FRESH_ENV, OPENROUTER_API_KEY: 'sk-or-v1-real' });
    expect(log.text).toMatch(/picking up/i);
  });

  it('never offers a placeholder as the value to keep', async () => {
    const { stepDatabase } = loadWizard({
      probes: allPass,
      dbSetup: { inspectDatabase: async () => ({ state: 'ready', detail: 'ok' }) },
    });
    const io = fakeIo({ ask: ['https://real.supabase.co', 'sb_secret_real'] });

    await stepDatabase(io, { ...FRESH_ENV }, () => {});

    // Pressing Enter on `[https://your-project.supabase.co]` would accept a
    // placeholder as configuration.
    for (const asked of io.asked.ask) expect(asked.fallback).toBe('');
  });

  it('tries the template\'s local Redis quietly, without a red cross for something nobody configured', async () => {
    // Fails for the template's localhost, succeeds for the address the user
    // pastes — the wizard re-asks until Redis answers, so a probe that always
    // fails would loop forever (as it should, with a human at the keyboard).
    let call = 0;
    const { stepMemory } = loadWizard({
      probes: {
        ...allPass,
        redis: async () => {
          call += 1;
          return call === 1
            ? { ok: false, detail: 'nothing answered at redis://localhost:6379' }
            : { ok: true, detail: 'PONG' };
        },
      },
    });
    const io = fakeIo({ ask: ['redis://default:pw@host.rlwy.net:38580'] });

    // Docker pinned off. Left to the real probe this passed on a machine without
    // a Docker daemon and failed on CI, which has one: the step would offer the
    // container menu, the fake io would take its default, and the test would
    // shell out to `docker run` on the runner. A test must not depend on what
    // happens to be installed on the host.
    await stepMemory(io, { ...FRESH_ENV }, () => {}, { dockerAvailable: () => false });

    expect(log.text).not.toMatch(/Redis you already have/);
    expect(log.text).not.toMatch(/not answering/);
    expect(io.asked.ask).toHaveLength(1);
  });

  it('keeps the template\'s local Redis when one really is running there', async () => {
    const { stepMemory } = loadWizard({ probes: allPass });
    const io = fakeIo();

    // Returns before Docker is consulted, but pinned anyway so the test cannot
    // start depending on the host if the order of the step ever changes.
    await stepMemory(io, { ...FRESH_ENV }, () => {}, { dockerAvailable: () => false });

    expect(io.asked.ask).toHaveLength(0);
    expect(log.text).toMatch(/already running at redis:\/\/localhost:6379/);
  });

  it('still asks which channel to use, rather than inheriting the template default', async () => {
    const { stepChannel } = loadWizard({ probes: allPass });
    const io = fakeIo({ select: ['baileys'], confirm: [false] });

    await stepChannel(io, { ...FRESH_ENV }, () => {});

    expect(io.asked.select).toHaveLength(1);
  });
});

describe('no test may consult the host for Docker', () => {
  it('every stepMemory call injects dockerAvailable', () => {
    // The failure this prevents: a test that reaches the real `dockerAvailable()`
    // passes on a machine without a Docker daemon and fails on CI, which has
    // one — and on the way it shells out to `docker run` on the runner. Both
    // branches are worth testing; neither may be chosen by the host.
    const source = require('fs').readFileSync(__filename, 'utf-8');
    const calls = source.match(/stepMemory\(io[^;]*?\);/gs) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/dockerAvailable:/);
  });
});

describe('the Redis step is not a dead end', () => {
  it('says where to get one when Docker is not available to start one', async () => {
    // Live fresh-clone run on a machine with no Docker daemon: the step asked
    // for an address and explained its format, but never said how someone with
    // no Redis at all was meant to get one. Redis is required, so that is a
    // blocked setup, not an inconvenience.
    const { stepMemory } = loadWizard({ probes: { ...allPass, redis: async () => ({ ok: true, detail: 'PONG' }) } });
    const io = fakeIo({ ask: ['redis://default:pw@host:6379'] });

    await stepMemory(io, {}, () => {}, { dockerAvailable: () => false });

    expect(log.text).toMatch(/upstash\.com/);
    expect(log.text).toMatch(/docker run/);
    expect(io.asked.select).toHaveLength(0); // a one-item menu is not a question
  });

  it('offers to start one locally when Docker is there, instead of the where-to-get-it list', async () => {
    const { stepMemory } = loadWizard({ probes: { ...allPass, redis: async () => ({ ok: true, detail: 'PONG' }) } });
    const io = fakeIo({ select: ['paste'], ask: ['redis://default:pw@host:6379'] });

    await stepMemory(io, {}, () => {}, { dockerAvailable: () => true });

    expect(io.asked.select).toHaveLength(1);
    expect(io.asked.select[0].options.map((o) => o.value)).toEqual(['docker', 'paste']);
    expect(log.text).not.toMatch(/upstash\.com/);
  });
});
