'use strict';
/**
 * command-words.js — the one list of Rumi's text commands.
 *
 * Element (the Matrix client) swallows anything starting with "/" as one of
 * its own client commands, so on Matrix a teacher cannot type "/quiz" at all.
 * Every command therefore also works as the bare word on every channel, and on
 * Matrix Rumi's own copy names the bare word. Pure module: no IO to mock.
 */

const {
  normalizeCommand,
  isCommandText,
  channelCommandCopy,
  COMMAND_WORDS,
} = require('../../bot/shared/services/messaging/command-words');

const WA = '15550001234';
const MATRIX = 'matrix:@teacher:example.org';
const MTX = 'mtx:15550001234';
const SLACK = 'slack:U0TEACHER';

describe('normalizeCommand — a bare command word is the slash command', () => {
  test.each([
    ['menu', '/menu'],
    ['Menu', '/menu'],
    ['  MENU  ', '/menu'],
    ['menu.', '/menu'],
    ['menu!', '/menu'],
    ['register', '/register'],
    ['language', '/language'],
    ['settings', '/settings'],
    ['status', '/status'],
    ['portal', '/portal'],
    ['quiz', '/quiz'],
    ['video', '/video'],
    ['reading test', '/reading test'],
    ['Reading  Test', '/reading test'],
    ['readingtest', '/readingtest'],
    ['testpaper', '/testpaper'],
    ['test paper', '/test paper'],
    ['mypapers', '/mypapers'],
    ['my papers', '/my papers'],
    ['homework', '/homework'],
    ['editclass', '/editclass'],
    ['addclass', '/addclass'],
    ['attendance', '/attendance'],
    ['observe', '/observe'],
    ['checkexam', '/checkexam'],
  ])('%j → %j on every channel', (input, expected) => {
    for (const from of [WA, MATRIX, MTX, SLACK]) {
      expect(normalizeCommand(input, from)).toBe(expected);
    }
  });

  test('a message that already starts with "/" is never touched', () => {
    expect(normalizeCommand('/menu', MATRIX)).toBe('/menu');
    expect(normalizeCommand('/quiz fractions', WA)).toBe('/quiz fractions');
    expect(normalizeCommand('/Reading Test', MATRIX)).toBe('/Reading Test');
  });

  test('ordinary sentences that merely contain a command word stay text', () => {
    for (const from of [WA, MATRIX]) {
      expect(normalizeCommand('menu items for lunch', from)).toBe('menu items for lunch');
      expect(normalizeCommand('what is on the menu', from)).toBe('what is on the menu');
      expect(normalizeCommand('my status is busy', from)).toBe('my status is busy');
      expect(normalizeCommand('video of my class', from)).toBe('video of my class');
      expect(normalizeCommand('register of attendance', from)).toBe('register of attendance');
    }
  });

  test('words that collide with ordinary replies are not bare commands (slash form only)', () => {
    for (const from of [WA, MATRIX]) {
      expect(normalizeCommand('paper', from)).toBe('paper');
      expect(normalizeCommand('exam', from)).toBe('exam');
      expect(normalizeCommand('exams', from)).toBe('exams');
      expect(normalizeCommand('grade', from)).toBe('grade');
    }
  });

  test('empty and non-string input come back unchanged', () => {
    expect(normalizeCommand('', MATRIX)).toBe('');
    expect(normalizeCommand(null, MATRIX)).toBe(null);
    expect(normalizeCommand(undefined, WA)).toBe(undefined);
  });

  describe('a bare command with an argument — Matrix only, where the slash form cannot be typed', () => {
    test('"quiz <topic>" on Matrix is "/quiz <topic>", the form Rumi\'s copy tells people to send', () => {
      expect(normalizeCommand('quiz fractions', MATRIX)).toBe('/quiz fractions');
      expect(normalizeCommand('Quiz the water cycle', MTX)).toBe('/quiz the water cycle');
      expect(normalizeCommand('quiz fractions.', MATRIX)).toBe('/quiz fractions');
    });

    test('on WhatsApp/Slack/Discord a bare word with an argument is left as it is today', () => {
      expect(normalizeCommand('quiz fractions', WA)).toBe('quiz fractions');
      expect(normalizeCommand('quiz fractions', SLACK)).toBe('quiz fractions');
    });

    test('"quiz please" asks for the menu, not a quiz on the topic "please"', () => {
      expect(normalizeCommand('quiz please', MATRIX)).toBe('/quiz');
      expect(normalizeCommand('quiz dikhao', MATRIX)).toBe('/quiz');
    });

    test('a sentence ABOUT a quiz is not a topic', () => {
      expect(normalizeCommand('quiz was great today', MATRIX)).toBe('quiz was great today');
      expect(normalizeCommand('quiz results', MATRIX)).toBe('quiz results');
      expect(normalizeCommand('quiz on fractions?', MATRIX)).toBe('quiz on fractions?');
    });

    test('commands whose copy never asks for an argument do not take one, even on Matrix', () => {
      expect(normalizeCommand('video of my class', MATRIX)).toBe('video of my class');
      expect(normalizeCommand('status update', MATRIX)).toBe('status update');
      expect(normalizeCommand('portal login', MATRIX)).toBe('portal login');
      expect(normalizeCommand('testpaper science', MATRIX)).toBe('testpaper science');
      expect(normalizeCommand('observe tomorrow', MATRIX)).toBe('observe tomorrow');
    });
  });
});

