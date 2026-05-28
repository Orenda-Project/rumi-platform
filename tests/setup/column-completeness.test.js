/**
 * Column Completeness Test (Phase 5)
 *
 * The sibling schema-completeness.test.js checks that every .from('table') has a
 * CREATE TABLE. This goes one level deeper: every COLUMN the bot code writes
 * (.insert/.update/.upsert top-level keys) or reads (.select / .eq/.order/…) must
 * exist on that table in 00_complete-schema.sql — counting both CREATE TABLE
 * columns and the idempotent `ALTER TABLE … ADD COLUMN` reconcile section.
 *
 * Why: tables in the consolidated schema were created from a leaner snapshot than
 * the code expects. A clone hits "column does not exist" at runtime (pic-to-LP
 * insert, quiz-nudge scheduler, settings flow, coaching writes). Tests mock
 * Supabase, so only a static guard catches this.
 *
 * The parser is brace/string-aware so it extracts TOP-LEVEL insert keys only
 * (not keys nested inside a JSONB payload), and resolves the table from the
 * nearest preceding .from('…') in the same chain.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../../infrastructure/supabase/00_complete-schema.sql');
const BOT_DIR = path.resolve(__dirname, '../../bot');

// ── Reviewed allowlist ───────────────────────────────────────────────────────
// (table -> columns) that the guard should NOT flag, each with a verified reason.
// Adding a column here is a deliberate, reviewed decision — prefer fixing the
// schema (add the column) or the code (stop referencing it).
const ALLOWLIST = {
  // (exam_grades formerly held a per-STUDENT shape that didn't exist on the
  // per-QUESTION schema; resolved by rewriting `_saveGrade()` to insert into
  // `exam_submissions` then `exam_grades` keyed on (submission_id, question_id))
  // `onconflict` is the Supabase `{ onConflict: '...' }` upsert OPTION, not a
  // column. The parser picks it up because the rows argument is a variable
  // (`.upsert(gradeRows, { onConflict: 'submission_id,question_id' })`) so the
  // first object literal it sees after `.upsert(` is the options object.
  exam_grades: ['onconflict'],
  // conversation_state is a coaching_sessions column mis-attributed to conversations
  // by chain proximity (parser artifact). (The stale context_data write was removed —
  // comprehension state lives in Redis, see redis-comprehension.service.)
  // Post-bd-1850: text-message.handler.js:1810 + voice-message.handler.js:999 now
  // write `.from('chat_sessions').update({ conversation_state: null })` (was
  // `.from('sessions')` — a typo for a table that doesn't exist). The chat-session
  // `conversation_state` JSONB column tracks the chat-level state-machine flags
  // (AWAITING_VIDEO_TOPIC etc.) and is added by the ALTER ADD COLUMN reconcile
  // section below. The parser still chain-attributes one read to `conversations` —
  // keep the allowlist entry but document the post-rename reality.
  conversations: ['conversation_state'],
  chat_sessions: ['conversation_state'],
  // camelCase key from a nested non-DB object (parser artifact).
  coaching_sessions: ['excerptlength'],
  // Mis-attributed by chain proximity; no quiz_sessions write references updated_at.
  quiz_sessions: ['updated_at'],
  // Nested keys inside the users.preferences / screen-data objects (parser artifact);
  // users stores language in preferred_language + preferences, grade in grades_taught.
  users: ['grade', 'language'],
};

// ── Parser ───────────────────────────────────────────────────────────────────
function schemaColumns(sql) {
  const tables = {};
  const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    const cols = new Set();
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i);
      if (cm) {
        const c = cm[1].toLowerCase();
        if (!['primary', 'foreign', 'unique', 'constraint', 'check', 'references'].includes(c)) cols.add(c);
      }
    }
    tables[name] = cols;
  }
  // idempotent reconcile section
  const alterRe = /ALTER TABLE (\w+) ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi;
  let a;
  while ((a = alterRe.exec(sql)) !== null) {
    const name = a[1].toLowerCase();
    (tables[name] = tables[name] || new Set()).add(a[2].toLowerCase());
  }
  return tables;
}

// Top-level keys of the object literal starting near index `start` (brace/string aware).
function topLevelKeys(s, start) {
  let i = s.indexOf('{', start);
  if (i < 0) return new Set();
  let depth = 0, keys = new Set(), expectKey = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } continue; }
    if (ch === '{') { depth++; if (depth === 1) expectKey = true; continue; }
    if (ch === '}') { depth--; if (depth === 0) break; continue; }
    if (ch === '[' || ch === '(') { let d = 1; i++; while (i < s.length && d > 0) { if (s[i] === '"' || s[i] === "'" || s[i] === '`') { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } } else if (s[i] === '[' || s[i] === '(') d++; else if (s[i] === ']' || s[i] === ')') d--; i++; } i--; continue; }
    if (ch === ',' && depth === 1) { expectKey = true; continue; }
    if (depth === 1 && expectKey) {
      const mm = s.slice(i).match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
      if (mm) { keys.add(mm[1].toLowerCase()); i += mm[0].length - 1; expectKey = false; continue; }
      if (!/\s/.test(ch)) expectKey = false;
    }
  }
  return keys;
}

function selectColumns(arg) {
  const out = new Set();
  let depth = 0, buf = '', toks = [];
  for (const ch of arg) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { toks.push(buf); buf = ''; } else buf += ch; }
  if (buf) toks.push(buf);
  for (let t of toks) {
    t = t.trim();
    if (!t || t === '*' || t.includes('(')) continue;     // skip * and foreign embeds name(...)
    if (t.includes(':')) t = t.split(':')[1].trim();        // alias:col -> col
    const mm = t.match(/^([a-z_][a-z0-9_]*)$/i);
    if (mm) out.add(mm[1].toLowerCase());
  }
  return out;
}

function findJsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (['node_modules', '__mocks__', 'tests'].includes(e.name)) continue; out.push(...findJsFiles(p)); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function nearestTable(content, idx) {
  const before = content.slice(Math.max(0, idx - 600), idx);
  const froms = [...before.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/g)];
  return froms.length ? froms[froms.length - 1][1].toLowerCase() : null;
}

// ── Test ──────────────────────────────────────────────────────────────────────
describe('Column Completeness', () => {
  it('every column the bot code writes/reads exists in the schema (or is allowlisted)', () => {
    const tables = schemaColumns(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const refs = {}; // table -> Set(col)
    const add = (t, c) => { (refs[t] = refs[t] || new Set()).add(c); };

    for (const file of findJsFiles(BOT_DIR)) {
      const c = fs.readFileSync(file, 'utf-8');
      let m;
      const iu = /\.(insert|update|upsert)\s*\(/g;
      while ((m = iu.exec(c)) !== null) { const t = nearestTable(c, m.index); if (t && tables[t]) for (const k of topLevelKeys(c, m.index)) add(t, k); }
      const se = /\.select\(\s*([`'"])([\s\S]*?)\1\s*\)/g;
      while ((m = se.exec(c)) !== null) { const t = nearestTable(c, m.index); if (t && tables[t]) for (const k of selectColumns(m[2])) add(t, k); }
      const fl = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order|filter)\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
      while ((m = fl.exec(c)) !== null) { const t = nearestTable(c, m.index); if (t && tables[t]) add(t, m[2].toLowerCase()); }
    }

    const gaps = [];
    for (const t of Object.keys(refs)) {
      const allowed = new Set(ALLOWLIST[t] || []);
      for (const col of refs[t]) {
        if (!tables[t].has(col) && !allowed.has(col)) gaps.push(`${t}.${col}`);
      }
    }
    gaps.sort();

    expect(gaps).toEqual([]);
  });
});
