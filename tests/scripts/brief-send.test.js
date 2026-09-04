/**
 * bot/scripts/brief/send-brief.js — delivers a rendered Morning Brief
 * (a manifest.json plus panel PNGs) through the messaging router. The
 * router is injected here as a fake, so these tests cover ordering,
 * idempotency, dry-run, and failure isolation without any driver loading.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

function load() {
  jest.resetModules();
  return require('../../bot/scripts/brief/send-brief');
}

const MANIFEST = {
  version: 1,
  kind: 'daily',
  day: '2026-09-03',
  dateline: 'yesterday · Thu 03 Sep',
  generated_at: '2026-09-04T04:05:00Z',
  cohort: { teachers: 1063, label: 'all registered teachers' },
  lead: 'Good morning. Here is how yesterday went.',
  closer: 'That is the picture for yesterday. Same time tomorrow.',
  live_url: null,
  panels: [
    { id: 'cover', file: '00_cover.png', caption: 'Cover caption that should be replaced by the lead', alt: 'cover' },
    { id: 'active', file: '01_active.png', caption: 'Active teachers held steady at 412, the fourth flat day in a row after the holiday dip.', alt: 'active' },
    { id: 'lessons', file: '02_lessons.png', caption: 'Lesson plans: 96 generated.', alt: 'lessons' },
  ],
};

let dir;

function writeManifest(overrides = {}) {
  const manifest = { ...MANIFEST, ...overrides };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const p of manifest.panels) fs.writeFileSync(path.join(dir, p.file), 'png');
  return manifest;
}

function fakeMessaging({ sendImage, sendMessage } = {}) {
  return {
    sendImage: jest.fn(sendImage || (async () => true)),
    sendMessage: jest.fn(sendMessage || (async () => true)),
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-brief-send-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.BRIEF_RECIPIENTS;
  delete process.env.BRIEF_OUT_DIR;
  delete process.env.BRIEF_LIVE_URL;
});

describe('resolveRecipients', () => {
  it('returns [] when BRIEF_RECIPIENTS is unset or blank', () => {
    const { resolveRecipients } = load();
    expect(resolveRecipients({})).toEqual([]);
    expect(resolveRecipients({ BRIEF_RECIPIENTS: '' })).toEqual([]);
    expect(resolveRecipients({ BRIEF_RECIPIENTS: '  , ,' })).toEqual([]);
  });

  it('splits on commas and tolerates whitespace', () => {
    const { resolveRecipients } = load();
    expect(resolveRecipients({ BRIEF_RECIPIENTS: ' slack:channel:C01 , 15550100000 ,,discord:channel:99 ' }))
      .toEqual(['slack:channel:C01', '15550100000', 'discord:channel:99']);
  });
});

describe('loadManifest / defaultManifestDir', () => {
  it('reads manifest.json from the directory', () => {
    const { loadManifest } = load();
    writeManifest();
    expect(loadManifest(dir)).toMatchObject({ kind: 'daily', day: '2026-09-03' });
  });

  it('throws a plain message when there is no manifest yet', () => {
    const { loadManifest } = load();
    expect(() => loadManifest(dir)).toThrow(/manifest\.json/);
  });

  it('throws when the manifest has no panels', () => {
    const { loadManifest } = load();
    writeManifest({ panels: [] });
    expect(() => loadManifest(dir)).toThrow(/panels/);
  });

  it('resolves the default directory from the repo root, not the working directory', () => {
    const { defaultManifestDir } = load();
    expect(defaultManifestDir('daily', {})).toBe(path.join(REPO_ROOT, 'brief', 'out', 'latest', 'daily'));
    expect(defaultManifestDir('weekly', { BRIEF_OUT_DIR: 'var/briefs' }))
      .toBe(path.join(REPO_ROOT, 'var', 'briefs', 'latest', 'weekly'));
    expect(defaultManifestDir('daily', { BRIEF_OUT_DIR: '/abs/briefs' }))
      .toBe(path.join('/abs/briefs', 'latest', 'daily'));
  });
});

describe('sendBrief — ordering', () => {
  it('sends the cover with the lead, then every other panel with its caption, then the closer as text', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const calls = [];
    messaging.sendImage.mockImplementation(async (to, file, caption) => { calls.push(['image', to, file, caption]); return true; });
    messaging.sendMessage.mockImplementation(async (to, text) => { calls.push(['text', to, text]); return true; });

    const result = await sendBrief({ manifestDir: dir, recipients: ['slack:channel:C01'], messaging, log: () => {} });

    expect(calls).toEqual([
      ['image', 'slack:channel:C01', path.join(dir, '00_cover.png'), MANIFEST.lead],
      ['image', 'slack:channel:C01', path.join(dir, '01_active.png'), MANIFEST.panels[1].caption],
      ['image', 'slack:channel:C01', path.join(dir, '02_lessons.png'), MANIFEST.panels[2].caption],
      ['text', 'slack:channel:C01', MANIFEST.closer],
    ]);
    expect(result.sent).toEqual(['slack:channel:C01']);
    expect(result.failed).toEqual([]);
  });

  it('appends a "Live:" line to the closer when the manifest carries a live_url', async () => {
    const { sendBrief } = load();
    writeManifest({ live_url: 'https://dash.example.org/observability/brief' });
    const messaging = fakeMessaging();
    await sendBrief({ manifestDir: dir, recipients: ['15550100000'], messaging, log: () => {} });
    expect(messaging.sendMessage).toHaveBeenCalledWith(
      '15550100000',
      `${MANIFEST.closer}\n\nLive: https://dash.example.org/observability/brief`,
    );
  });

  it('falls back to BRIEF_LIVE_URL when the manifest has no live_url', async () => {
    const { sendBrief } = load();
    writeManifest({ live_url: null });
    const messaging = fakeMessaging();
    await sendBrief({
      manifestDir: dir, recipients: ['15550100000'], messaging, log: () => {},
      env: { BRIEF_LIVE_URL: 'https://dash.example.org/observability/brief' },
    });
    expect(messaging.sendMessage.mock.calls[0][1]).toMatch(/Live: https:\/\/dash\.example\.org/);
  });

  it('delivers to every recipient, each in full order', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const result = await sendBrief({ manifestDir: dir, recipients: ['a', 'b'], messaging, log: () => {} });
    expect(messaging.sendImage).toHaveBeenCalledTimes(6);
    expect(messaging.sendMessage).toHaveBeenCalledTimes(2);
    expect(result.sent).toEqual(['a', 'b']);
  });
});

describe('sendBrief — idempotency (sent.json beside the manifest)', () => {
  it('records each delivered target with kind + day, and skips it on the next run', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const log = jest.fn();

    await sendBrief({ manifestDir: dir, recipients: ['slack:channel:C01'], messaging, log });
    const sentLog = JSON.parse(fs.readFileSync(path.join(dir, 'sent.json'), 'utf-8'));
    expect(sentLog['slack:channel:C01']).toMatchObject({ kind: 'daily', day: '2026-09-03' });
    expect(typeof sentLog['slack:channel:C01'].sent_at).toBe('string');

    messaging.sendImage.mockClear();
    messaging.sendMessage.mockClear();
    const second = await sendBrief({ manifestDir: dir, recipients: ['slack:channel:C01'], messaging, log });
    expect(messaging.sendImage).not.toHaveBeenCalled();
    expect(messaging.sendMessage).not.toHaveBeenCalled();
    expect(second.skipped).toEqual(['slack:channel:C01']);
    expect(log.mock.calls.flat().join('\n')).toMatch(/already sent/i);
  });

  it('sends again when the manifest is for a different day', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    await sendBrief({ manifestDir: dir, recipients: ['t'], messaging, log: () => {} });
    writeManifest({ day: '2026-09-04' });
    messaging.sendImage.mockClear();
    const result = await sendBrief({ manifestDir: dir, recipients: ['t'], messaging, log: () => {} });
    expect(messaging.sendImage).toHaveBeenCalledTimes(3);
    expect(result.sent).toEqual(['t']);
  });

  it('--force sends again even when already recorded', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    await sendBrief({ manifestDir: dir, recipients: ['t'], messaging, log: () => {} });
    messaging.sendImage.mockClear();
    const result = await sendBrief({ manifestDir: dir, recipients: ['t'], messaging, log: () => {}, force: true });
    expect(messaging.sendImage).toHaveBeenCalledTimes(3);
    expect(result.sent).toEqual(['t']);
  });

  it('a target that only partly sent is NOT recorded, so a re-run retries it', async () => {
    const { sendBrief } = load();
    writeManifest();
    let n = 0;
    const messaging = fakeMessaging({ sendImage: async () => { n += 1; return n !== 2; } });
    await sendBrief({ manifestDir: dir, recipients: ['t'], messaging, log: () => {} });
    expect(fs.existsSync(path.join(dir, 'sent.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'sent.json'), 'utf-8')) : {})
      .not.toHaveProperty('t');
  });
});

describe('sendBrief — dry run', () => {
  it('prints the plan (panel count, first 60 chars of each caption, targets) and sends nothing', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const log = jest.fn();

    const result = await sendBrief({ manifestDir: dir, recipients: ['slack:channel:C01', '15550100000'], messaging, log, dryRun: true });

    expect(messaging.sendImage).not.toHaveBeenCalled();
    expect(messaging.sendMessage).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'sent.json'))).toBe(false);
    expect(result.dryRun).toBe(true);

    const printed = log.mock.calls.flat().join('\n');
    expect(printed).toMatch(/3 panels/);
    expect(printed).toContain('slack:channel:C01');
    expect(printed).toContain('15550100000');
    const longCaption = MANIFEST.panels[1].caption;
    expect(printed).toContain(longCaption.slice(0, 60));
    expect(printed).not.toContain(longCaption);
  });
});

describe('sendBrief — failure isolation', () => {
  it('a driver returning false for one target does not stop the others', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging({ sendImage: async (to) => to !== 'bad' });
    const result = await sendBrief({ manifestDir: dir, recipients: ['bad', 'good'], messaging, log: () => {} });
    expect(result.failed.map((f) => f.target)).toEqual(['bad']);
    expect(result.sent).toEqual(['good']);
    // the good target still got the full sequence
    expect(messaging.sendMessage).toHaveBeenCalledWith('good', MANIFEST.closer);
  });

  it('a driver that throws is treated the same as one that returns false', async () => {
    const { sendBrief } = load();
    writeManifest();
    const messaging = fakeMessaging({ sendImage: async (to) => { if (to === 'bad') throw new Error('socket closed'); return true; } });
    const result = await sendBrief({ manifestDir: dir, recipients: ['bad', 'good'], messaging, log: () => {} });
    expect(result.failed).toEqual([expect.objectContaining({ target: 'bad', reason: expect.stringMatching(/socket closed/) })]);
    expect(result.sent).toEqual(['good']);
  });

  it('exit code is non-zero only when every target failed', () => {
    const { exitCodeFor } = load();
    expect(exitCodeFor({ sent: ['a'], skipped: [], failed: [{ target: 'b' }] })).toBe(0);
    expect(exitCodeFor({ sent: [], skipped: ['a'], failed: [{ target: 'b' }] })).toBe(0);
    expect(exitCodeFor({ sent: [], skipped: [], failed: [{ target: 'a' }, { target: 'b' }] })).toBe(1);
    expect(exitCodeFor({ sent: [], skipped: [], failed: [] })).toBe(0);
  });
});

describe('CLI', () => {
  it('parseArgs understands --kind, --dir, --to, --dry-run, --force with sensible defaults', () => {
    const { parseArgs } = load();
    expect(parseArgs([])).toEqual({ kind: 'daily', dir: null, to: null, dryRun: false, force: false });
    expect(parseArgs(['--kind', 'weekly', '--dir', '/x', '--to', 'a, b', '--dry-run', '--force']))
      .toEqual({ kind: 'weekly', dir: '/x', to: 'a, b', dryRun: true, force: true });
    expect(parseArgs(['--kind=weekly', '--to=a'])).toMatchObject({ kind: 'weekly', to: 'a' });
  });

  it('parseArgs rejects an unknown kind', () => {
    const { parseArgs } = load();
    expect(() => parseArgs(['--kind', 'hourly'])).toThrow(/daily|weekly/);
  });

  it('main() honours --dir and --to, and returns the exit code', async () => {
    const { main } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const code = await main(['--dir', dir, '--to', 'x, y'], { messaging, log: () => {} });
    expect(code).toBe(0);
    expect(messaging.sendImage).toHaveBeenCalledTimes(6);
  });

  it('main() falls back to BRIEF_RECIPIENTS when --to is absent, and exits 0 with a note when there are none', async () => {
    const { main } = load();
    writeManifest();
    const messaging = fakeMessaging();
    const log = jest.fn();
    const code = await main(['--dir', dir], { messaging, log, env: {} });
    expect(code).toBe(0);
    expect(messaging.sendImage).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/BRIEF_RECIPIENTS/);
  });

  it('main() returns 1 when every target failed', async () => {
    const { main } = load();
    writeManifest();
    const messaging = fakeMessaging({ sendImage: async () => false });
    const code = await main(['--dir', dir, '--to', 'a'], { messaging, log: () => {} });
    expect(code).toBe(1);
  });
});
