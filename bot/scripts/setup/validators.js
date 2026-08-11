/**
 * validators.js — field-shape checks for every value `rumi setup` and
 * `rumi graduate` collect.
 *
 * These exist because the expensive setup failures are not "I typed it wrong",
 * they are "I pasted the wrong *thing*" — a value that is perfectly well-formed
 * for what it actually is, so nothing complains until a feature dies hours
 * later with a 401 and no hint about which of eight keys is at fault. The
 * classics, all caught here:
 *
 *   - Supabase's **anon** key instead of the **service_role** key. Both are
 *     JWTs beginning `eyJ`, indistinguishable by eye — but the anon key cannot
 *     see past row-level security, so the bot starts fine and then behaves as
 *     if the database were empty. Decoding the token's `role` claim settles it
 *     in the wizard instead of in production.
 *   - A phone *number* in `PHONE_NUMBER_ID`, which wants Meta's internal id.
 *     Graph answers "Object with ID does not exist", naming neither field.
 *   - Any other vendor's key in `OPENROUTER_API_KEY` — every AI provider hands
 *     out an `sk-…`, and they all look alike in a terminal.
 *
 * Each validator returns `{ ok, reason?, value? }`. Returning a `value` lets a
 * validator clean input (strip a trailing slash, quotes, a `psql` prefix)
 * rather than making the user paste tidily.
 *
 * @module validators
 */

/** @typedef {{ok: boolean, reason?: string, value?: string}} Verdict */

const ok = (value) => ({ ok: true, value });
const no = (reason) => ({ ok: false, reason });

