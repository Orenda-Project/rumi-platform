'use strict';
/**
 * exam-cost.service — the Cambridge Cost Compass data layer.
 *
 * A vendor-neutral, itemised "true all-in cost to certificate" comparison
 * across exam boards, plus the next registration deadline per board. Static
 * data + arithmetic — deliberately NOT a generative feature: there is no LLM
 * call anywhere in this file, and no API key gates it (see docs/features/exam-cost.md).
 *
 * Everything here is PURE and side-effect-free apart from reading the two JSON
 * datasets off disk (cached per resolved path). No Supabase, no messaging
 * driver, no logger — so this file is testable on its own and safe to require
 * from a cron worker that must boot without the bot's optional native deps.
 *
 * ── Where the data comes from ────────────────────────────────────────────────
 * Default: bot/shared/data/exam-fees.json + exam-deadlines.json.
 * Override, in precedence order: useDataDir(dir) → EXAM_COST_DATA_DIR → default.
 * Tests point at tests/exam-cost/fixtures/ so a real-world data refresh can
 * never turn the maths suite red for the wrong reason; one suite deliberately
 * reads the LIVE files to prove they still parse and cost without throwing.
 *
 * ── The honesty rules (these are the product) ────────────────────────────────
 * Real Pakistani fee data is full of holes: British Council publishes private
 * candidate fees only inside a login-gated portal, three BISE boards publish
 * nothing machine-readable, and AKU-EB does not charge per subject at all — it
 * charges one flat fee per subject GROUP, so no single number can populate a
 * per-subject schema without producing a wrong total. So:
 *
 *   1. A null per_subject_fee is NEVER treated as zero. The board is reported
 *      as "fee not published" and its `notes` are surfaced to the parent —
 *      that note is where AKU-EB's real group pricing lives.
 *   2. Only boards with a real number are ranked or compared.
 *   3. If NO board has a real number, the reply says so plainly and points at
 *      the web calculator rather than implying an answer.
 *   4. A null late_entry_surcharge amount is a stated caveat, not a silent 0.
 *   5. A deadline with a null date is dropped, not rendered as "Invalid Date";
 *      a row whose confidence is "estimated" is tagged as such on its face.
 *
 * A cost tool that quietly quotes a made-up number is worse than no tool — it
 * only wins on genuine itemisation.
 *
 * ── Fee-shape semantics (`fixed_fees[].per`, and the late surcharge's `per`) ──
 *   "subject"   → charged once per subject entered, every session
 *   "session"   → charged once per exam session
 *   "candidate" → charged once, ever (registration) — NOT repeated per session
 * That distinction is the whole reason the 2-year total isn't just `total × 2`.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const FEES_FILE = 'exam-fees.json';
const DEADLINES_FILE = 'exam-deadlines.json';

/** A parent budgeting "two years out" pays the recurring fees once per exam session. */
const SESSIONS_PER_TWO_YEARS = 2;

/** A deadline this close is called out as urgent rather than merely listed. */
const URGENT_WINDOW_DAYS = 21;

/** The two lead times an opt-in reminder fires on. */
const REMINDER_LEAD_DAYS = [14, 3];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** WhatsApp hard-caps a text body far above this; 1500 keeps a reply skimmable on a phone. */
const MAX_REPLY_CHARS = 1500;

/** How much of a board's `notes` reaches the parent. The real notes run to thousands of chars. */
const NOTES_CHARS = 200;

/** Where a parent goes when the datasets cannot answer at all. */
const CALCULATOR_URL = 'https://oyekamal.github.io/homeschooling-pakistan/cost/';

