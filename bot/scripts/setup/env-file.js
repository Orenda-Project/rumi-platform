/**
 * .env file patcher — read/update specific keys in place, preserving every
 * other line (comments, ordering, unrelated vars) verbatim. Both `rumi setup`
 * (interactive-setup.js) and `rumi graduate` (graduate.js) need this: neither
 * should ever regenerate a user's .env from the template, only patch the
 * keys it's actually setting.
 *
 * @module env-file
 */

const fs = require('fs');

// Read a file as LF-normalized lines regardless of its original line endings
// (CRLF or LF) — writeEnvVars always writes LF, so mixing would otherwise
// leave a stray \r on every untouched line of a CRLF-authored .env.
function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf-8').split(/\r\n|\n/);
}

// Returns the KEY for a KEY=VALUE line, or null for a comment/blank/malformed line.
function keyOf(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return null;
  return trimmed.slice(0, eq).trim();
}

// Returns the KEY for a COMMENTED-OUT `# KEY=VALUE` line specifically (e.g.
// `.env.template`'s own placeholders, or a var a user temporarily disabled by
// prefixing it with `#`) — distinct from an ordinary prose comment line, which
// has no `=` at all right after its own leading `#`. Used only to find where
// to UNCOMMENT + patch a key that has no active line, instead of appending a
// second, live copy at the end of the file while the commented placeholder
// sits above it, stale and confusing to read.
function commentedKeyOf(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) return null;
  const withoutHash = trimmed.slice(1).trim();
  const eq = withoutHash.indexOf('=');
  if (eq === -1) return null;
  const key = withoutHash.slice(0, eq).trim();
  // A real KEY is a plain identifier (letters/digits/underscore) — this is
  // what actually distinguishes `# SLACK_BOT_TOKEN=xoxb-...` from prose like
  // `# note: this only applies if CHANNEL_DRIVER=meta`.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : null;
}

/**
 * @param {string} envPath
 * @returns {Record<string,string>} parsed KEY=VALUE pairs (best-effort; lines
 *   that aren't KEY=VALUE, comments, and blank lines are ignored). A key that
 *   appears more than once resolves to its LAST occurrence, matching dotenv's
 *   own parsing behavior.
 */
function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (const line of readLines(envPath)) {
    const key = keyOf(line);
    if (key === null) continue;
    const trimmed = line.trim();
    result[key] = trimmed.slice(trimmed.indexOf('=') + 1).trim();
  }
  return result;
}

/**
 * Patches the given KEY=VALUE pairs into envPath in place: an existing line
 * for a key is replaced (preserving its position); a key with no existing
 * line is appended at the end. Every other line is left alone (byte-for-byte,
 * modulo EOL normalization to LF — see readLines). Creates the file (from
 * `fromTemplatePath`, if given and envPath doesn't exist yet) rather than
 * ever regenerating an existing one.
 *
 * If a key being patched appears MORE THAN ONCE in the file (a hand-edited
 * duplicate, a merge artifact, ...), every occurrence but the last is
 * dropped and the last is replaced — dotenv resolves duplicates
 * last-occurrence-wins, so patching only the first would silently leave the
 * value actually loaded at runtime untouched.
 *
 * @param {string} envPath
 * @param {Record<string,string>} updates
 * @param {{ fromTemplatePath?: string }} [opts]
 */
function writeEnvVars(envPath, updates, opts = {}) {
  if (!fs.existsSync(envPath)) {
    if (opts.fromTemplatePath && fs.existsSync(opts.fromTemplatePath)) {
      fs.copyFileSync(opts.fromTemplatePath, envPath);
    } else {
      fs.writeFileSync(envPath, '');
    }
  }

  const lines = readLines(envPath);
  const remaining = new Set(Object.keys(updates));

  // An ACTIVE line always wins over a commented-out one for a given key — if
  // both exist (e.g. a stale disabled copy above a real one below), the
  // active line is where dotenv's value actually comes from, so that is the
  // one patched; the commented line is left alone as ordinary text.
  const lastIndexForKey = new Map();
  const lastCommentedIndexForKey = new Map();
  lines.forEach((line, i) => {
    const key = keyOf(line);
    if (key !== null && remaining.has(key)) { lastIndexForKey.set(key, i); return; }
    const commentedKey = commentedKeyOf(line);
    if (commentedKey !== null && remaining.has(commentedKey)) lastCommentedIndexForKey.set(commentedKey, i);
  });

  const patched = [];
  lines.forEach((line, i) => {
    const key = keyOf(line);
    if (key !== null && remaining.has(key)) {
      if (i !== lastIndexForKey.get(key)) return; // drop an earlier duplicate of this key
      patched.push(`${key}=${updates[key]}`);
      remaining.delete(key);
      return;
    }

    // No active line for this key anywhere in the file, but THIS is its
    // commented-out placeholder — uncomment it in place instead of appending
    // a second, live copy at the end while the disabled one sits above it.
    const commentedKey = commentedKeyOf(line);
    if (
      commentedKey !== null && remaining.has(commentedKey)
      && !lastIndexForKey.has(commentedKey) && i === lastCommentedIndexForKey.get(commentedKey)
    ) {
      patched.push(`${commentedKey}=${updates[commentedKey]}`);
      remaining.delete(commentedKey);
      return;
    }

    patched.push(line);
  });

  for (const key of remaining) {
    patched.push(`${key}=${updates[key]}`);
  }

  // Drop a single trailing blank line this loop may have introduced, then
  // ensure the file still ends with exactly one newline.
  while (patched.length > 1 && patched[patched.length - 1] === '' && patched[patched.length - 2] === '') {
    patched.pop();
  }

  fs.writeFileSync(envPath, `${patched.join('\n').replace(/\n+$/, '')}\n`);
}

module.exports = { readEnvFile, writeEnvVars };