/** Strips wrapping quotes and stray whitespace — the usual copy-paste debris. */
function clean(input) {
  return String(input || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

/** Requires a non-empty value, for fields with no other shape to check. */
function required(label) {
  return (input) => {
    const value = clean(input);
    return value ? ok(value) : no(`${label} can't be empty.`);
  };
}

/** Recognises the well-known key prefixes, so we can say *what* was pasted. */
const FOREIGN_KEY_PREFIXES = [
  [/^sk-ant-/, 'an Anthropic API key'],
  [/^sk-proj-/, 'an OpenAI project key'],
  [/^sk-svcacct-/, 'an OpenAI service-account key'],
  [/^AIza/, 'a Google API key'],
  [/^xox[bpa]-/, 'a Slack token'],
  [/^gh[pousr]_/, 'a GitHub token'],
  [/^EAA/, 'a Meta/WhatsApp access token'],
  [/^eyJ/, 'a JWT — probably a Supabase key'],
];

function identifyForeignKey(value) {
  for (const [pattern, description] of FOREIGN_KEY_PREFIXES) {
    if (pattern.test(value)) return description;
  }
  return null;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

/** @returns {Verdict} */
function supabaseUrl(input) {
  let value = clean(input).replace(/\/+$/, '');
  
  // Strip /rest/v1 if present (common mistake when copying from Data API page)
  value = value.replace(/\/rest\/v1\/?$/, '');
  
  if (!value) return no("The API URL can't be empty.");
  if (/^eyJ|^sb_/.test(value)) return no('That looks like a key, not a URL. The API URL looks like https://abcdefgh.supabase.co');
  if (!/^https?:\/\//.test(value)) {
    return /\.supabase\.(co|in)$/.test(value)
      ? ok(`https://${value}`)
      : no('That should start with https:// — copy the "API URL" field (without /rest/v1).');
  }
  if (/supabase\.com\/dashboard/.test(value)) {
    return no('That is the dashboard page in your browser, not the API URL. The one you want is under Project Settings → Data API, and ends in .supabase.co (without /rest/v1)');
  }
  if (!/\.supabase\.(co|in)$/.test(value) && !/localhost|127\.0\.0\.1/.test(value)) {
    return no('That does not look like a Supabase API URL (expected something ending in .supabase.co).');
  }
  return ok(value);
}

/**
 * A Supabase JWT carries its role in the payload. Returns the role string, or
 * null when the token isn't a decodable JWT (the newer `sb_secret_…` keys
 * aren't, and that's fine — they're unambiguous by prefix).
 */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** @returns {Verdict} */
function supabaseServiceKey(input) {
  const value = clean(input);
  if (!value) return no("The service key can't be empty.");
  if (/^https?:\/\//.test(value)) return no('That is the project URL, not the key.');
  if (value.startsWith('sb_publishable_')) {
    return no('That is the publishable key, which cannot read your data. You need the secret key (sb_secret_…) from the same page.');
  }
  if (value.startsWith('sb_secret_')) return ok(value);

  const role = jwtRole(value);
  if (role === 'anon') {
    return no('That is the anon (public) key. Rumi needs the service_role key — same page, but you have to click "Reveal" to see it. The anon key cannot read your tables, so the bot would run but find no data.');
  }
  if (role === 'service_role') return ok(value);
  if (value.startsWith('eyJ')) return ok(value); // a JWT we couldn't decode — let the live check judge it
  return no('That does not look like a Supabase key (expected one starting with eyJ or sb_secret_).');
}

// ── OpenRouter ───────────────────────────────────────────────────────────────

/** @returns {Verdict} */
function openrouterKey(input) {
  const value = clean(input);
  if (!value) return no("The key can't be empty.");
  if (value.startsWith('sk-or-')) {
    return value.length < 20 ? no('That key looks truncated — copy the whole thing.') : ok(value);
  }
  const foreign = identifyForeignKey(value);
  if (foreign) {
    return no(`That is ${foreign}, not an OpenRouter key. OpenRouter keys start with "sk-or-" and come from openrouter.ai/keys.`);
  }
  return no('OpenRouter keys start with "sk-or-". Create one at openrouter.ai/keys.');
}

// ── Redis ────────────────────────────────────────────────────────────────────

/** @returns {Verdict} */
function redisUrl(input) {
  const value = clean(input);
  if (!value) return no("The Redis address can't be empty.");
  if (/^rediss?:\/\//.test(value)) return ok(value);
  // A bare host:port is what most dashboards show. Wrapping it is what the
  // user meant, and guessing wrong here is harmless — the live check follows.
  if (/^[\w.-]+:\d+$/.test(value)) return ok(`redis://${value}`);
  if (/^https?:\/\//.test(value)) {
    return no('Redis addresses start with redis:// (or rediss:// for TLS), not http://. Upstash shows both — copy the one labelled "Redis" or "TCP".');
  }
  return no('That should look like redis://host:6379 — or redis://default:password@host:6379 for a hosted one.');
}

// ── Meta / WhatsApp Cloud API ────────────────────────────────────────────────

/** @returns {Verdict} */
function whatsappToken(input) {
  const value = clean(input);
  if (!value) return no("The access token can't be empty.");
  if (!value.startsWith('EAA')) {
    const foreign = identifyForeignKey(value);
    return no(foreign
      ? `That is ${foreign}, not a Meta access token. Meta's start with "EAA".`
      : 'Meta access tokens start with "EAA" — copy it from API Setup → "Generate access token".');
  }
  if (value.length < 100) return no(`That token looks truncated (${value.length} characters; they are usually 200+). Copy the whole thing.`);
  return ok(value);
}

/** @returns {Verdict} */
function phoneNumberId(input) {
  const value = clean(input).replace(/[\s-]/g, '');
  if (!value) return no("The phone number ID can't be empty.");
  if (value.startsWith('+') || /[^\d]/.test(value)) {
    return no('This field wants digits only — and not the phone number itself. Look for the line labelled "Phone number ID" directly under the "From" dropdown in API Setup.');
  }
  if (value.length <= 12) {
    return no(`That looks like the phone number (${value.length} digits). Meta's phone number ID is a separate 15-17 digit value shown right below the "From" dropdown — the phone number itself is never used in configuration.`);
  }
  if (value.length > 20) return no('That is longer than any phone number ID (expected 15-17 digits) — check you copied only the ID.');
  return ok(value);
}

/** @returns {Verdict} */
function wabaId(input) {
  const value = clean(input).replace(/[\s-]/g, '');
  if (!value) return no("The account ID can't be empty.");
  if (/[^\d]/.test(value)) return no('The WhatsApp Business Account ID is digits only — find it in API Setup, or in Business Settings → WhatsApp Accounts.');
  if (value.length < 10) return no('That looks too short for a WhatsApp Business Account ID (expected 15-16 digits).');
  return ok(value);
}

/** @returns {Verdict} */
function webhookVerifyToken(input) {
  const value = clean(input);
  if (!value) return no("This can't be empty — it's a password you invent, and you'll paste the same one into Meta's webhook form.");
  if (/\s/.test(value)) return no('No spaces — Meta sends this back verbatim in a URL, so spaces break the comparison.');
  if (value.length < 8) return no('Make it at least 8 characters. Anyone who guesses it can register a fake webhook.');
  return ok(value);
}

/** Per-env-var validator lookup, so `graduate` and `setup` can't disagree. */
const BY_ENV_VAR = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
  OPENROUTER_API_KEY: openrouterKey,
  REDIS_URL: redisUrl,
  WHATSAPP_TOKEN: whatsappToken,
  PHONE_NUMBER_ID: phoneNumberId,
  WABA_ID: wabaId,
  WEBHOOK_VERIFY_TOKEN: webhookVerifyToken,
};

/** @returns {(input: string) => Verdict} a validator for `envVar`, or a presence check. */
function validatorFor(envVar) {
  return BY_ENV_VAR[envVar] || required(envVar);
}

module.exports = {
  clean, required, jwtRole, identifyForeignKey,
  supabaseUrl, supabaseServiceKey, openrouterKey, redisUrl,
  whatsappToken, phoneNumberId, wabaId, webhookVerifyToken,
  validatorFor, BY_ENV_VAR,
};