// Shorthand a parent might type → a canonical level label. Dataset spellings
// always win over this map (see resolveLevel), so a data refresh that renames a
// level does not need a code change; these only cover the abbreviations.
// Deliberately no bare "ssc"/"hssc": the datasets carry SSC-I, SSC-II and
// "SSC (Matric)" and there is no honest way to pick one.
const LEVEL_ALIASES = {
  'o level': 'O Level',
  olevel: 'O Level',
  'o-level': 'O Level',
  ol: 'O Level',
  igcse: 'IGCSE',
  as: 'AS',
  'as level': 'AS',
  'as-level': 'AS',
  'a level': 'A Level',
  alevel: 'A Level',
  'a-level': 'A Level',
  al: 'A Level',
  'ssc i': 'SSC-I',
  'ssc ii': 'SSC-II',
  'hssc i': 'HSSC-I',
  'hssc ii': 'HSSC-II',
  matric: 'SSC (Matric)',
  inter: 'HSSC (Intermediate)',
  intermediate: 'HSSC (Intermediate)',
  fsc: 'HSSC (Intermediate)',
};

// What a parent might type → a board id. Ids themselves always match directly,
// so this only covers nicknames.
const BOARD_ALIASES = {
  caie: 'cambridge',
  cie: 'cambridge',
  'british council': 'cambridge',
  bc: 'cambridge',
  pearson: 'edexcel',
  akueb: 'aku-eb',
  aku: 'aku-eb',
  biselahore: 'bise-lahore',
  'bise lahore': 'bise-lahore',
  bisekarachi: 'bise-karachi',
  'bise karachi': 'bise-karachi',
  biserawalpindi: 'bise-rawalpindi',
  'bise rawalpindi': 'bise-rawalpindi',
  // Deliberately NO bare city aliases ("lahore", "karachi"): "cost O Level 6
  // Lahore" must read Lahore as the CITY, not as a board. City and board names
  // overlap in Pakistan; a board always needs its "bise-" prefix.
};

// The reply labels, in the languages the bot already answers in. Numbers,
// board names, level names and city names are deliberately NOT translated —
// they are what the parent has to type into a portal.
const LABELS = {
  en: {
    heading: 'Exam cost estimate',
    subjects: 'subjects',
    oneOff: 'one-off',
    perSession: 'This session',
    twoYearTotal: '2-year total',
    nextDeadline: 'Next deadline',
    estimate: 'Estimate only — verify with the board',
    urgent: 'CLOSING SOON',
    notPublished: 'Fee not published',
    seeNotes: 'see notes',
    notListed: 'not listed',
    offers: 'Offers',
    lateUnknown: 'Late-entry surcharge amount not published',
    noneKnown: 'None of these boards publishes a per-subject fee for this level, so there is no honest total to give.',
    fullCalculator: 'Full breakdown and sources',
  },
  ur: {
    heading: 'امتحانی اخراجات کا تخمینہ',
    subjects: 'مضامین',
    oneOff: 'ایک بار',
    perSession: 'اس سیشن کا کل',
    twoYearTotal: '2 سال کا کل',
    nextDeadline: 'اگلی آخری تاریخ',
    estimate: 'صرف تخمینہ — بورڈ سے تصدیق کریں',
    urgent: 'وقت کم ہے',
    notPublished: 'فیس شائع نہیں کی گئی',
    seeNotes: 'تفصیل نیچے',
    notListed: 'دستیاب نہیں',
    offers: 'دستیاب',
    lateUnknown: 'لیٹ انٹری سرچارج کی رقم شائع نہیں کی گئی',
    noneKnown: 'ان بورڈز میں سے کوئی بھی اس سطح کے لیے فی مضمون فیس شائع نہیں کرتا، اس لیے کوئی درست کل نہیں دیا جا سکتا۔',
    fullCalculator: 'مکمل تفصیل اور ذرائع',
  },
};

// ── Dataset loading ──────────────────────────────────────────────────────────

let overrideDataDir = null;
const cache = new Map(); // resolved file path → parsed JSON

/** The active data directory: useDataDir() → EXAM_COST_DATA_DIR → the shipped default. */
function dataDir() {
  return overrideDataDir || process.env.EXAM_COST_DATA_DIR || DEFAULT_DATA_DIR;
}

/** Point the service at another data directory (tests, a per-deployment dataset). */
function useDataDir(dir) {
  overrideDataDir = dir || null;
  cache.clear();
  return dataDir();
}

/** Back to EXAM_COST_DATA_DIR / the shipped default, cache cleared. */
function resetDataDir() {
  overrideDataDir = null;
  cache.clear();
  return dataDir();
}

