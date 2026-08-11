/**
 * status.js — `rumi status`.
 *
 * The two facts this command exists to report are the two a credentials
 * checklist cannot give you: whether a Rumi process is actually up, and which
 * WhatsApp account it answers as. Both are read from files on disk, so both are
 * testable without starting anything.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const status = require('../../bot/scripts/setup/status');
const summary = require('../../bot/scripts/setup/summary');

/** A CHANNEL_STATE_DIR laid out the way baileys-connection writes it. */
function stateDir(contents = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-status-test-'));
  const dir = path.join(root, 'baileys');
  fs.mkdirSync(dir, { recursive: true });
  if (contents.lock) fs.writeFileSync(path.join(dir, '.instance.lock'), JSON.stringify(contents.lock));
  if (contents.creds) fs.writeFileSync(path.join(dir, 'creds.json'), contents.creds);
  return root;
}

describe('processState', () => {
  it('reports running when the lock is held by a live process', () => {
    // The lock exists to stop two processes sharing one WhatsApp session, but
    // it happens to be the only honest local answer to "is the bot up" — so
    // status reads it rather than inventing a second pid file that could
    // disagree with it.
    const dir = stateDir({ lock: { pid: process.pid, since: '2026-08-06T12:00:00.000Z' } });
    const state = status.processState({ CHANNEL_STATE_DIR: dir });

    expect(state).toMatchObject({ running: true, pid: process.pid });
    expect(status.renderProcessLine(state)).toMatch(/running/);
  });

  it('calls a lock held by a dead pid stale, and says it is harmless', () => {
    // A crashed process leaves its lock behind. Reporting that as "running"
    // would send someone hunting for a process that is not there.
    //
    // The pid comes from a process that has already exited — spawnSync returns
    // only once its child is done — which is a genuinely dead pid rather than a
    // number guessed to be unused.
    const finished = require('child_process').spawnSync(process.execPath, ['-e', '']);
    expect(status.pidIsAlive(finished.pid)).toBe(false);

    const dir = stateDir({ lock: { pid: finished.pid, since: '2026-08-06T12:00:00.000Z' } });
    const state = status.processState({ CHANNEL_STATE_DIR: dir });

    expect(state).toMatchObject({ running: false, stale: true, pid: finished.pid });
    expect(status.renderProcessLine(state)).toMatch(/stale lock, harmless/);
  });

  it('reports not running when there is no lock at all, and says how to start', () => {
    const state = status.processState({ CHANNEL_STATE_DIR: stateDir() });
    expect(state.running).toBe(false);
    expect(status.renderProcessLine(state)).toMatch(/rumi start/);
  });
});

describe('sandboxIdentity', () => {
  it('reads which number is linked from the stored session, without connecting', () => {
    const dir = stateDir({ creds: JSON.stringify({ me: { id: '923001234567:12@s.whatsapp.net', name: 'Rumi' } }) });
    expect(status.sandboxIdentity({ CHANNEL_STATE_DIR: dir })).toMatchObject({
      paired: true, number: '923001234567', name: 'Rumi',
    });
  });

  it('reports not paired when no session has been stored yet', () => {
    expect(status.sandboxIdentity({ CHANNEL_STATE_DIR: stateDir() })).toEqual({ paired: false });
  });

  it('reports not paired rather than throwing on a corrupt session file', () => {
    const dir = stateDir({ creds: 'not json at all' });
    expect(status.sandboxIdentity({ CHANNEL_STATE_DIR: dir })).toEqual({ paired: false });
  });
});

