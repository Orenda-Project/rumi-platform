'use strict';
/**
 * Pure, side-effect-free parser for the Cost Compass text commands.
 *
 * Same shape and rationale as homework-trigger.js / edit-class-trigger.js: the
 * decision lives in its own dependency-light module so it is unit-testable
 * without text-message.handler's full graph, and the handler stays a thin
 * dispatch site.
 *
 * Why not feature-keyword-detector.service.js: that service does exactly one
 * job — offer a pre-recorded INTRO VIDEO with explicit button consent, gated on
 * FEATURE_VIDEO_URLS + feature_intro state + a Redis cooldown. It routes
 * nothing. Cost Compass has no intro video and must answer the question
 * directly, so it uses the established *hot-trigger* mechanism (a pure
 * evaluate/parse module consulted inline by text-message.handler) rather than
 * bending the video-consent service into a router.
 *
 * Commands:
 *   cost <level> <n> [board,board] [city]   →  itemised estimate
 *   deadlines [board]                       →  upcoming registration dates
 *   remind me <board>                       →  opt in to deadline reminders
 *   stop reminders                          →  opt out of all of them
 * A leading "/" is accepted on every one (Slack strips "/"-prefixed text, so
 * the bare forms are the ones that work on every channel — same reason
 * "/status" grew its natural-language alternative).
 */

const ExamCostService = require('../services/exam-cost.service');

// Level spellings a parent might type, sorted longest-first at module load so
// "as level" is never consumed as the shorter "as" and "ssc-ii" is never
// consumed as "ssc-i". Covers both the Cambridge family and the Pakistani
// board families (AKU-EB's SSC-I/HSSC-II, BISE's "SSC (Matric)"); anything
// resolved here is handed to ExamCostService.resolveLevel, which prefers the
// live dataset's own spelling over this list.
const LEVEL_TOKENS = [
  'as level', 'a level', 'o level', 'as-level', 'a-level', 'o-level',
  'aslevel', 'alevel', 'olevel', 'igcse',
  'ssc (matric)', 'hssc (intermediate)',
  'hssc-i', 'hssc-ii', 'ssc-i', 'ssc-ii',
  'hssc i', 'hssc ii', 'ssc i', 'ssc ii',
  'intermediate', 'matric', 'inter', 'fsc',
  'as', 'al', 'ol',
].sort((a, b) => b.length - a.length);

const COST_RX = /^\/?\s*(?:cost|fees?)\b/i;
const DEADLINES_RX = /^\/?\s*deadlines?\b/i;
const REMIND_RX = /^\/?\s*remind(?:\s+me)?\b/i;
const STOP_RX = /^\/?\s*stop\s+reminders?\s*$/i;

// Natural-language ways in — a parent asking rather than typing a command.
// "cambridge fee", "exam fees", "o level cost", "what's the deadline".
const NL_COST_RX = /\b(?:exam|cambridge|caie|igcse|o[-\s]?level|a[-\s]?level|as[-\s]?level|aku[-\s]?eb|bise)\b[^\n]{0,40}\b(?:fee|fees|cost|costs|charges)\b/i;
const NL_COST_REVERSE_RX = /\b(?:fee|fees|cost|costs|charges)\b[^\n]{0,40}\b(?:exam|cambridge|caie|igcse|o[-\s]?level|a[-\s]?level|as[-\s]?level|aku[-\s]?eb|bise)\b/i;
const NL_DEADLINE_RX = /\b(?:deadline|deadlines|last date|entry date|registration date)\b/i;

const LATE_RX = /\blate\b/i;

/** Consume a level spelling (quoted or bare) off the front of `rest`. */
function takeLevel(rest) {
  const quoted = rest.match(/^\s*["“'']([^"”'']+)["”'']/);
  if (quoted) {
    return { level: ExamCostService.resolveLevel(quoted[1]), rest: rest.slice(quoted[0].length) };
  }
  const lower = rest.toLowerCase();
  for (const token of LEVEL_TOKENS) {
    const at = lower.indexOf(token, 0);
    const leading = lower.slice(0, at).trim();
    // Only accept the token at the start of what's left (ignoring whitespace).
    if (at >= 0 && leading === '') {
      return {
        level: ExamCostService.resolveLevel(token),
        rest: rest.slice(at + token.length),
      };
    }
  }
  return { level: null, rest };
}

/** Consume a comma-separated board list off the front of `rest`, if it resolves. */
function takeBoards(rest) {
  const m = rest.match(/^\s*([A-Za-z][A-Za-z0-9-]*(?:\s*,\s*[A-Za-z][A-Za-z0-9-]*)*)/);
  if (!m) return { boardIds: [], rest };
  const ids = ExamCostService.resolveBoardIds(m[1]);
  if (!ids.length) return { boardIds: [], rest };
  return { boardIds: ids, rest: rest.slice(m[0].length) };
}

/**
 * @param {string} messageBody
 * @returns {{match:false}}
 *        | {{match:true, type:'help'}}
 *        | {{match:true, type:'cost', level:string|null, subjects:number|null,
 *            boardIds:string[], city:string|null, includeLate:boolean}}
 *        | {{match:true, type:'deadlines', boardId:string|null}}
 *        | {{match:true, type:'remind', boardId:string|null}}
 *        | {{match:true, type:'stop_reminders'}}
 */
function parseExamCostCommand(messageBody) {
  const body = String(messageBody || '').trim();
  if (!body) return { match: false };

  if (STOP_RX.test(body)) return { match: true, type: 'stop_reminders' };

  if (REMIND_RX.test(body)) {
    const rest = body.replace(REMIND_RX, '').trim();
    const ids = ExamCostService.resolveBoardIds(rest);
    return { match: true, type: 'remind', boardId: ids[0] || null };
  }

  if (DEADLINES_RX.test(body) || NL_DEADLINE_RX.test(body)) {
    const rest = DEADLINES_RX.test(body) ? body.replace(DEADLINES_RX, '') : body;
    const ids = ExamCostService.resolveBoardIds(rest.replace(/[^A-Za-z0-9,\s-]/g, ' ').split(/\s+/));
    return { match: true, type: 'deadlines', boardId: ids[0] || null };
  }

  const isCommand = COST_RX.test(body);
  if (!isCommand && !NL_COST_RX.test(body) && !NL_COST_REVERSE_RX.test(body)) {
    return { match: false };
  }

  let rest = isCommand ? body.replace(COST_RX, '') : '';
  const includeLate = LATE_RX.test(body);
  if (includeLate) rest = rest.replace(LATE_RX, ' ');

  const lvl = takeLevel(rest);
  rest = lvl.rest;

  const num = rest.match(/^\s*(\d{1,2})\s*(?:subjects?)?/i);
  const subjects = num ? parseInt(num[1], 10) : null;
  if (num) rest = rest.slice(num[0].length);

  const boards = takeBoards(rest);
  rest = boards.rest;

  const city = rest.trim().replace(/^[,\s]+|[,\s.]+$/g, '') || null;

  // A natural-language question (or a command missing its arguments) can't be
  // costed — answer with usage rather than guessing a level or subject count.
  if (!lvl.level || !subjects) return { match: true, type: 'help' };

  return {
    match: true,
    type: 'cost',
    level: lvl.level,
    subjects,
    boardIds: boards.boardIds,
    city,
    includeLate,
  };
}

module.exports = {
  LEVEL_TOKENS,
  COST_RX,
  DEADLINES_RX,
  REMIND_RX,
  STOP_RX,
  parseExamCostCommand,
};