function readDataset(file, { reload = false, dir } = {}) {
  const full = path.join(dir || dataDir(), file);
  if (reload || !cache.has(full)) {
    cache.set(full, JSON.parse(fs.readFileSync(full, 'utf8')));
  }
  return cache.get(full);
}

/** The fee dataset. `{ dir }` reads one directory without changing the active one. */
function loadFees(opts = {}) {
  return readDataset(FEES_FILE, opts);
}

/** The deadline dataset. `{ dir }` reads one directory without changing the active one. */
function loadDeadlines(opts = {}) {
  return readDataset(DEADLINES_FILE, opts);
}

/** True when the dataset is still a placeholder set rather than compiled data. */
function isFixture(dataset) {
  return !dataset || dataset.as_of === 'FIXTURE';
}

// ── Resolvers ────────────────────────────────────────────────────────────────

/** Every board id the dataset knows, in dataset order. */
function boardIds(fees) {
  return (fees || loadFees()).boards.map((b) => b.id);
}

/** Every level label any board in the dataset offers, in dataset order. */
function datasetLevels(fees) {
  const out = [];
  for (const board of (fees || loadFees()).boards || []) {
    for (const level of board.levels || []) if (!out.includes(level)) out.push(level);
  }
  return out;
}

/** "cambridge, AKU-EB" / ["aku"] → ['cambridge','aku-eb']; unknown names dropped. */
function resolveBoardIds(input, fees) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',');
  const known = new Set(boardIds(fees));
  const out = [];
  for (const token of raw) {
    const key = String(token || '').trim().toLowerCase();
    if (!key) continue;
    const id = known.has(key) ? key : BOARD_ALIASES[key];
    if (id && known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * "o-level" / "SSC-II" / "matric" → the canonical level label.
 *
 * Dataset spellings win over LEVEL_ALIASES, so a data refresh that introduces
 * SSC-I / "HSSC (Intermediate)" is understood with no code change.
 */
function resolveLevel(input, fees) {
  const raw = String(input || '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const key = raw.toLowerCase();

  let levels = [];
  try {
    levels = datasetLevels(fees);
  } catch {
    levels = []; // unreadable dataset must not make level parsing throw
  }

  const exact = levels.find((l) => l.toLowerCase() === key);
  if (exact) return exact;

  const aliased = LEVEL_ALIASES[key];
  if (!aliased) return null;
  // Prefer the dataset's own capitalisation of the aliased label if it has one.
  return levels.find((l) => l.toLowerCase() === aliased.toLowerCase()) || aliased;
}

/** Does this board list this level at all? Case-insensitive. */
function boardOffersLevel(board, level) {
  const lower = String(level).toLowerCase();
  return (board.levels || []).some((l) => String(l).toLowerCase() === lower)
    || Object.keys(board.per_subject_fee || {}).some((k) => k.toLowerCase() === lower);
}

/** The board's per-subject fee for a level: a number, or null/undefined when unpublished. */
function boardPerSubjectFee(board, level) {
  const map = board.per_subject_fee || {};
  const key = Object.keys(map).find((k) => k.toLowerCase() === String(level).toLowerCase());
  return key === undefined ? undefined : map[key];
}

// ── Formatting primitives ────────────────────────────────────────────────────

/** 250000 → "250,000" (grouping only — the currency symbol is added by the caller). */
function formatAmount(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

/** 250000 → "PKR 250,000". */
function formatCurrency(n, currency = 'PKR') {
  return `${currency} ${formatAmount(n)}`;
}

/** Cut `text` to `limit` on a word boundary, marking the cut with an ellipsis. */
function cutAt(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * A prose excerpt, head-first. Used for a deadline's `fee_impact`, where the
 * opening sentence is the point.
 */
function trimNotes(notes, limit = NOTES_CHARS) {
  const text = String(notes || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return cutAt(text, limit);
}

const MONEY_RE = /(?:PKR|Rs\.?)\s?[\d,]{3,}/i;

/**
 * The parent-facing slice of a board's `notes` — MONEY-FIRST, not head-first.
 *
 * The real notes are research memos running to thousands of characters, and
 * the numbers a parent needs are usually buried in the middle. AKU-EB is the
 * case that forced this: its confirmed per-GROUP prices ("SSC-II Humanities
 * PKR 31,500 / Science PKR 34,800", …) sit ~1,100 characters in, behind a
 * paragraph of provenance — a head-trim would hand the parent the sourcing
 * story and none of the prices, which defeats the whole reason notes are
 * surfaced at all.
 *
 * So: find the first real PKR amount, rewind to the start of its clause, and
 * take the window from there. With no amount anywhere, fall back to the head.
 */
function notesExcerpt(notes, limit = NOTES_CHARS) {
  const text = String(notes || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length <= limit) return text;

  const match = MONEY_RE.exec(text);
  if (!match) return cutAt(text, limit);

  // Rewind to the nearest clause break before the amount, so the excerpt opens
  // on a label ("SSC-I Humanities PKR 28,100") rather than mid-word.
  const before = text.slice(0, match.index);
  const breakAt = Math.max(
    before.lastIndexOf(': '), before.lastIndexOf('; '),
    before.lastIndexOf('. '), before.lastIndexOf(', '),
  );
  const start = breakAt >= 0 ? breakAt + 2 : 0;
  const window = cutAt(text.slice(start), limit);
  return start > 0 ? `…${window}` : window;
}

function labelsFor(language) {
  const key = String(language || 'en').slice(0, 2).toLowerCase();
  return LABELS[key] || LABELS.en;
}

/** Keep whole lines until `budget` is spent; append "…" if anything was dropped. */
function clampLines(lines, budget) {
  const joined = lines.join('\n');
  if (joined.length <= budget) return { text: joined, truncated: false };
  const kept = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > budget - 2) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { text: `${kept.join('\n')}\n…`, truncated: true };
}

// ── Costing ──────────────────────────────────────────────────────────────────

/**
 * Itemised cost per board for one candidate.
 *
 * A board is only `supported` (ranked, totalled, compared) when the dataset
 * carries a real per-subject number for the requested level. Otherwise it is
 * returned with `reason: 'fee_not_published' | 'level_not_offered'`, a zero
 * total that callers must not print as a price, and a trimmed `notes` excerpt —
 * which for AKU-EB is where the real per-GROUP pricing lives.
 *
 * @param {object} opts
 * @param {string} opts.level      canonical or aliased level ("O Level", "SSC-II", "matric", …)
 * @param {number} opts.subjects   how many subjects the candidate is entering
 * @param {string[]} [opts.boardIds]  boards to compare; defaults to every board
 * @param {boolean} [opts.includeLate=false] add the late-entry surcharge
 * @param {string} [opts.city]     city the candidate would sit in (availability flag only)
 * @param {object} [opts.fees]     an already-loaded fee dataset (skips the disk read)
 */
function estimate({ level, subjects, boardIds: wanted, includeLate = false, city = null, fees } = {}) {
  const dataset = fees || loadFees();
  const resolvedLevel = resolveLevel(level, dataset);
  const count = Math.trunc(Number(subjects));
  const errors = [];

  if (!resolvedLevel) errors.push(`unknown_level:${level}`);
  if (!Number.isFinite(count) || count < 1) errors.push(`invalid_subjects:${subjects}`);

  const ids = wanted && wanted.length ? resolveBoardIds(wanted, dataset) : boardIds(dataset);
  const boards = [];

  if (!errors.length) {
    for (const id of ids) {
      const board = dataset.boards.find((b) => b.id === id);
      if (!board) continue;

      const base = {
        id: board.id,
        name: board.name,
        levels: board.levels || [],
        notes: notesExcerpt(board.notes),
        source: board.source || null,
        privateCandidateAllowed: board.private_candidate_allowed !== false,
        cityAvailable: city
          ? (board.cities || []).some((c) => String(c).toLowerCase() === String(city).toLowerCase())
          : null,
      };

      const perSubject = boardPerSubjectFee(board, resolvedLevel);

      // Two distinct kinds of "we can't cost this", both honest, neither zero.
      if (typeof perSubject !== 'number' || !Number.isFinite(perSubject)) {
        boards.push({
          ...base,
          supported: false,
          reason: boardOffersLevel(board, resolvedLevel) ? 'fee_not_published' : 'level_not_offered',
          items: [],
          sessionTotal: 0,
          oneOffTotal: 0,
          total: 0,
          twoYearTotal: 0,
          lateSurchargeUnknown: false,
        });
        continue;
      }

      const items = [{
        label: `${resolvedLevel} × ${count}`,
        amount: perSubject * count,
        per: 'subject',
        unitAmount: perSubject,
      }];

      for (const fee of board.fixed_fees || []) {
        // A fixed fee with no published amount is skipped, never counted as 0.
        if (typeof fee.amount !== 'number' || !Number.isFinite(fee.amount)) continue;
        const multiplier = fee.per === 'subject' ? count : 1;
        items.push({
          label: fee.label,
          amount: fee.amount * multiplier,
          per: fee.per,
          unitAmount: fee.amount,
        });
      }

      const late = board.late_entry_surcharge;
      const lateAmountKnown = late && typeof late.amount === 'number' && Number.isFinite(late.amount);
      if (includeLate && lateAmountKnown) {
        items.push({
          label: `${late.stage} surcharge`,
          amount: late.amount * (late.per === 'subject' ? count : 1),
          per: late.per,
          unitAmount: late.amount,
        });
      }

      // "candidate" fees are charged once, ever; everything else recurs each session.
      const oneOffTotal = items.filter((i) => i.per === 'candidate')
        .reduce((s, i) => s + i.amount, 0);
      const sessionTotal = items.filter((i) => i.per !== 'candidate')
        .reduce((s, i) => s + i.amount, 0);

      boards.push({
        ...base,
        supported: true,
        reason: null,
        items,
        sessionTotal,
        oneOffTotal,
        total: sessionTotal + oneOffTotal,
        twoYearTotal: sessionTotal * SESSIONS_PER_TWO_YEARS + oneOffTotal,
        lateSurchargeUnknown: !!includeLate && !lateAmountKnown,
      });
    }

    if (!boards.length) errors.push('no_known_boards');
  }

  const costable = boards.filter((b) => b.supported);

  return {
    level: resolvedLevel,
    subjects: Number.isFinite(count) ? count : null,
    currency: dataset.currency || 'PKR',
    asOf: dataset.as_of,
    isFixture: isFixture(dataset),
    includeLate: !!includeLate,
    city: city || null,
    sessionsPerTwoYears: SESSIONS_PER_TWO_YEARS,
    boards,
    /** False when not one board published a real number — the reply must say so. */
    anyCostable: costable.length > 0,
    errors,
  };
}

// ── Deadlines ────────────────────────────────────────────────────────────────

/**
 * Upcoming deadlines for a board, soonest first, each with `daysUntil` and an
 * `urgent` flag (≤ 21 days out).
 *
 * The window is decided at CALL time from `now`, never baked into a schedule —
 * the same rule bot/workers/brief.worker.js follows for "which brief is today".
 * A cron that fires late, twice, or in the wrong timezone therefore cannot send
 * a stale "deadline is coming" for a date that has already passed.
 *
 * Rows with a null/unparseable `date` are DROPPED (three BISE boards have a
 * known session but no published date) rather than rendered as "Invalid Date".
 * Rows whose `confidence` is "estimated" are marked `estimated: true` so the
 * formatter can tag them on their face.
 *
 * @param {string|null} boardId  a board id/alias, or null/'all' for every board
 * @param {Date|string} [now]
 * @param {object} [opts.deadlines]  an already-loaded deadline dataset
 */
function nextDeadlines(boardId, now = new Date(), { deadlines } = {}) {
  const data = deadlines || loadDeadlines();
  const today = now instanceof Date ? now : new Date(now);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const wanted = !boardId || boardId === 'all' ? null : resolveBoardIds(boardId)[0] || boardId;

  return (data.deadlines || [])
    .filter((d) => (wanted ? d.board === wanted : true))
    .filter((d) => typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.date))
    .map((d) => {
      const at = new Date(`${d.date.slice(0, 10)}T00:00:00Z`).getTime();
      const daysUntil = Math.round((at - startOfToday) / MS_PER_DAY);
      return {
        ...d,
        daysUntil,
        urgent: daysUntil >= 0 && daysUntil <= URGENT_WINDOW_DAYS,
        estimated: d.confidence === 'estimated',
      };
    })
    .filter((d) => Number.isFinite(d.daysUntil) && d.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Deadlines exactly `leadDays` away — the reminder trigger. Same "decide at run
 * time" rule as nextDeadlines: a run computes the day count from `now` rather
 * than trusting that it fired on the day it was scheduled for.
 */
function deadlinesDueForReminder(boardId, now = new Date(), leadDays = REMINDER_LEAD_DAYS) {
  return nextDeadlines(boardId, now).filter((d) => leadDays.includes(d.daysUntil));
}

// ── Replies ──────────────────────────────────────────────────────────────────

/** Usage help — also the reply when a natural-language "exam fee" question arrives. */
function formatUsage(language = 'en') {
  const fees = loadFees();
  const L = labelsFor(language);
  return [
    `📊 ${L.heading}`,
    '',
    'Send:',
    '• cost "O Level" 6 cambridge,aku-eb Karachi',
    '• deadlines cambridge',
    '• remind me cambridge   (stop reminders)',
    '',
    `Boards: ${boardIds(fees).join(', ')}`,
    `Levels: ${datasetLevels(fees).join(', ')}`,
  ].join('\n');
}

/** One board block, as an array of lines. */
function boardBlock(board, result, L) {
  const cur = result.currency;
  const lines = [`*${board.name}*`];

  if (board.supported) {
    for (const item of board.items) {
      const suffix = item.per === 'candidate' ? ` (${L.oneOff})` : '';
      lines.push(`• ${item.label}: ${formatCurrency(item.amount, cur)}${suffix}`);
    }
    lines.push(`${L.perSession}: ${formatCurrency(board.total, cur)}`);
    lines.push(`${L.twoYearTotal}: ${formatCurrency(board.twoYearTotal, cur)}`);
    if (board.lateSurchargeUnknown) lines.push(`⚠️ ${L.lateUnknown}`);
    if (board.cityAvailable === false) {
      lines.push(`⚠️ No listed centre in ${result.city}`);
    }
    return lines;
  }

  // Never a number here — an unpublished fee is not zero.
  if (board.reason === 'level_not_offered') {
    lines.push(`${result.level} ${L.notListed} — ${L.offers}: ${board.levels.join(', ')}`);
  } else {
    lines.push(`${L.notPublished} (${result.level}) — ${L.seeNotes}`);
  }
  if (board.notes) lines.push(`ℹ️ ${board.notes}`);
  return lines;
}

/** The WhatsApp-friendly cost reply: one block per board, plain text, ≤ 1500 chars. */
function formatEstimateReply(result, language = 'en') {
  const L = labelsFor(language);
  if (result.errors && result.errors.length) return formatUsage(language);

  const head = [
    `📊 ${L.heading} — ${result.level}, ${result.subjects} ${L.subjects}`
    + `${result.city ? ` · ${result.city}` : ''}`,
  ];

  // Only boards with a real number are ranked; the rest keep dataset order so
  // the reply reads the same way twice.
  const costable = result.boards.filter((b) => b.supported)
    .sort((a, b) => a.twoYearTotal - b.twoYearTotal);
  const uncostable = result.boards.filter((b) => !b.supported);

  const body = [];
  if (!result.anyCostable) body.push('', `⚠️ ${L.noneKnown}`);
  for (const board of [...costable, ...uncostable]) {
    body.push('', ...boardBlock(board, result, L));
  }

  const footer = [''];
  footer.push(result.isFixture
    ? `⚠️ ${L.estimate} · as_of ${result.asOf} (FIXTURE data)`
    : `ℹ️ ${L.estimate} · as_of ${result.asOf}`);
  if (!result.anyCostable) footer.push(`${L.fullCalculator}: ${CALCULATOR_URL}`);

  const headText = head.join('\n');
  const footText = footer.join('\n');
  // The footer carries the estimate warning and, when nothing could be costed,
  // the calculator link — so it is reserved out of the budget rather than being
  // the first thing a clamp drops.
  const bodyText = clampLines(body, MAX_REPLY_CHARS - headText.length - footText.length - 2).text;

  return `${headText}\n${bodyText}\n${footText}`;
}

/** The WhatsApp-friendly deadline reply. */
function formatDeadlinesReply(deadlines, language = 'en', { asOf } = {}) {
  const L = labelsFor(language);
  const stamp = asOf !== undefined ? asOf : loadDeadlines().as_of;

  if (!deadlines.length) {
    return `${L.nextDeadline}: —\nNo upcoming dated deadlines in the dataset (as_of: ${stamp}).`;
  }

  const head = [`🗓️ ${L.nextDeadline}`];
  const body = [];
  for (const d of deadlines) {
    const flag = d.urgent ? ` ⚠️ ${L.urgent}` : '';
    const tag = d.estimated || d.confidence === 'estimated' ? ' (estimated)' : '';
    body.push('');
    body.push(`*${d.board}* — ${d.session} (${d.stage})${tag}`);
    body.push(`${d.date} · ${d.daysUntil} days${flag}`);
    // fee_impact is a number in a fixture and a prose sentence in the real
    // dataset — render whichever shape arrived, and never invent one.
    if (typeof d.fee_impact === 'number') {
      body.push(`+${formatCurrency(d.fee_impact)}/subject if you miss it`);
    } else if (typeof d.fee_impact === 'string' && d.fee_impact.trim()) {
      body.push(`💸 ${trimNotes(d.fee_impact)}`);
    }
    body.push(`confidence: ${d.confidence}`);
  }

  // Reserved out of the budget, same as the cost reply's footer, so a clamp
  // cannot drop the as_of stamp.
  const footText = ['', stamp === 'FIXTURE'
    ? `⚠️ ${L.estimate} · as_of ${stamp} (FIXTURE data)`
    : `as_of ${stamp}`].join('\n');

  const headText = head.join('\n');
  const bodyText = clampLines(body, MAX_REPLY_CHARS - headText.length - footText.length - 2).text;
  return `${headText}\n${bodyText}\n${footText}`;
}

/** One reminder message for one deadline. */
function formatReminderMessage(deadline, language = 'en') {
  const L = labelsFor(language);
  const tag = deadline.estimated || deadline.confidence === 'estimated' ? ' (estimated)' : '';

  let impact = '';
  if (typeof deadline.fee_impact === 'number') {
    impact = `\nMiss it and the ${deadline.stage} fee adds ${formatCurrency(deadline.fee_impact)}/subject.`;
  } else if (typeof deadline.fee_impact === 'string' && deadline.fee_impact.trim()) {
    impact = `\n💸 ${trimNotes(deadline.fee_impact)}`;
  }

  const lines = [
    `🗓️ ${L.nextDeadline}: ${deadline.board} — ${deadline.session} (${deadline.stage})${tag}`,
    `${deadline.date} · in ${deadline.daysUntil} days.${impact}`,
    '',
    'Reply "stop reminders" any time.',
  ];
  return clampLines(lines, MAX_REPLY_CHARS).text;
}

module.exports = {
  // constants worth asserting on / reusing
  SESSIONS_PER_TWO_YEARS,
  URGENT_WINDOW_DAYS,
  REMINDER_LEAD_DAYS,
  MAX_REPLY_CHARS,
  NOTES_CHARS,
  CALCULATOR_URL,
  DEFAULT_DATA_DIR,
  LABELS,
  // data + data-source control
  useDataDir,
  resetDataDir,
  dataDir,
  loadFees,
  loadDeadlines,
  isFixture,
  boardIds,
  datasetLevels,
  resolveBoardIds,
  resolveLevel,
  boardOffersLevel,
  boardPerSubjectFee,
  // maths
  estimate,
  nextDeadlines,
  deadlinesDueForReminder,
  // formatting
  formatAmount,
  formatCurrency,
  trimNotes,
  notesExcerpt,
  formatUsage,
  formatEstimateReply,
  formatDeadlinesReply,
  formatReminderMessage,
};
