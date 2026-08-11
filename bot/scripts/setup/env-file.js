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

  const lastIndexForKey = new Map();
  lines.forEach((line, i) => {
    const key = keyOf(line);
    if (key !== null && remaining.has(key)) lastIndexForKey.set(key, i);
  });

  const patched = [];
  lines.forEach((line, i) => {
    const key = keyOf(line);
    if (key === null || !remaining.has(key)) {
      patched.push(line);
      return;
    }
    if (i !== lastIndexForKey.get(key)) return; // drop an earlier duplicate of this key
    patched.push(`${key}=${updates[key]}`);
    remaining.delete(key);
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
