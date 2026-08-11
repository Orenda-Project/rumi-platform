/**
 * validators.js — the paste-mistake catches.
 *
 * Every case below is a value that is *well-formed for something else*, which
 * is why none of them is caught by a presence check and all of them cost real
 * debugging time. The assertions care as much about the explanation as the
 * verdict: "invalid key" sends someone back to the same wrong tab, while
 * "that's the anon key, click Reveal for the other one" ends the problem.
 */

const v = require('../../bot/scripts/setup/validators');

/** Builds a Supabase-shaped JWT carrying the given role claim. */
function jwtWithRole(role) {
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJl`;
}

describe('Supabase service key', () => {
  it('accepts the service_role key', () => {
    expect(v.supabaseServiceKey(jwtWithRole('service_role')).ok).toBe(true);
  });

  it('rejects the anon key, and explains what to click instead', () => {
    // The expensive one. Both keys are JWTs starting "eyJ" and sit on the same
    // page; the anon key cannot see past row-level security, so the bot starts
    // cleanly and then behaves as though the database were empty.
    const verdict = v.supabaseServiceKey(jwtWithRole('anon'));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/anon/i);
    expect(verdict.reason).toMatch(/service_role/);
    expect(verdict.reason).toMatch(/reveal/i);
  });

  it('rejects the publishable key of the newer key format', () => {
    const verdict = v.supabaseServiceKey('sb_publishable_abc123');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/sb_secret_/);
  });

  it('accepts the newer secret key format', () => {
    expect(v.supabaseServiceKey('sb_secret_abc123').ok).toBe(true);
  });

  it('notices the project URL pasted into the key field', () => {
    expect(v.supabaseServiceKey('https://abc.supabase.co').reason).toMatch(/project URL/i);
  });

  it('lets an undecodable JWT through for the live check to judge', () => {
    // Guessing at shape must never block a key that might be right — the live
    // probe two lines later is the real authority.
    expect(v.supabaseServiceKey('eyJsomethingunexpected').ok).toBe(true);
  });

  it('strips wrapping quotes rather than making the user paste tidily', () => {
    expect(v.supabaseServiceKey(`"${jwtWithRole('service_role')}"`).value).not.toMatch(/"/);
  });
});

describe('Supabase project URL', () => {
  it('accepts a project URL and drops a trailing slash', () => {
    expect(v.supabaseUrl('https://abcdefgh.supabase.co/')).toEqual({ ok: true, value: 'https://abcdefgh.supabase.co' });
  });

  it('adds the scheme when only the host was pasted', () => {
    expect(v.supabaseUrl('abcdefgh.supabase.co').value).toBe('https://abcdefgh.supabase.co');
  });

  it('catches the dashboard page being pasted instead of the API URL', () => {
    const verdict = v.supabaseUrl('https://supabase.com/dashboard/project/abcdefgh');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/dashboard page/i);
  });

  it('catches a key pasted into the URL field', () => {
    expect(v.supabaseUrl(jwtWithRole('service_role')).reason).toMatch(/looks like a key/i);
  });

  it('allows a local/self-hosted address', () => {
    expect(v.supabaseUrl('http://localhost:54321').ok).toBe(true);
  });

  it('strips /rest/v1 from the end if present (common mistake from Data API page)', () => {
    expect(v.supabaseUrl('https://abcdefgh.supabase.co/rest/v1')).toEqual({ ok: true, value: 'https://abcdefgh.supabase.co' });
    expect(v.supabaseUrl('https://abcdefgh.supabase.co/rest/v1/')).toEqual({ ok: true, value: 'https://abcdefgh.supabase.co' });
  });
});

describe('OpenRouter key', () => {
  it('accepts an OpenRouter key', () => {
    expect(v.openrouterKey('sk-or-v1-0123456789abcdef').ok).toBe(true);
  });

  it.each([
    ['sk-ant-api03-abc', /Anthropic/],
    ['sk-proj-abc123', /OpenAI/],
    ['AIzaSyAbc123', /Google/],
    ['xoxb-123-abc', /Slack/],
    [`EAA${'x'.repeat(120)}`, /Meta|WhatsApp/],
  ])('names the vendor when %s is pasted by mistake', (key, expected) => {
    // Every AI provider hands out an "sk-…" and they are indistinguishable in a
    // terminal, so saying which one this is saves the round trip.
    const verdict = v.openrouterKey(key);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(expected);
  });

  it('spots a truncated paste', () => {
    expect(v.openrouterKey('sk-or-v1-abc').reason).toMatch(/truncated/i);
  });
});

describe('Redis address', () => {
  it('accepts redis:// and rediss://', () => {
    expect(v.redisUrl('redis://localhost:6379').ok).toBe(true);
    expect(v.redisUrl('rediss://default:pw@host.upstash.io:6379').ok).toBe(true);
  });

  it('wraps a bare host:port, which is what most dashboards show', () => {
    expect(v.redisUrl('my-redis.internal:6379').value).toBe('redis://my-redis.internal:6379');
  });

  it('explains the Upstash trap of copying the https endpoint', () => {
    const verdict = v.redisUrl('https://eager-cat-12345.upstash.io');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/redis:\/\//);
  });
});

describe('Meta credentials', () => {
  it('accepts a full-length access token', () => {
    expect(v.whatsappToken(`EAA${'x'.repeat(200)}`).ok).toBe(true);
  });

  it('rejects a token that does not start with EAA, naming what was pasted', () => {
    expect(v.whatsappToken('sk-proj-abc').reason).toMatch(/OpenAI/);
    expect(v.whatsappToken('random-string').reason).toMatch(/EAA/);
  });

  it('rejects a truncated token, with the length it saw', () => {
    expect(v.whatsappToken('EAAshort').reason).toMatch(/8 characters/);
  });

  it('catches a phone number in the phone number ID field', () => {
    // Meta's #1 setup trap: the field wants their internal 15-17 digit id, and
    // Graph's answer to a phone number is "Object with ID does not exist",
    // which names neither the field nor the mistake.
    const verdict = v.phoneNumberId('15556422442');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/looks like the phone number/i);
    expect(verdict.reason).toMatch(/From/);
  });

  it('accepts a real phone number ID and tolerates spacing', () => {
    expect(v.phoneNumberId(' 779418925277868 ').ok).toBe(true);
  });

  it('rejects a phone number ID with a plus or letters', () => {
    expect(v.phoneNumberId('+923001234567').reason).toMatch(/digits only/i);
  });

  it('requires the webhook password to be usable in a URL', () => {
    expect(v.webhookVerifyToken('has spaces here').reason).toMatch(/no spaces/i);
    expect(v.webhookVerifyToken('short').reason).toMatch(/8 characters/);
    expect(v.webhookVerifyToken('a-good-long-password').ok).toBe(true);
  });
});

describe('validatorFor', () => {
  it('gives every channel-required var a real shape check, not just a presence check', () => {
    const { CHANNEL_REQUIRED_VARS } = require('../../bot/shared/config/feature-availability');
    for (const key of CHANNEL_REQUIRED_VARS.meta) {
      expect(v.BY_ENV_VAR[key]).toBeDefined();
    }
  });

  it('falls back to a presence check for a var it has no opinion about', () => {
    const check = v.validatorFor('SOME_FUTURE_KEY');
    expect(check('').ok).toBe(false);
    expect(check('anything').ok).toBe(true);
  });
});
