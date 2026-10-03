'use strict';
/**
 * FeatureRegistrationService.looksLikeNameReply / isDeclineReply: does a
 * reply to "what should I call you?" read as an answer at all? On Matrix the
 * question is offered unasked, so a teacher who ignores it and asks something
 * must be answered, not registered under the first word of their question.
 * Both are pure; nothing is mocked beyond the logger.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
const Svc = require('../../bot/shared/services/feature-registration.service');

describe('looksLikeNameReply', () => {
  test.each([
    'Ayesha',
    'Ayesha Khan',
    'Ayesha.',
    'Mary-Jane',
    'my name is Ayesha',
    "I'm Ayesha",
    'I am Ayesha',
    'call me Ayesha',
    'Hi, I\'m Ayesha',
    'Hello, my name is Noor',
    'mera naam Ayesha hai',
    'Salam',
    'Hi',
    'عائشہ',
  ])('"%s" is a name reply', (text) => {
    expect(Svc.looksLikeNameReply(text)).toBe(true);
  });

  test.each([
    'How do I teach fractions to grade 3?',
    'What can you do',
    'help',
    'make a lesson plan on plants',
    'please give me a quiz',
    'lesson plan',
    'I need a quiz',
    'I want a video',
    'quiz',
    'register',
    'grade 3',
    'Can you help',
    'ok',
    'thanks',
    'null',
    '/menu',
    '',
    "I'm looking for a lesson plan on photosynthesis for my class",
    "I'm fine",
    'Hello Rumi',
    'Hi there',
    'teach me something new today please',
  ])('"%s" is not a name reply', (text) => {
    expect(Svc.looksLikeNameReply(text)).toBe(false);
  });
});

describe('isDeclineReply', () => {
  test.each(['no', 'No thanks', 'no thank you', 'later', 'maybe later', 'skip', 'not now', 'Not now.', 'nahi', 'baad mein'])(
    '"%s" declines', (text) => {
      expect(Svc.isDeclineReply(text)).toBe(true);
    },
  );

  test.each(['Ayesha', 'Noor', 'no idea how to teach fractions', 'yes', 'How do I teach fractions?'])(
    '"%s" does not decline', (text) => {
      expect(Svc.isDeclineReply(text)).toBe(false);
    },
  );
});