describe('isCommandText — the "is this a command?" guard', () => {
  test('a slash command, on any channel', () => {
    expect(isCommandText('/anything', WA)).toBe(true);
    expect(isCommandText('  /menu', MATRIX)).toBe(true);
  });

  test('a bare command word, on any channel', () => {
    expect(isCommandText('menu', WA)).toBe(true);
    expect(isCommandText('Quiz', MATRIX)).toBe(true);
    expect(isCommandText('my papers', SLACK)).toBe(true);
  });

  test('a bare command with an argument only on Matrix', () => {
    expect(isCommandText('quiz fractions', MATRIX)).toBe(true);
    expect(isCommandText('quiz fractions', WA)).toBe(false);
  });

  test('ordinary text is not a command', () => {
    expect(isCommandText('menu items for lunch', MATRIX)).toBe(false);
    expect(isCommandText('Ayesha Khan', MATRIX)).toBe(false);
    expect(isCommandText('2', MATRIX)).toBe(false);
    expect(isCommandText('', MATRIX)).toBe(false);
    expect(isCommandText(null, WA)).toBe(false);
  });
});

describe('channelCommandCopy — on Matrix, Rumi names the form that works there', () => {
  test('"type /quiz" becomes "type quiz" on Matrix', () => {
    expect(channelCommandCopy('Type /quiz to start a new quiz.', MATRIX)).toBe('Type quiz to start a new quiz.');
    expect(channelCommandCopy('Type /menu anytime', MTX)).toBe('Type menu anytime');
  });

  test('every known command, multi-word ones included', () => {
    expect(channelCommandCopy('Send /reading test to start.', MATRIX)).toBe('Send reading test to start.');
    expect(channelCommandCopy('/readingtest, /testpaper, /my papers, /mypapers', MATRIX))
      .toBe('readingtest, testpaper, my papers, mypapers');
    expect(channelCommandCopy('/register /language /settings /status /portal /video /homework', MATRIX))
      .toBe('register language settings status portal video homework');
    expect(channelCommandCopy('/editclass /addclass /attendance /observe /checkexam', MATRIX))
      .toBe('editclass addclass attendance observe checkexam');
  });

  test('the argument example works as written on Matrix', () => {
    expect(channelCommandCopy('for example: /quiz fractions', MATRIX)).toBe('for example: quiz fractions');
  });

  test('bold, italic, code, quotes, parentheses and the Urdu isolate form', () => {
    expect(channelCommandCopy('Type */quiz* now', MATRIX)).toBe('Type *quiz* now');
    expect(channelCommandCopy('_/menu_', MATRIX)).toBe('_menu_');
    expect(channelCommandCopy('send `/status`', MATRIX)).toBe('send `status`');
    expect(channelCommandCopy('say "/menu" or (/video)', MATRIX)).toBe('say "menu" or (video)');
    expect(channelCommandCopy('ٹائپ کریں ⁦/quiz⁩ دوبارہ', MATRIX)).toBe('ٹائپ کریں ⁦quiz⁩ دوبارہ');
    expect(channelCommandCopy('⁦/quiz fractions⁩', MATRIX)).toBe('⁦quiz fractions⁩');
  });

  test('never inside a URL or a path', () => {
    const url = 'Open https://portal.example.org/portal/login or https://x.example/menu';
    expect(channelCommandCopy(url, MATRIX)).toBe(url);
    expect(channelCommandCopy('see docs/quiz and a/status', MATRIX)).toBe('see docs/quiz and a/status');
  });

  test('only known commands, and only the whole word', () => {
    expect(channelCommandCopy('/quizzes /menus /observer /unknown', MATRIX)).toBe('/quizzes /menus /observer /unknown');
    expect(channelCommandCopy('/portal/login', MATRIX)).toBe('/portal/login');
  });

  test('slash-only spellings stay as they are (their bare word is not a command)', () => {
    expect(channelCommandCopy('/paper /exam /grade', MATRIX)).toBe('/paper /exam /grade');
  });

  test('identity on WhatsApp, Slack and Discord', () => {
    const text = 'Type /quiz to start, or */menu*.';
    expect(channelCommandCopy(text, WA)).toBe(text);
    expect(channelCommandCopy(text, SLACK)).toBe(text);
    expect(channelCommandCopy(text, 'discord:1555')).toBe(text);
  });

  test('non-string input passes through', () => {
    expect(channelCommandCopy(undefined, MATRIX)).toBe(undefined);
    expect(channelCommandCopy('', MATRIX)).toBe('');
  });
});

describe('COMMAND_WORDS', () => {
  test('every bare word normalises to its own slash form', () => {
    for (const word of COMMAND_WORDS) {
      expect(normalizeCommand(word, WA)).toBe(`/${word}`);
    }
  });
});
