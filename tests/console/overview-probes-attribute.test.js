/**
 * The console overview hands its connection probes to console.js in a
 * single-quoted attribute (data-probes='…'). It is written with <%= %>, so a
 * `'` or `<` in a label is entity-escaped and cannot end the attribute;
 * getAttribute decodes the entities, so console.js parses the same JSON.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BOT = path.join(__dirname, '../../bot');
const DASHBOARD = path.join(__dirname, '../../dashboard');
const HAVE_DEPS = fs.existsSync(path.join(BOT, 'node_modules', 'ejs'))
  && fs.existsSync(path.join(DASHBOARD, 'node_modules', 'jsdom'));
const describeIf = HAVE_DEPS || process.env.CI ? describe : describe.skip;

describeIf('console overview: data-probes', () => {
  test('reads back as the probe list through getAttribute', async () => {
    const ejs = createRequire(path.join(BOT, 'package.json'))('ejs');
    const { JSDOM } = createRequire(path.join(DASHBOARD, 'package.json'))('jsdom');
    // The locals bot/console/routes/pages.js passes to 'overview'.
    const html = await ejs.renderFile(path.join(BOT, 'console/views/overview.ejs'), {
      branding: { botName: 'Rumi', orgName: null },
      mount: '/console',
      posture: { mode: 'local' },
      standalone: false,
      pending: [],
      active: '/',
      setupTally: null,
      featureTally: null,
      pageTitle: 'Overview',
      missing: [],
      channel: 'none',
      activeChannels: ['matrix'],
      answeringOn: 'Answering on Rumi Messenger (Matrix).',
      identity: { paired: false },
      processState: { running: true, pid: 1 },
      features: { counts: { on: 0, total: 0 }, rows: [] },
      ring: { records: 0, traces: 0 },
      uptime: 5,
      version: '0.0.0-test',
    });
    const box = new JSDOM(html).window.document.getElementById('probes');
    const probes = JSON.parse(box.getAttribute('data-probes'));
    expect(probes.map((p) => p.id)).toEqual(['supabase', 'tables', 'openrouter', 'redis']);
    expect(probes[0].keys).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
});
