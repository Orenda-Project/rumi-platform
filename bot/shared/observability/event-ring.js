/**
 * event-ring — a small, bounded, in-memory record of what the bot just did,
 * so the operator console can show it live.
 *
 * Three rules shape this file, and all three are load-bearing:
 *
 * 1. **It imports nothing.** It is called from `logToFile` (180 files) and
 *    `logEvent` (22), i.e. from the hottest path in the process and from every
 *    worker. A dependency here is a dependency everywhere, and a require cycle
 *    here is a boot failure. It is also what lets the repo-root jest suite test
 *    this without mocking anything.
 *
 * 2. **It never throws.** A logger that can crash the thing it is describing is
 *    worse than no logger. Every entry point is defensive; callers still wrap.
 *
 * 3. **Fields are allowlisted, never denylisted.** `logToFile` payloads across
 *    the codebase carry `from` (a teacher's phone number), message text, and
 *    reading-assessment transcripts, and the console is a web page. A denylist
 *    cannot work when any caller can pass any object — `console.log`'s override
 *    does `Object.assign(data, arg)` — so anything not named here is dropped.
 *
 * What this is NOT: durable storage. A restart clears it, which is correct for
 * a live feed. Durable logs are the daily file's job and Axiom's job.
 *
 * @module shared/observability/event-ring
 */

/** Fields safe to show in a browser. Everything else is dropped. */
const ALLOWED_FIELDS = new Set([
  'correlationId', 'userId', 'sessionId', 'channel', 'language',
  'provider', 'model', 'durationMs', 'ms', 'status', 'statusCode',
  'promptTokens', 'completionTokens', 'totalTokens', 'costUsd',
  'queue', 'jobId', 'attempt', 'table', 'feature', 'action', 'result',
  'audioSeconds', 'chars', 'voiceId', 'errorCode', 'kind', 'count',
]);

/** Shapes that are secrets whatever they are called. Matching text is dropped. */
const SECRET_SHAPES = [
  /sk-[A-Za-z0-9_-]{16,}/,          // OpenAI / OpenRouter
  /xox[baprs]-[A-Za-z0-9-]{10,}/,   // Slack
  /eyJ[A-Za-z0-9_-]{20,}/,          // any JWT, incl. the Supabase service key
  /AIza[A-Za-z0-9_-]{20,}/,         // Google
  /sbp_[A-Za-z0-9]{20,}/,           // Supabase personal token
  /\b[A-Za-z0-9]{40,}\b/,           // long contiguous high-entropy value
];

/** Anything phone-number-shaped, wherever it appears in free text. */
const PHONE_SHAPE = /\+?\d[\d\s().-]{7,}\d/g;

const MAX_TEXT = 240;

let capacity = 2000;
let buffer = new Array(capacity);
let seq = 0;

/** correlationId -> summary, LRU-evicted. A Map preserves insertion order. */
const traces = new Map();
const MAX_TRACES = 300;

/** Live subscribers (the SSE streams). */
const subscribers = new Set();
const MAX_SUBSCRIBERS = 5;

/**
 * Reduce free text to something safe to display: truncated, phone-stripped, and
 * dropped entirely if it looks like it contains a credential.
 *
 * Dropping beats masking for secrets. A masked-but-recognisable secret still
 * reveals its shape and length, and a false negative here puts a live key on a
 * screen.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function safeText(value) {
  if (value == null) return null;
  let text = String(value);
  if (!text) return null;
  if (SECRET_SHAPES.some((re) => re.test(text))) return '[hidden: looked like a credential]';
  text = text.replace(PHONE_SHAPE, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 7) return m;
    return `+${digits.slice(0, digits.length > 11 ? 2 : 1)}•••${digits.slice(-2)}`;
  });
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

/**
 * Keep only allowlisted fields, and only scalar values within them.
 *
 * @param {object} data
 * @returns {{fields: object, dropped: number}}
 */
function project(data) {
  const fields = {};
  let dropped = 0;
  if (!data || typeof data !== 'object') return { fields, dropped };
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.has(key)) { dropped += 1; continue; }
    const t = typeof value;
    if (t === 'number' || t === 'boolean') { fields[key] = value; continue; }
    if (t === 'string') {
      const safe = safeText(value);
      if (safe !== null) fields[key] = safe;
      continue;
    }
    dropped += 1;
  }
  return { fields, dropped };
}

/**
 * Record one thing that happened.
 *
 * @param {object} record
 * @param {'event'|'log'} record.kind
 * @param {string} [record.event]  dotted name for a semantic event
 * @param {string} [record.message]
 * @param {string} [record.level]
 * @param {string} [record.correlationId]
 * @param {object} [record.data]
 */
