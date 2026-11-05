/**
 * Parsers for the PostgREST mini-languages that supabase-js passes through
 * as strings: select lists, column refs (JSON paths, casts), .or() logic
 * trees and in-lists. Pure functions — no SQL is built here.
 *
 * Anything that is not a plain identifier is rejected, so every name that
 * reaches SQL later is safe to double-quote.
 */

const { AdapterError } = require('./errors');

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const IDENT_RE = new RegExp(`^${IDENT}$`);
const COLUMN_REF_RE = new RegExp(`^(${IDENT})((?:->>?(?:${IDENT}|\\d+))*)$`);
const PATH_SEGMENT_RE = new RegExp(`(->>?)(${IDENT}|\\d+)`, 'g');
const CAST_RE = /^[a-z_][a-z0-9_]*(\[\])?$/;
const ALIAS_RE = new RegExp(`^(${IDENT}):(?!:)(.*)$`, 's');
const GROUP_RE = /^(not\.)?(and|or)\((.*)\)$/s;

/** Filter operators the adapter knows how to compile (PostgREST names). */
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd']);

/** A malformed select/filter string: PostgREST's parse error, PGRST100. */
class PostgrestSyntaxError extends AdapterError {
  constructor(message) {
    super('PGRST100', message);
    this.name = 'PostgrestSyntaxError';
  }
}

function assertIdent(name, what) {
  if (!IDENT_RE.test(name)) throw new PostgrestSyntaxError(`Invalid ${what}: "${name}"`);
  return name;
}

/**
 * Split on top-level separators, ignoring ones inside (...) or "...".
 * @param {string} input
 * @param {string} sep single character
 * @returns {string[]}
 */
function splitTopLevel(input, sep = ',') {
  const parts = [];
  let depth = 0;
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      current += ch;
      if (ch === '\\' && i + 1 < input.length) current += input[++i];
      else if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) throw new PostgrestSyntaxError(`Unbalanced ")" in "${input}"`);
    } else if (ch === sep && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (depth !== 0 || inQuotes) throw new PostgrestSyntaxError(`Unbalanced "(" or quote in "${input}"`);
  parts.push(current);
  return parts;
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

/**
 * "analysis_data->observer_debrief->>audio_hash" → { name, path, cast }
 *
 * Casts (`col::text`) are only accepted where PostgREST accepts them: in
 * select lists. In a filter, a failing cast's error message would echo the
 * cell value back to the caller.
 * @param {string} ref
 * @param {{ allowCast?: boolean }} [options]
 * @returns {{ name: string, path: Array<{op: string, key: string|number}>, cast: string|null }}
 */
function parseColumnRef(ref, { allowCast = false } = {}) {
  const [body, cast = null, ...extra] = String(ref).split('::');
  if (cast !== null && !allowCast) throw new PostgrestSyntaxError(`Casts are not allowed here: "${ref}"`);
  if (extra.length > 0 || (cast !== null && !CAST_RE.test(cast))) {
    throw new PostgrestSyntaxError(`Invalid cast in "${ref}"`);
  }
  const match = COLUMN_REF_RE.exec(body);
  if (!match) throw new PostgrestSyntaxError(`Invalid column reference: "${ref}"`);
  const path = [...match[2].matchAll(PATH_SEGMENT_RE)].map(([, op, key]) => ({
    op,
    key: /^\d+$/.test(key) ? Number(key) : key,
  }));
  return { name: match[1], path, cast };
}

function parseEmbedHead(head) {
  const [relation, ...modifiers] = head.split('!');
  let hint = null;
  let isInner = false;
  for (const mod of modifiers) {
    if (mod === 'inner') isInner = true;
    else if (mod === 'left') continue;
    else if (hint === null) hint = assertIdent(mod, 'embed hint');
    else throw new PostgrestSyntaxError(`Too many hints in "${head}"`);
  }
  return { relation: assertIdent(relation, 'relation'), hint, isInner };
}

function parseSelectItem(rawItem) {
  const item = rawItem.trim();
  if (item === '') throw new PostgrestSyntaxError('Empty item in select');
  if (item === '*') return { type: 'star' };

  const aliasMatch = ALIAS_RE.exec(item);
  const alias = aliasMatch ? aliasMatch[1] : null;
  const rest = (aliasMatch ? aliasMatch[2] : item).trim();

  const open = rest.indexOf('(');
  if (open === -1) return { type: 'column', ...parseColumnRef(rest, { allowCast: true }), alias };

  if (!rest.endsWith(')')) throw new PostgrestSyntaxError(`Malformed embed: "${item}"`);
  return {
    type: 'embed',
    ...parseEmbedHead(rest.slice(0, open).trim()),
    alias,
    // eslint-disable-next-line no-use-before-define
    children: parseSelect(rest.slice(open + 1, -1)),
  };
}

/**
 * Parse a supabase-js select string into a node tree.
 * @param {string|undefined} select
 * @returns {Array<object>} star | column | embed nodes
 */
function parseSelect(select) {
  const text = (select ?? '').trim();
  if (text === '' || text === '*') return [{ type: 'star' }];
  return splitTopLevel(text).map(parseSelectItem);
}

/**
 * '("a","b",c)' → ['a', 'b', 'c']
 * @param {string} text
 * @returns {string[]}
 */
function parseList(text) {
  const trimmed = String(text).trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    throw new PostgrestSyntaxError(`Expected a parenthesised list, got "${text}"`);
  }
  const inner = trimmed.slice(1, -1);
  if (inner.trim() === '') return [];
  return splitTopLevel(inner).map((v) => unquote(v.trim()));
}

function parseFilterExpr(expr) {
  const firstDot = expr.indexOf('.');
  if (firstDot === -1) throw new PostgrestSyntaxError(`Malformed filter: "${expr}"`);
  const column = expr.slice(0, firstDot);
  parseColumnRef(column);

  let rest = expr.slice(firstDot + 1);
  const negate = rest.startsWith('not.');
  if (negate) rest = rest.slice(4);

  const opDot = rest.indexOf('.');
  if (opDot === -1) throw new PostgrestSyntaxError(`Malformed filter: "${expr}"`);
  const op = rest.slice(0, opDot);
  if (!FILTER_OPS.has(op)) throw new PostgrestSyntaxError(`Unsupported operator "${op}" in "${expr}"`);

  const raw = rest.slice(opDot + 1);
  const value = op === 'in' ? parseList(raw) : unquote(raw);
  return { type: 'filter', column, negate, op, value };
}

/**
 * Parse a PostgREST logic tree ("a.eq.1,and(b.is.null,c.gt.2)").
 * @param {string} text
 * @returns {Array<object>} filter | group nodes
 */
function parseLogicTree(text) {
  return splitTopLevel(String(text)).map((rawPart) => {
    const part = rawPart.trim();
    const group = GROUP_RE.exec(part);
    if (group) {
      return { type: 'group', op: group[2], negate: Boolean(group[1]), children: parseLogicTree(group[3]) };
    }
    return parseFilterExpr(part);
  });
}

module.exports = {
  FILTER_OPS,
  PostgrestSyntaxError,
  assertIdent,
  parseColumnRef,
  parseList,
  parseLogicTree,
  parseSelect,
};
