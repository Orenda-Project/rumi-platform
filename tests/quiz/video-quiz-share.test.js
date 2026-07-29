'use strict';
/**
 * bd-2313..2316 — share-code parsing and minting.
 *
 * The parser runs on EVERY inbound text before any other routing, so its
 * precision matters more than most: a false positive hijacks an ordinary
 * message into a quiz, and a false negative leaves a child staring at a link
 * that did nothing.
 */
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: jest.fn(), set: jest.fn(), delete: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(), sendInteractiveButtons: jest.fn(),
}));

const share = require('../../bot/shared/services/quiz/video-quiz-share.service');

describe('share code parsing', () => {
  test('matches the code the wa.me link pre-fills', () => {
    expect(share.parseShareCode('QUIZ-A7K3M2')).toBe('A7K3M2');
  });

  test('matches case-insensitively but returns upper case', () => {
    expect(share.parseShareCode('quiz-a7k3m2')).toBe('A7K3M2');
  });

  test('finds the code when a child types around it', () => {
    expect(share.parseShareCode('hi QUIZ-A7K3M2 please')).toBe('A7K3M2');
  });

  test('does NOT claim ordinary messages', () => {
    ['quiz', 'I want a quiz', 'QUIZ-', 'QUIZ-ABC', 'send me QUIZZES',
     'my quiz-time is 4pm', ''].forEach((t) => {
      expect(share.parseShareCode(t)).toBeNull();
    });
  });

  test('does not match a longer alphanumeric run', () => {
    // A 7-char tail must not be silently truncated to 6 and accepted.
    expect(share.parseShareCode('QUIZ-A7K3M2X')).toBeNull();
  });
});

describe('generated codes', () => {
  test('are six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const c = share.randomCode();
      expect(c).toHaveLength(6);
      // O/0, I/1 and S/5 are excluded: a child may retype this off a
      // relative's screen, and a misread character is a dead link.
      expect(c).not.toMatch(/[OI01S5]/);
      expect(share.parseShareCode(`QUIZ-${c}`)).toBe(c);
    }
  });

  test('every generated code round-trips through the parser', () => {
    const c = share.randomCode();
    expect(share.parseShareCode(`https://wa.me/15550100000?text=QUIZ-${c}`)).toBe(c);
  });
});

describe('bot number for the link', () => {
  test('is digits only, so wa.me never receives a + or spaces', () => {
    expect(share.botNumber()).toMatch(/^\d+$/);
  });
});
