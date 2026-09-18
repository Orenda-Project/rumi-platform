/**
 * The console's security boundary.
 *
 * This is the suite that matters most in the console: everything else being
 * wrong makes a page ugly, this being wrong puts a live API key on a screen.
 * Classification is default-deny, so the tests are written to catch the two
 * ways that can rot — a new secret quietly classified public, and a short
 * value "masked" into near-legibility.
 */

const {
  classify, describeVar, maskSecret, maskConnectionUrl, maskPhone,
  PUBLIC_EXACT, NEVER_REVEALABLE, REVEALABLE, SECRET_SHAPED, MIN_LENGTH_FOR_HINT,
} = require('../../bot/console/redaction');

describe('classification is default-deny', () => {
  it('treats a variable it has never heard of as an unrevealable secret', () => {
    // The whole point: a provider key added to .env.template next month is
    // protected before anyone remembers to come back and list it here.
    expect(classify('SOME_NEW_PARTNER_CREDENTIAL')).toEqual({
      classification: 'secret', revealable: false,
    });
  });

  it('never lets a secret-shaped name be public, even if it is on the public list', () => {
    for (const name of PUBLIC_EXACT) {
      if (SECRET_SHAPED.test(name)) {
        expect(classify(name).classification).toBe('secret');
      }
    }
  });

  it('classifies connection strings as secret — they carry an inline password', () => {
    for (const name of ['REDIS_URL', 'DATABASE_URL', 'BRIEF_DATABASE_URL']) {
      expect(classify(name)).toEqual({ classification: 'secret', revealable: false });
    }
  });

  it('keeps settings and identifiers public so they can be read and edited plainly', () => {
    for (const name of ['LLM_MODEL', 'CHANNEL_DRIVER', 'PHONE_NUMBER_ID', 'SUPABASE_URL']) {
      expect(classify(name).classification).toBe('public');
    }
  });

  it('grows with the families that grow, without an edit per language', () => {
    expect(classify('ELEVENLABS_VOICE_ID_TA_IN').classification).toBe('public');
    expect(classify('REGISTRATION_FLOW_ID').classification).toBe('public');
  });
});

describe('the never-revealable set', () => {
  it.each([...NEVER_REVEALABLE])('never reveals %s', (name) => {
    expect(classify(name).revealable).toBe(false);
  });

  it('includes the service-role key, which bypasses row-level security on every table', () => {
    expect(NEVER_REVEALABLE.has('SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
  });

  it('includes the session secret, since revealing it forges a console session', () => {
    expect(NEVER_REVEALABLE.has('SESSION_SECRET')).toBe(true);
  });

  it('includes the Flow private key, which decrypts attendance and student data', () => {
    expect(NEVER_REVEALABLE.has('FLOW_PRIVATE_KEY')).toBe(true);
    expect(NEVER_REVEALABLE.has('FLOW_PRIVATE_KEY_B64')).toBe(true);
  });

  it('does not overlap the revealable set', () => {
    for (const name of REVEALABLE) expect(NEVER_REVEALABLE.has(name)).toBe(false);
  });
});

describe('masking', () => {
  it('shows enough of a long key to recognise it and not enough to use it', () => {
    const key = 'sk-or-v1-0123456789abcdef0123456789abcdef';
    const masked = maskSecret(key);
    expect(masked).toBe('sk-or…cdef');
    expect(masked).not.toContain('0123456789');
  });

  it('refuses to hint at a short value at all', () => {
    // Nine of twelve characters is not redaction, it is a puzzle with one move left.
    expect(maskSecret('short-value')).toBeNull();
    expect(maskSecret('x'.repeat(MIN_LENGTH_FOR_HINT - 1))).toBeNull();
    expect(maskSecret('x'.repeat(MIN_LENGTH_FOR_HINT))).not.toBeNull();
  });

  it('strips the password out of a connection string but keeps the host readable', () => {
    const url = maskConnectionUrl('redis://default:hunter2secret@fly.example.net:6379');
    expect(url).toBe('redis://fly.example.net:6379');
    expect(url).not.toContain('hunter2secret');
  });

  it('reduces a phone number to a country code and two digits', () => {
    // Four trailing digits plus a country code is often enough to re-identify
    // one teacher within one school.
    expect(maskPhone('+92 300 1234567')).toBe('+92•••67');
    expect(maskPhone('923001234567')).toBe('+92•••67');
  });
});

describe('describeVar — the only thing allowed to put a value on the wire', () => {
  it('never returns a full secret', () => {
    const row = describeVar('OPENROUTER_API_KEY', 'sk-or-v1-0123456789abcdef0123456789');
    expect(row.display).not.toContain('0123456789abcdef');
    expect(row.classification).toBe('secret');
    expect(row.revealable).toBe(true);
  });

  it('returns a public value in full, because there is nothing to hide', () => {
    const row = describeVar('LLM_MODEL', 'openai/gpt-4o');
    expect(row.display).toBe('openai/gpt-4o');
  });

  it('reports an unset variable as unset and not revealable', () => {
    const row = describeVar('GAMMA_API_KEY', '');
    expect(row.set).toBe(false);
    expect(row.display).toBeNull();
    expect(row.revealable).toBe(false);
  });

  it('honours the placeholder-aware presence test so template stubs do not count as configured', () => {
    const isSet = require('../../bot/shared/config/feature-availability').isSet;
    const row = describeVar('SUPABASE_URL', 'https://your-project.supabase.co', { isSet });
    expect(row.set).toBe(false);
  });

  it('never marks a never-revealable variable revealable, even when set', () => {
    const row = describeVar('SUPABASE_SERVICE_ROLE_KEY', 'eyJ' + 'a'.repeat(200));
    expect(row.set).toBe(true);
    expect(row.revealable).toBe(false);
    expect(row.display).not.toContain('aaaaaaaaaa');
  });
});

describe('the .env backups the console writes can never be committed', () => {
  // runtime.js copies .env to `.env.bak.<ISO timestamp>` before its first write.
  // Each copy holds every credential the deployment has, and a bare `.env` rule
  // in .gitignore does NOT match `.env.bak.2026-01-01T00-00-00-000Z`.
  const { execFileSync } = require('child_process');
  const path = require('path');

  it('is covered by a .gitignore rule', () => {
    const root = path.join(__dirname, '../..');
    const sample = '.env.bak.2026-01-01T00-00-00-000Z';
    let ignored = true;
    try {
      execFileSync('git', ['check-ignore', '-q', sample], { cwd: root });
    } catch {
      ignored = false;
    }
    expect(ignored).toBe(true);
  });
});