function push(record) {
  try {
    if (!record || typeof record !== 'object') return;
    const { fields, dropped } = project(record.data);
    const correlationId = record.correlationId
      || (record.data && typeof record.data.correlationId === 'string' ? record.data.correlationId : null);

    const parts = typeof record.event === 'string' ? record.event.split('.') : [];
    const entry = {
      seq: seq += 1,
      ts: Date.now(),
      kind: record.kind === 'event' ? 'event' : 'log',
      level: typeof record.level === 'string' ? record.level : 'info',
      event: typeof record.event === 'string' ? record.event : null,
      feature: parts[0] || fields.feature || null,
      action: parts[1] || null,
      result: parts[2] || fields.result || null,
      correlationId: correlationId || null,
      msg: safeText(record.message),
      fields,
      dropped,
    };

    buffer[entry.seq % capacity] = entry;
    if (correlationId) indexTrace(entry);
    fanOut(entry);
  } catch {
    // A failure to record must never surface in the thing being recorded.
  }
}

/** Maintain the per-request summary used by the trace list. */
function indexTrace(entry) {
  let trace = traces.get(entry.correlationId);
  if (!trace) {
    if (traces.size >= MAX_TRACES) traces.delete(traces.keys().next().value);
    trace = {
      correlationId: entry.correlationId,
      firstSeq: entry.seq,
      startedAt: entry.ts,
      feature: entry.feature,
      count: 0,
      failed: false,
    };
    traces.set(entry.correlationId, trace);
  }
  trace.lastSeq = entry.seq;
  trace.endedAt = entry.ts;
  trace.count += 1;
  if (!trace.feature && entry.feature) trace.feature = entry.feature;
  if (entry.level === 'error' || /fail|error|timeout/i.test(entry.result || '')) trace.failed = true;
}

function fanOut(entry) {
  for (const fn of subscribers) {
    try { fn(entry); } catch { subscribers.delete(fn); }
  }
}

/** Records newest-first, optionally filtered. */
function query({ since = 0, feature = null, level = null, q = null, limit = 200 } = {}) {
  const out = [];
  const start = Math.max(seq - capacity + 1, 1);
  for (let i = seq; i >= start && out.length < limit; i -= 1) {
    const entry = buffer[i % capacity];
    if (!entry || entry.seq <= since) continue;
    if (feature && entry.feature !== feature) continue;
    if (level && entry.level !== level) continue;
    if (q && !(`${entry.msg || ''} ${entry.event || ''}`.toLowerCase().includes(String(q).toLowerCase()))) continue;
    out.push(entry);
  }
  return out;
}

/** Recent request summaries, newest first. */
function traceList(limit = 50) {
  return [...traces.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((t) => ({ ...t, durationMs: (t.endedAt || t.startedAt) - t.startedAt }));
}

/**
 * Every stage of one request, in order.
 *
 * `partial` matters: telling the operator that the beginning of a trace has
 * scrolled out of memory is far better than rendering a truncated waterfall as
 * though it were the whole story.
 */
function getTrace(correlationId) {
  const summary = traces.get(correlationId);
  if (!summary) return null;
  const stages = [];
  const start = Math.max(seq - capacity + 1, 1);
  for (let i = Math.max(summary.firstSeq, start); i <= seq; i += 1) {
    const entry = buffer[i % capacity];
    if (entry && entry.correlationId === correlationId) stages.push(entry);
  }
  const startedAt = stages.length ? stages[0].ts : summary.startedAt;
  return {
    ...summary,
    partial: summary.firstSeq < start,
    durationMs: (summary.endedAt || startedAt) - summary.startedAt,
    stages: stages.map((s) => ({ ...s, offsetMs: s.ts - startedAt })),
  };
}

function subscribe(fn) {
  if (subscribers.size >= MAX_SUBSCRIBERS) {
    const oldest = subscribers.values().next().value;
    subscribers.delete(oldest);
  }
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function stats() {
  const records = Math.min(seq, capacity);
  return { records, capacity, traces: traces.size, subscribers: subscribers.size, seq };
}

/** Test seam, and the `RUMI_CONSOLE_RING_SIZE` knob. */
function configure({ size } = {}) {
  const next = Math.min(Math.max(Number(size) || capacity, 200), 20000);
  if (next === capacity) return;
  capacity = next;
  buffer = new Array(capacity);
  seq = 0;
  traces.clear();
}

function reset() {
  buffer = new Array(capacity);
  seq = 0;
  traces.clear();
  subscribers.clear();
}

module.exports = {
  push, query, traceList, getTrace, subscribe, stats, configure, reset,
  safeText, project, ALLOWED_FIELDS, SECRET_SHAPES,
};
