/**
 * graduate.js — the `rumi graduate` command. Covers the pure/testable pieces:
 * arg parsing, credential validation (via doctor's own probe, mocked),
 * and outgoing-state retirement. The interactive prompt loop is exercised
 * with a fake readline interface rather than real stdin.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs, validateTargetCredentials, retireOutgoingDriverState, promptForTargetVars, printManualChecklist,
} = require('../../bot/scripts/setup/graduate');

describe('parseArgs', () => {
  it('parses --to=meta into { to: "meta" }', () => {
    expect(parseArgs(['node', 'graduate.js', '--to=meta'])).toEqual({ to: 'meta' });
  });

  it('returns {} when no flags are given', () => {
    expect(parseArgs(['node', 'graduate.js'])).toEqual({});
  });
});

describe('validateTargetCredentials', () => {
  it('skips live validation for a non-meta target (no probe exists yet)', async () => {
    const result = await validateTargetCredentials('baileys', {});
    expect(result.ok).toBe(true);
  });

  it('delegates to doctor.js\'s own WhatsApp probe for meta, reporting pass', async () => {
    jest.resetModules();
    jest.doMock('../../bot/scripts/setup/doctor', () => ({
      runDoctor: jest.fn().mockResolvedValue({
        probeResults: [{ name: 'WhatsApp Cloud API', status: 'pass', detail: 'HTTP 200' }],
      }),
    }));
    const { validateTargetCredentials: reloaded } = require('../../bot/scripts/setup/graduate');
    const result = await reloaded('meta', { WHATSAPP_TOKEN: 'x', PHONE_NUMBER_ID: 'y' });
    expect(result).toEqual({ ok: true, detail: 'HTTP 200' });
  });

  it('reports failure when doctor\'s probe fails (bad credentials)', async () => {
    jest.resetModules();
    jest.doMock('../../bot/scripts/setup/doctor', () => ({
      runDoctor: jest.fn().mockResolvedValue({
        probeResults: [{ name: 'WhatsApp Cloud API', status: 'fail', detail: 'HTTP 401' }],
      }),
    }));
    const { validateTargetCredentials: reloaded } = require('../../bot/scripts/setup/graduate');
    const result = await reloaded('meta', {});
    expect(result).toEqual({ ok: false, detail: 'HTTP 401' });
  });
});

describe('retireOutgoingDriverState', () => {
  it('renames <state-dir>/<driver> to <driver>.retired rather than deleting it', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-graduate-test-'));
    fs.mkdirSync(path.join(stateDir, 'baileys'), { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'baileys', 'creds.json'), '{}');

    const result = retireOutgoingDriverState('baileys', { CHANNEL_STATE_DIR: stateDir });

    expect(fs.existsSync(path.join(stateDir, 'baileys'))).toBe(false);
    expect(fs.existsSync(path.join(stateDir, 'baileys.retired'))).toBe(true);
    // Kept, not removed: graduation is reversible if the new channel disappoints.
    expect(fs.readFileSync(path.join(stateDir, 'baileys.retired', 'creds.json'), 'utf-8')).toBe('{}');
    expect(result.to).toContain('baileys.retired');
  });

  it('returns null when there is no local state to retire (e.g. graduating from meta)', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-graduate-test-'));
    expect(retireOutgoingDriverState('meta', { CHANNEL_STATE_DIR: stateDir })).toBeNull();
  });

  it('resolves a RELATIVE state dir against the repo, not the working directory', () => {
    // Must match baileys-connection.js's authDir(), which is repo-anchored for
    // the same reason: resolved against cwd, `cd bot && rumi graduate` would
    // "retire" bot/.channel-state and leave the live session in place. The
    // cwd-relative version of this produced a second WhatsApp device on a live
    // account.
    //
    // Uses a test-only directory name. An earlier version of this test used the
    // real '.channel-state' and, by working exactly as intended, renamed the
    // developer's live WhatsApp session — a test must not be able to do that
    // even when it passes.
    const RELATIVE = '.rumi-test-state';
    const repoCopy = path.resolve(__dirname, '../..', RELATIVE);
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-graduate-cwd-'));
    const decoy = path.join(elsewhere, RELATIVE);
    const original = process.cwd();

    fs.mkdirSync(path.join(repoCopy, 'baileys'), { recursive: true });
    fs.mkdirSync(path.join(decoy, 'baileys'), { recursive: true });
    process.chdir(elsewhere);
    try {
      const result = retireOutgoingDriverState('baileys', { CHANNEL_STATE_DIR: RELATIVE });

      // The repo's copy is the one that moved...
      expect(fs.existsSync(path.join(repoCopy, 'baileys.retired'))).toBe(true);
      expect(result.from).toBe(path.join(repoCopy, 'baileys'));
      // ...and the directory that merely happened to be the cwd is untouched.
      expect(fs.existsSync(path.join(decoy, 'baileys'))).toBe(true);
      expect(fs.existsSync(path.join(decoy, 'baileys.retired'))).toBe(false);
    } finally {
      process.chdir(original);
      fs.rmSync(repoCopy, { recursive: true, force: true });
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

describe('promptForTargetVars', () => {
  const { fakeIo } = require('./fake-io');

  it("asks for the target's credentials by their human names, prefilling any real existing value", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-graduate-test-'));
    const envPath = path.join(cwd, '.env');
    fs.writeFileSync(envPath, 'WHATSAPP_TOKEN=CHANGEME-token\nPHONE_NUMBER_ID=123456789012345\n');

    const io = fakeIo();
    const result = await promptForTargetVars(io, 'meta', envPath);

    expect(Object.keys(result)).toEqual(['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WABA_ID', 'WEBHOOK_VERIFY_TOKEN']);

    // Asked in Meta's own words, never by env-var name.
    const labels = io.asked.ask.map((a) => a.label);
    expect(labels).toEqual(['Access token', 'Phone number ID', 'WhatsApp Business Account ID', 'Webhook password']);

    const byLabel = Object.fromEntries(io.asked.ask.map((a) => [a.label, a]));
    // A CHANGEME placeholder is not a value — it must not be offered back.
    expect(byLabel['Access token'].fallback).toBe('');
    // A real existing value is, so Enter keeps it.
    expect(byLabel['Phone number ID'].fallback).toBe('123456789012345');
    expect(result.PHONE_NUMBER_ID).toBe('123456789012345');
  });

  it('carries the same shape checks as `rumi setup`, so the two cannot disagree', async () => {
    const io = fakeIo();
    await promptForTargetVars(io, 'meta', path.join(os.tmpdir(), 'does-not-exist'));
    const byLabel = Object.fromEntries(io.asked.ask.map((a) => [a.label, a]));

    // Asserted by behaviour rather than by function identity: earlier tests in
    // this file reset the module registry, so the same validator legitimately
    // arrives as a different function object.
    const phone = byLabel['Phone number ID'].validate('923001234567');
    expect(phone.ok).toBe(false);
    expect(phone.reason).toMatch(/looks like the phone number/i);

    expect(byLabel['Access token'].validate('sk-ant-nope').ok).toBe(false);
    expect(byLabel['Access token'].validate(`EAA${'x'.repeat(150)}`).ok).toBe(true);
  });

  it('hides the access token while it is typed', async () => {
    const io = fakeIo();
    await promptForTargetVars(io, 'meta', path.join(os.tmpdir(), 'does-not-exist'));
    const byLabel = Object.fromEntries(io.asked.ask.map((a) => [a.label, a]));
    expect(byLabel['Access token'].secret).toBe(true);
    expect(byLabel['WhatsApp Business Account ID'].secret).toBe(false);
  });

  it('asks for nothing when the target needs no credentials (any sandbox channel)', async () => {
    const io = fakeIo();
    const result = await promptForTargetVars(io, 'baileys');
    expect(result).toEqual({});
    expect(io.asked.ask).toHaveLength(0);
  });
});

describe('printManualChecklist', () => {
  it('says out loud that the production number is a different number', async () => {
    // The one thing graduation cannot carry over. Users are keyed by phone
    // number so all their data follows them, which makes it easy to assume the
    // number does too — and then existing testers message a dead line.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    printManualChecklist('meta');
    const printed = logSpy.mock.calls.join('\n');
    logSpy.mockRestore();

    expect(printed).toMatch(/different number/i);
    expect(printed).toMatch(/webhook/i);
  });
});
