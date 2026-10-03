'use strict';
/**
 * The runaway guard: at most QUIZ_DAILY_CAP quizzes made per teacher per
 * school day, counted in the generate step before any model call, every source.
 *
 * The generate step runs for real; the network boundary is mocked (supabase,
 * WhatsApp, the queue, R2, the PDF renderer, Redis — whose one Lua call is
 * the counter, run on the cache service's ioredis client) and so are the
 * LLM-backed plan digest and author.
 */
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendDocument: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../bot/shared/services/queue/sqs-queue.service', () => ({ queueJob: jest.fn().mockResolvedValue('mid') }));
jest.mock('../../bot/shared/services/quiz/transcript-quiz-digest.service', () => ({
  ...jest.requireActual('../../bot/shared/services/quiz/transcript-quiz-digest.service'), run: jest.fn(),
}));
jest.mock('../../bot/shared/services/quiz/plan-quiz-digest.service', () => ({
  ...jest.requireActual('../../bot/shared/services/quiz/plan-quiz-digest.service'), run: jest.fn(),
}));
jest.mock('../../bot/shared/services/quiz/transcript-quiz-author.service', () => ({
  author: jest.fn(), excerptsFor: jest.fn().mockReturnValue('…'),
}));
jest.mock('../../bot/shared/services/quiz/video-quiz-share.service', () => ({
  mintCode: jest.fn().mockResolvedValue({ id: 'sc-new', code: 'NEW234', teacherName: 'Rifat Noor', topic: 'Carrying' }),
  botNumber: jest.fn().mockReturnValue('15550000000'),
  joinInvite: jest.fn(({ code }) => ({ kind: 'wa', link: `https://wa.me/15550000000?text=QUIZ-${code}`, bot: 'Rumi', code })),
}));
jest.mock('../../bot/shared/utils/html-to-pdf', () => ({ htmlToPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')) }));
jest.mock('../../bot/shared/storage/r2', () => ({
  isR2Configured: jest.fn(() => true),
  uploadBuffer: jest.fn(async (_b, key) => `https://r2/${key}`),
  downloadFromR2: jest.fn(async () => Buffer.from('png')),
  extractKeyFromUrl: jest.fn((url) => String(url).replace(/^https:\/\/r2\//, '')),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
const mockLocks = new Map();
const mockRedis = { available: true };
const mockEval = jest.fn();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  isAvailable: () => mockRedis.available,
  acquireLock: jest.fn(async (res, id) => { if (mockLocks.has(res)) return false; mockLocks.set(res, id); return true; }),
  releaseLock: jest.fn(async (res, id) => { if (mockLocks.get(res) !== id) return false; mockLocks.delete(res); return true; }),
  redis: { eval: (...a) => mockEval(...a) },
}));

const supabase = require('../../bot/shared/config/supabase');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const Author = require('../../bot/shared/services/quiz/transcript-quiz-author.service');
const PlanDigest = require('../../bot/shared/services/quiz/plan-quiz-digest.service');
const { logEvent } = require('../../bot/shared/utils/structured-logger');
const { installFrom } = require('./helpers/supabase-chain');
const Gen = require('../../bot/shared/services/quiz/transcript-quiz-generate.service');
const DailyCap = require('../../bot/shared/services/quiz/quiz-daily-cap');
const { UX_STRINGS } = require('../../bot/shared/config/ux-strings');
const { installAgreeingSolver } = require('./helpers/key-verify-agree');
const { installNoPictureRepair } = require('./helpers/no-picture-repair');

const QID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const PLAN_QUIZ = {
  id: QID, teacher_id: 'u-1', coaching_session_id: null, lesson_plan_id: PLAN_ID, quiz_source: 'lp_generated',
  topic: 'Add a 3-digit and a 2-digit number', subject: 'maths', language: 'en', status: 'generating', grade: '2',
  meta: { step: 'generating', source: 'quiz_menu', lessons: [{ lesson_plan_id: PLAN_ID }] },
};
const PLAN = {
  id: PLAN_ID, topic: 'Add a 3-digit and a 2-digit number', grade: '2', subject: 'maths', pdf_url: null,
  content: { plan_text: 'Objective: add a 3-digit and a 2-digit number, carrying a ten. '.repeat(10), source: 'gamma_pdf' },
};
const USER = { id: 'u-1', name: 'Rifat Noor', phone_number: '15550001234', preferred_language: 'en' };

const DIGEST = {
  topic: 'Adding with carrying', topic_as_taught: 'Adding with carrying', subject: 'maths', grade_band: '1-2', confidence: 0.9,
  taught_level: 'apply',
  slos: [{ id: 'S1', statement: 'a', statement_en: 'a', statement_ur: 'ا', taught_level: 'apply' },
    { id: 'S2', statement: 'b', statement_en: 'b', statement_ur: 'ب', taught_level: 'understand' }],
  key_terms: [], examples_used: ['146 + 27'], misconceptions_surfaced: [],
};

function goodQuestion(i, slo, level) {
  return {
    slo_id: slo, level, question: `Question ${i}: what is ${100 + i} + ${20 + i}?`,
    options: [`${120 + 2 * i}`, `${130 + 2 * i}`, `${110 + 2 * i}`], correct_index: 0,
    explanation: `Add the ones, then the tens: ${120 + 2 * i}.`,
    selected_because: `Question ${i} checks adding two numbers in columns.`,
    distractor_misconceptions: { 1: 'carried when no column reached ten', 2: 'dropped a ten' },
    option_feedback: { correct: 'Yes — ones first, then tens.', wrong: { 1: 'No column reached ten, so nothing carries.', 2: 'A ten was lost from the tens column.' } },
  };
}
const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => goodQuestion(i, i % 2 ? 'S1' : 'S2', i % 2 ? 'apply' : 'understand'));

beforeEach(() => {
  jest.clearAllMocks();
  mockLocks.clear();
  mockEval.mockReset();
  mockRedis.available = true;
  delete process.env.QUIZ_DAILY_CAP;
  delete process.env.SCHOOL_TIMEZONE;
  delete process.env.DAILY_QUIZ_CAP_UNREGISTERED;
  jest.spyOn(Gen, 'sleep').mockResolvedValue(undefined);
  installAgreeingSolver(Gen);
  installNoPictureRepair(Gen);
  PlanDigest.run.mockResolvedValue({ digest: DIGEST, grade: '2', gradeSource: 'quiz', lpHint: null, model: 'dm', costUsd: 0.002, latencyMs: 10 });
  Author.author.mockResolvedValue({ questions: EIGHT, model: 'm', costUsd: 0.01, latencyMs: 100, lessonSummary: 'Today\'s lesson plans column addition.' });
});
afterAll(() => { delete process.env.SCHOOL_TIMEZONE; });

function wire({ quiz = PLAN_QUIZ } = {}) {
  installFrom(supabase.from, ({
    quizzes: (calls) => (calls.some((c) => c[0] === 'update') ? { data: [{ id: QID }] } : { data: [quiz] }),
    lesson_plans: { data: [PLAN] },
    quiz_questions: (calls) => (calls.some((c) => c[0] === 'insert' || c[0] === 'delete') ? { data: null, error: null } : { data: [] }),
    users: { data: [USER] },
  }));
}
const quizUpdates = () => supabase.from.callsFor('quizzes').flat().filter((c) => c[0] === 'update').map((u) => u[1]);
// redis.eval(script, numKeys, ...keys, ...args)
const evalCall = (i = 0) => {
  const [script, nKeys, ...rest] = mockEval.mock.calls[i];
  return { script, keys: rest.slice(0, nKeys), args: rest.slice(nKeys) };
};

describe('the per-teacher daily cap', () => {
  test('over the cap: no model call, the quiz fails daily_cap and the teacher is told honestly', async () => {
    mockEval.mockResolvedValueOnce(-10);   // the 11th quiz today
    wire();
    const r = await Gen.process(QID, {});
    expect(r).toEqual({ failed: true, reason: 'daily_cap' });
    expect(PlanDigest.run).not.toHaveBeenCalled();
    expect(Author.author).not.toHaveBeenCalled();
    const failed = quizUpdates().find((u) => u.status === 'failed');
    expect(failed.meta.error).toBe('daily_cap');
    expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(USER.phone_number, UX_STRINGS.tqDailyCap.en);
    const ev = logEvent.mock.calls.find((c) => c[0] === 'transcript_quiz.failed');
    expect(ev[1]).toEqual(expect.objectContaining({ reason: 'daily_cap', count: 10, limit: 10 }));
  });

  test('the counter is keyed on the teacher and the school day and holds quiz ids (a redelivery never counts twice)', async () => {
    mockEval.mockResolvedValueOnce(3);
    wire();
    const r = await Gen.process(QID, {});
    expect(r.ok).toBe(true);
    const { script, keys, args } = evalCall();
    expect(script).toBe(DailyCap.CLAIM_LUA);
    expect(keys).toEqual([`quizcap:u-1:${DailyCap.schoolDate()}`]);
    expect(args[0]).toBe(QID);
    expect(args[1]).toBe(10);
  });

  test('the school day is SCHOOL_TIMEZONE\'s, not the server\'s', async () => {
    process.env.SCHOOL_TIMEZONE = 'Pacific/Kiritimati';   // UTC+14: always a day ahead of UTC late in the day
    const now = new Date('2026-03-04T12:00:00Z');
    expect(DailyCap.schoolDate(now)).toBe('2026-03-05');
    mockEval.mockResolvedValueOnce(1);
    await DailyCap.claim('u-1', QID, { now });
    expect(evalCall().keys).toEqual(['quizcap:u-1:2026-03-05']);
  });

  test('QUIZ_DAILY_CAP=off: nothing is counted', async () => {
    process.env.QUIZ_DAILY_CAP = 'off';
    wire();
    await Gen.process(QID, {});
    expect(mockEval).not.toHaveBeenCalled();
    expect(Author.author).toHaveBeenCalled();
  });

  test('QUIZ_DAILY_CAP=25 is the cap passed to the counter', async () => {
    process.env.QUIZ_DAILY_CAP = '25';
    mockEval.mockResolvedValueOnce(12);
    wire();
    await Gen.process(QID, {});
    expect(evalCall().args[1]).toBe(25);
  });

  test('an unregistered account gets DAILY_QUIZ_CAP_UNREGISTERED when it is lower (the smaller cap wins)', async () => {
    process.env.DAILY_QUIZ_CAP_UNREGISTERED = '2';
    mockEval.mockResolvedValueOnce(-2);   // the 3rd quiz today
    wire();   // USER has not finished registration
    const r = await Gen.process(QID, {});
    delete process.env.DAILY_QUIZ_CAP_UNREGISTERED;
    expect(evalCall().args[1]).toBe(2);
    expect(r).toEqual({ failed: true, reason: 'daily_cap' });
    expect(Author.author).not.toHaveBeenCalled();
    expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(USER.phone_number, UX_STRINGS.tqDailyCap.en);
  });

  test('a registered account keeps QUIZ_DAILY_CAP whatever DAILY_QUIZ_CAP_UNREGISTERED says', async () => {
    process.env.DAILY_QUIZ_CAP_UNREGISTERED = '2';
    mockEval.mockResolvedValueOnce(3);
    installFrom(supabase.from, ({
      quizzes: (calls) => (calls.some((c) => c[0] === 'update') ? { data: [{ id: QID }] } : { data: [PLAN_QUIZ] }),
      lesson_plans: { data: [PLAN] },
      quiz_questions: (calls) => (calls.some((c) => c[0] === 'insert' || c[0] === 'delete') ? { data: null, error: null } : { data: [] }),
      users: { data: [{ ...USER, registration_completed: true }] },
    }));
    await Gen.process(QID, {});
    delete process.env.DAILY_QUIZ_CAP_UNREGISTERED;
    expect(evalCall().args[1]).toBe(10);
  });

  test('Redis down: the quiz is made (the guard fails open)', async () => {
    mockRedis.available = false;
    wire();
    const r = await Gen.process(QID, {});
    expect(r.ok).toBe(true);
    expect(Author.author).toHaveBeenCalled();
  });

  test('a quiz resuming at the hand-off is not counted again', async () => {
    wire({ quiz: { ...PLAN_QUIZ, status: 'ready', meta: { ...PLAN_QUIZ.meta, step: 'ready', digest: DIGEST, question_count: 8 } } });
    await Gen.process(QID, {});
    expect(mockEval).not.toHaveBeenCalled();
  });

  test('the copy: en + ur, names the limit and tomorrow, no recording/transcript, gender-neutral', () => {
    const s = UX_STRINGS.tqDailyCap;
    expect(s.en).toMatch(/today/i);
    expect(s.en).toMatch(/tomorrow/i);
    expect(s.en).not.toMatch(/recording|transcript/i);
    expect(s.en).not.toMatch(/\b(she|her|he|his|him)\b/i);
    expect(s.ur).toMatch(/کل/);
    expect(s.ur).not.toMatch(/رہی|رہے ہوں|چکی ہیں|چکے ہیں|سکتی ہیں|سکتے ہیں/);
    expect([...s.en].length).toBeLessThanOrEqual(1024);
    expect([...s.ur].length).toBeLessThanOrEqual(1024);
  });
});