describe('the readiness view', () => {
  const doctorResult = (overrides = {}) => ({
    ok: true,
    channel: 'baileys',
    missingRequired: [],
    probeResults: [
      { name: 'Supabase', status: 'pass', detail: 'HTTP 200' },
      { name: 'OpenRouter (LLM)', status: 'pass', detail: 'HTTP 200 · $9.69 credit remaining' },
      { name: 'Redis', status: 'pass', detail: 'PONG' },
      { name: 'WhatsApp Cloud API', status: 'skip', detail: 'not configured' },
    ],
    featureResults: [
      { name: 'Voice notes (speech-to-text, Soniox)', status: 'on', detail: 'keys present', requiredKeys: ['SONIOX_API_KEY'], missingKeys: [] },
      { name: 'Lesson-plan generation (Gamma)', status: 'off', detail: 'set: GAMMA_API_KEY', requiredKeys: ['GAMMA_API_KEY'], missingKeys: ['GAMMA_API_KEY'] },
    ],
    ...overrides,
  });

  it('names services by what they do, not by the vendor that provides them', () => {
    const rendered = summary.renderReadiness(doctorResult(), { number: '923001234567' });
    expect(rendered).toContain('Memory (database)');
    expect(rendered).toContain('Thinking (AI)');
    expect(rendered).not.toContain('Supabase');
  });

  it('keeps a credit balance, which is worth knowing, and drops "HTTP 200", which is not', () => {
    const rendered = summary.renderReadiness(doctorResult(), {});
    expect(rendered).toContain('$9.69 credit remaining');
    expect(rendered).not.toContain('HTTP 200');
  });

  it('hides a skipped probe instead of showing a service nobody configured', () => {
    const rendered = summary.renderReadiness(doctorResult(), { number: '923001234567' });
    expect(rendered).not.toContain('not configured');
  });

  it('shows which key would switch an off feature on', () => {
    expect(summary.renderReadiness(doctorResult(), {})).toContain('GAMMA_API_KEY');
  });

  it('states plainly when the sandbox channel has not been linked yet', () => {
    const rendered = summary.renderReadiness(doctorResult(), { number: null });
    expect(rendered).toMatch(/not linked yet/);
    expect(rendered).toMatch(/rumi pair/);
  });

  it('reports a failing service with the reason attached', () => {
    const failing = doctorResult({
      ok: false,
      probeResults: [{ name: 'Redis', status: 'fail', detail: 'connect ECONNREFUSED 127.0.0.1:6379' }],
    });
    const rendered = summary.renderReadiness(failing, {});
    expect(rendered).toMatch(/not working/);
    expect(rendered).toContain('ECONNREFUSED');
  });
});

describe('what to do next', () => {
  it('leads with the one command that starts Rumi', () => {
    expect(summary.renderNextSteps({ channel: 'baileys', number: '923001234567' }))
      .toContain('rumi start');
  });

  it('tells a sandbox user which number to message', () => {
    expect(summary.renderNextSteps({ channel: 'baileys', number: '923001234567' }))
      .toContain('+923001234567');
  });

  it('does not offer `rumi pair` on Meta, where there is nothing to pair', () => {
    const rendered = summary.renderNextSteps({ channel: 'meta' });
    expect(rendered).not.toContain('rumi pair');
    expect(rendered).toMatch(/webhook/i);
  });

  it('suggests things to try that actually exist as commands', () => {
    const rendered = summary.renderNextSteps({ channel: 'baileys', number: '1' });
    expect(rendered).toContain('/menu');
    expect(rendered).toContain('/reading test');
  });
});

describe('a pairing that succeeded is never reported as "not linked"', () => {
  // Seen live: a fresh clone paired successfully ("✔ Linked"), and the closing
  // screen three lines later said "not linked yet — run `rumi pair`". The link
  // was fine; only the *number* was unknown, because of a timing race in how it
  // was read. Rendering keyed on the number rather than on the link turned a
  // cosmetic gap into a flat contradiction.
  const baileysDoctor = {
    ok: true,
    channel: 'baileys',
    missingRequired: [],
    probeResults: [{ name: 'Supabase', status: 'pass', detail: 'HTTP 200' }],
    featureResults: [],
  };

  it('reports linked, even when the number could not be read', () => {
    const rendered = summary.renderReadiness(baileysDoctor, { linked: true, number: null });
    expect(rendered).toMatch(/linked/);
    expect(rendered).not.toMatch(/not linked yet/);
  });

  it('names the number when it is known', () => {
    expect(summary.renderReadiness(baileysDoctor, { linked: true, number: '923001234567' }))
      .toContain('+923001234567');
  });

  it('still says "not linked yet" when the user declined to pair', () => {
    expect(summary.renderReadiness(baileysDoctor, { linked: false, number: null }))
      .toMatch(/not linked yet/);
  });

  it('falls back to inferring from the number for callers that pass no link state', () => {
    // `rumi status` has no pairing outcome to report — only what is on disk.
    expect(summary.renderReadiness(baileysDoctor, { number: '923001234567' })).toMatch(/linked/);
    expect(summary.renderReadiness(baileysDoctor, {})).toMatch(/not linked yet/);
  });
});
