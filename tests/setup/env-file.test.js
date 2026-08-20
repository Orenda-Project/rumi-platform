/**
 * env-file.js — the .env patcher `rumi setup` and `rumi graduate` share.
 * Must never regenerate an existing file, only patch the keys it's given.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readEnvFile, writeEnvVars } = require('../../bot/scripts/setup/env-file');

function tempEnvPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-env-test-')), '.env');
}

describe('readEnvFile', () => {
  it('returns {} for a file that does not exist', () => {
    expect(readEnvFile(path.join(os.tmpdir(), 'definitely-not-there.env'))).toEqual({});
  });

  it('parses KEY=VALUE lines and skips comments/blank lines', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, '# a comment\n\nFOO=bar\nBAZ=qux\n');
    expect(readEnvFile(p)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });
});

describe('writeEnvVars', () => {
  it('creates the file from a template when it does not exist yet', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-env-test-'));
    const templatePath = path.join(dir, '.env.template');
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(templatePath, '# header comment\nEXISTING=CHANGEME\n');

    writeEnvVars(envPath, { NEW_KEY: 'value1' }, { fromTemplatePath: templatePath });

    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).toContain('# header comment');
    expect(content).toContain('EXISTING=CHANGEME');
    expect(content).toContain('NEW_KEY=value1');
  });

  it('replaces an existing key IN PLACE, preserving every other line verbatim', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, '# keep me\nSUPABASE_URL=CHANGEME\nOTHER=untouched\n\n# trailing comment\n');

    writeEnvVars(p, { SUPABASE_URL: 'https://real.supabase.co' });

    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    expect(lines[0]).toBe('# keep me');
    expect(lines[1]).toBe('SUPABASE_URL=https://real.supabase.co');
    expect(lines[2]).toBe('OTHER=untouched');
    expect(lines).toContain('# trailing comment');
  });

  it('appends a key that has no existing line', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, 'FOO=bar\n');
    writeEnvVars(p, { CHANNEL_DRIVER: 'meta' });
    expect(readEnvFile(p)).toEqual({ FOO: 'bar', CHANNEL_DRIVER: 'meta' });
  });

  it('patches multiple keys in one call without disturbing unrelated ones', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, 'A=1\nB=2\nC=3\n');
    writeEnvVars(p, { A: '10', C: '30' });
    expect(readEnvFile(p)).toEqual({ A: '10', B: '2', C: '30' });
  });

  it('is idempotent — writing the same values twice produces the same file', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, 'A=1\n');
    writeEnvVars(p, { B: '2' });
    const first = fs.readFileSync(p, 'utf-8');
    writeEnvVars(p, { B: '2' });
    const second = fs.readFileSync(p, 'utf-8');
    expect(second).toBe(first);
  });

  it('collapses a hand-edited DUPLICATE key to a single, correctly-patched line — never leaves a stale duplicate as the effective (dotenv last-wins) value', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, 'CHANNEL_DRIVER=baileys\nFOO=bar\nCHANNEL_DRIVER=meta\n');

    writeEnvVars(p, { CHANNEL_DRIVER: 'PATCHED' });

    const lines = fs.readFileSync(p, 'utf-8').trim().split('\n');
    const channelDriverLines = lines.filter((l) => l.startsWith('CHANNEL_DRIVER='));
    expect(channelDriverLines).toEqual(['CHANNEL_DRIVER=PATCHED']);
    expect(readEnvFile(p).CHANNEL_DRIVER).toBe('PATCHED');
  });

  it('uncomments and patches a commented-out placeholder IN PLACE, rather than appending a second live copy at the end', () => {
    // Real bug this fixes: a user (or a fresh .env.template) commented out
    // `# SLACK_SIGNING_SECRET=...` in its intended spot, right after the
    // WhatsApp block. Running the wizard's Slack step patched the value by
    // APPENDING SLACK_SIGNING_SECRET=<real value> at the very end of the
    // file instead — leaving the original commented placeholder sitting
    // above, stale and confusing, while the real, active line lived
    // hundreds of lines away in the Optional section.
    const p = tempEnvPath();
    fs.writeFileSync(p, '# keep me\n# SLACK_SIGNING_SECRET=CHANGEME\nOTHER=untouched\n');

    writeEnvVars(p, { SLACK_SIGNING_SECRET: 'real-secret' });

    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    expect(lines[0]).toBe('# keep me');
    expect(lines[1]).toBe('SLACK_SIGNING_SECRET=real-secret'); // uncommented, in place
    expect(lines[2]).toBe('OTHER=untouched');
    expect(lines.filter((l) => l.includes('SLACK_SIGNING_SECRET'))).toHaveLength(1); // no duplicate at the end
  });

  it('prefers an ACTIVE line over a commented-out one when both exist for the same key', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, '# FOO=commented-stale\nFOO=CHANGEME\n');

    writeEnvVars(p, { FOO: 'real-value' });

    const lines = fs.readFileSync(p, 'utf-8').trim().split('\n');
    expect(lines).toEqual(['# FOO=commented-stale', 'FOO=real-value']);
  });

  it('does not mistake an ordinary prose comment for a commented-out key', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, '# note: this only applies if CHANNEL_DRIVER=meta\nFOO=bar\n');

    writeEnvVars(p, { CHANNEL_DRIVER: 'meta' });

    const lines = fs.readFileSync(p, 'utf-8').trim().split('\n');
    // The prose comment is untouched; CHANNEL_DRIVER is appended fresh, since
    // there was no real commented-out placeholder for it to uncomment.
    expect(lines[0]).toBe('# note: this only applies if CHANNEL_DRIVER=meta');
    expect(lines).toContain('CHANNEL_DRIVER=meta');
  });

  it('normalizes CRLF line endings to LF on write (no mixed-EOL file)', () => {
    const p = tempEnvPath();
    fs.writeFileSync(p, 'FOO=bar\r\nBAZ=CHANGEME\r\n');

    writeEnvVars(p, { BAZ: 'real-value' });

    const raw = fs.readFileSync(p, 'utf-8');
    expect(raw).not.toContain('\r');
    expect(readEnvFile(p)).toEqual({ FOO: 'bar', BAZ: 'real-value' });
  });
});
