'use strict';
/**
 * Rumi's text commands, as words — the one list of them.
 *
 * Element (the Matrix client) takes any message starting with "/" as one of
 * its OWN client commands and answers "Unrecognised command", so on Matrix
 * nobody can send "/quiz" to Rumi at all. So every command also works as the
 * bare word ("quiz", "reading test", "my papers") on every channel, and on
 * Matrix Rumi's copy names the bare word instead of the slash form.
 *
 *   normalizeCommand(text, from)   a bare command becomes its slash form, so the
 *                                  text handler's `=== '/menu'` checks and every
 *                                  "a slash command is never an answer" guard
 *                                  downstream work unchanged
 *   isCommandText(text, from)      the "is this a command?" guard for code that
 *                                  runs BEFORE the text handler (the inbound
 *                                  adapters' text-flow / numbered-menu checks)
 *   channelCommandCopy(text, to)   on Matrix, "/quiz" in outbound copy -> "quiz"
 *
 * Pure: no IO, no config. Depends only on channel-registry (data only) and the
 * pure quiz-menu-request, so anything may require it without a cycle.
 */

const { driverForIdentifier } = require('./channel-registry');
const { isQuizMenuRequest } = require('../quiz/quiz-menu-request');

/**
 * Every command whose BARE word is a command too. The slash form is always
 * `/${word}`, the exact text the handler (or the trigger module it calls)
 * matches.
 *
 * Left out on purpose — their slash form still works everywhere, but the bare
 * word alone is an ordinary reply far too often to be taken as a command:
 *   paper            "paper" answers "what should I make?" / a pasted list
 *   exam, exams      "exam" answers a test-paper question ("which kind?")
 *   grade            "grade" is half of "grade 4", a reply to every class question
 *   add-class, edit-class   hyphenated spellings nobody types bare; the
 *                    unhyphenated words below cover them
 * "checkexam" is kept: it is one made-up word nobody types by accident.
 */
const COMMAND_WORDS = Object.freeze([
  'menu', 'register', 'language', 'settings', 'status', 'portal',
  'quiz', 'video',
  'reading test', 'readingtest',
  'testpaper', 'test paper', 'mypapers', 'my papers',
  'homework', 'editclass', 'addclass', 'attendance',
  'observe', 'checkexam',
]);

/**
 * Commands that take an argument as a BARE word — only on Matrix, where the
 * slash form cannot be typed, and only where Rumi's own copy tells people to
 * add one ("Send /quiz with the topic ... for example: /quiz fractions"), so
 * that the Matrix form of that hint ("quiz fractions") does what it says.
 *
 * Not here, although their handlers accept an argument: /video (copy never
 * shows one, and "video of my class" is a sentence), /testpaper (likewise;
 * "testpaper science" is only ever in code comments), /portal, /status and
 * /observe (their argument is ignored). Off Matrix, "quiz fractions" is left
 * as it is today: the slash form is typeable there, and the lesson quiz's own
 * door decides what a bare "quiz ..." means.
 */
const MATRIX_ARG_COMMANDS = Object.freeze(['quiz']);

/**
 * A second word that makes "quiz ..." a sentence ABOUT a quiz, not a topic:
 * "quiz was great", "quiz results", "quiz time". A topic is a noun phrase
 * ("fractions", "the water cycle"), never one of these.
 */
const NOT_A_TOPIC = new Set([
  'is', 'was', 'were', 'are', 'am', 'be', 'been', 'did', 'does', 'do', 'has', 'have', 'had', 'will', 'would',
  'can', 'could', 'should', 'went', 'got', 'not', "isn't", "wasn't", "didn't", "doesn't",
  'result', 'results', 'score', 'scores', 'report', 'reports', 'answer', 'answers', 'time', 'done',
  'link', 'status', 'stop', 'finished', 'over',
]);

const isMatrix = (from) => driverForIdentifier(from) === 'matrix';

/** Lower case, inner spaces collapsed, a trailing "." or "!" (a phone keyboard's) dropped. */
function canonical(text) {
  return String(text).trim().replace(/[.!]+$/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The slash form of a bare command, or the text unchanged.
 * @param {string} text the message as typed
 * @param {string} from the sender's identifier (its channel decides the argument rule)
 * @returns {string}
 */
function normalizeCommand(text, from) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('/')) return text;

  const word = canonical(trimmed);
  if (COMMAND_WORDS.includes(word)) return `/${word}`;

  if (!isMatrix(from) || /\?\s*$/.test(trimmed)) return text;
  const body = trimmed.replace(/[.!]+$/, '').trim();
  const m = /^(\S+)\s+(.+)$/s.exec(body);
  if (!m) return text;
  const command = m[1].toLowerCase();
  if (!MATRIX_ARG_COMMANDS.includes(command)) return text;
  if (NOT_A_TOPIC.has(m[2].trim().split(/\s+/)[0].toLowerCase())) return text;
  // "quiz please" / "quiz dikhao" ask for the quiz menu; "please" is not a topic.
  if (command === 'quiz' && isQuizMenuRequest(body)) return '/quiz';
  // "quiz me on fractions" is a quiz on fractions: the lead-in is not the topic.
  const args = m[2].trim().replace(/^(?:me(?:\s+|$))?(?:(?:on|about)\s+)?/i, '').trim();
  return args ? `/${command} ${args}` : `/${command}`;
}

/**
 * Is this message a command — a slash command, or a bare one (per
 * normalizeCommand's rules for this channel)?
 */
function isCommandText(text, from) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  return normalizeCommand(trimmed, from) !== trimmed;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s');
// Longest first, so "/reading test" is never cut to "/reading".
const ALTERNATION = [...COMMAND_WORDS].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
// A "/command" counts only where a word starts: the start of the text, a space,
// a quote, a bracket, a formatting marker (* _ ~ `) or a Unicode bidi isolate
// (the Urdu copy wraps commands as ⁦/quiz⁩ to keep them left-to-right). After a
// letter, digit, "/" or "." it is part of a URL or a path and stays. It must
// end the word too: "/quizzes", "/observer" and "/portal/login" are not commands
// (a closing "_" or "*" is allowed: it is a formatting marker, "_/menu_").
const COPY_RE = new RegExp(
  `(^|[\\s"'“”‘’«»(\\[{*_~\`\\u2066-\\u2069\\u200E\\u200F])/(${ALTERNATION})(?![\\p{L}\\p{N}/-])`,
  'giu',
);

/**
 * Outbound copy in the form that works on the recipient's channel: on Matrix
 * "/quiz" becomes "quiz" (for Rumi's own commands only); every other channel
 * gets the text unchanged.
 * @param {string} text
 * @param {string} to the recipient's identifier
 * @returns {string}
 */
function channelCommandCopy(text, to) {
  if (typeof text !== 'string' || !text || !isMatrix(to)) return text;
  return text.replace(COPY_RE, '$1$2');
}

module.exports = {
  COMMAND_WORDS,
  MATRIX_ARG_COMMANDS,
  normalizeCommand,
  isCommandText,
  channelCommandCopy,
};
