/**
 * First-run banner on Activity: the reply-sent pattern, the model that decides
 * whether the banner shows, and the rendered markup.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const { isReplySent, firstRunModel, REPLY_SENT_SOURCE, NO_ARRIVAL_MS } = require('../../bot/console/first-run');
const { buildCatalog } = require('../../bot/console/env-catalog');
const { requiredVarsFor } = require('../../bot/shared/config/feature-availability');

const ESSENTIALS = Object.fromEntries(requiredVarsFor({}).map((k) => [k, 'sk-or-test']));

describe('isReplySent', () => {
  it.each([
    '✅ Baileys message sent',
    '✅ WhatsApp message sent',
    '✅ Template message sent',
    '✅ Video message sent successfully',
  ])('matches %s', (msg) => {
    expect(isReplySent({ msg })).toBe(true);
  });
  it.each([{ msg: '❌ Baileys: error sending message' }, { msg: null }, {}])('rejects %j', (rec) => {
    expect(isReplySent(rec)).toBe(false);
  });
  it('exports the pattern source and timeout', () => {
    expect(new RegExp(REPLY_SENT_SOURCE).test('✅ Baileys message sent')).toBe(true);
    expect(NO_ARRIVAL_MS).toBe(90000);
  });
});

describe('firstRunModel', () => {
  it('is null unless first-run=1', () => {
    expect(firstRunModel({}, buildCatalog(ESSENTIALS))).toBeNull();
    expect(firstRunModel({ 'first-run': '0' }, buildCatalog(ESSENTIALS))).toBeNull();
  });
  it('counts abilities that are on and live', () => {
    expect(firstRunModel({ 'first-run': '1' }, buildCatalog(ESSENTIALS))).toEqual({ abilitiesOn: 0 });
    const env = { ...ESSENTIALS, SONIOX_API_KEY: 'k' };
    expect(firstRunModel({ 'first-run': '1' }, buildCatalog(env, { liveEnv: env }))).toEqual({ abilitiesOn: 1 });
  });
  it('does not count an ability saved but not yet live', () => {
    const env = { ...ESSENTIALS, SONIOX_API_KEY: 'k' };
    expect(firstRunModel({ 'first-run': '1' }, buildCatalog(env, { liveEnv: ESSENTIALS }))).toEqual({ abilitiesOn: 0 });
  });
});

const BOT = path.join(__dirname, '../../bot');
const DASHBOARD = path.join(__dirname, '../../dashboard');
const EJS_FROM = [BOT, DASHBOARD].find((dir) => fs.existsSync(path.join(dir, 'node_modules', 'ejs')));
const describeIf = EJS_FROM || process.env.CI ? describe : describe.skip;

describeIf('activity view', () => {
  async function renderActivity(firstRun) {
    const ejs = createRequire(path.join(EJS_FROM, 'package.json'))('ejs');
    return ejs.renderFile(path.join(BOT, 'console/views/activity.ejs'), {
      branding: { botName: 'Rumi', orgName: null },
      mount: '/console',
      posture: { mode: 'local' },
      standalone: false,
      pending: [],
      active: '/activity',
      setupTally: null,
      featureTally: null,
      pageTitle: 'Activity',
      traces: [],
      stats: { records: 0, capacity: 0, traces: 0 },
      firstRun,
      REPLY_SENT_SOURCE,
    });
  }

  it('shows the banner with the reply pattern and no inline styles', async () => {
    const html = await renderActivity({ abilitiesOn: 2 });
    expect(html).toContain('Rumi is awake. Say hello.');
    expect(html).toContain('data-reply-pattern="');
    expect(html).toContain('2 optional abilities on, see Features');
    expect(html).not.toContain('style="');
  });
  it('omits the Features link when no ability is on, and the banner when not first run', async () => {
    const html = await renderActivity({ abilitiesOn: 0 });
    expect(html).not.toContain('see Features');
    expect(await renderActivity(null)).not.toContain('Rumi is awake');
  });
});
