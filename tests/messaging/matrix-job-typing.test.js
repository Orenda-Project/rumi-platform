/**
 * A teacher on Matrix who asks for a lesson plan gets the bot's "I'm preparing
 * it..." and then waits about two minutes while the worker writes it. The
 * worker holds "Rumi is typing…" in their room for as long as the job runs
 * (through the relay -- the worker never connects to Matrix itself); the
 * delivered plan, or the job's end, lets go. Jobs nobody is waiting on
 * (nudges, expiries) and every non-Matrix recipient are left alone: WhatsApp
 * needs the inbound message id for its typing call, and a Baileys worker owns
 * no socket.
 */

function load({ facade } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ runWithCorrelation: (id, fn) => fn(), generateCorrelationId: () => 'c', logEvent: jest.fn() }));
  const events = [];
  const controller = { stop: jest.fn(() => events.push('typing:stop')) };
  const messaging = facade || {
    sendMessage: jest.fn(),
    startContinuousTypingIndicator: jest.fn(() => { events.push('typing:start'); return controller; }),
  };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => messaging);
  const queue = {
    extendJobTimeout: jest.fn().mockResolvedValue(), extendQuizJobTimeout: jest.fn().mockResolvedValue(),
    queueJob: jest.fn(), completeJob: jest.fn().mockResolvedValue(), completeQuizJob: jest.fn().mockResolvedValue(),
  };
  jest.doMock('../../bot/shared/services/queue', () => queue);
  jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => ({}));
  jest.doMock('../../bot/workers/lesson-plan-extraction.worker', () => ({}));
  const lessonPlan = { process: jest.fn(async () => { events.push('job:run'); }) };
  jest.doMock('../../bot/workers/lesson-plan-generation.worker', () => lessonPlan);
  jest.doMock('../../bot/workers/video-generation.worker', () => ({}));
  jest.doMock('../../bot/workers/exam-grading.worker', () => ({}));
  const { SQSCoachingWorker } = require('../../bot/workers/sqs-worker');
  const worker = new SQSCoachingWorker('w-test');
  worker.handleJobFailure = jest.fn().mockResolvedValue();
  const run = async (jobType, payload) => {
    worker.processJob({ receiptHandle: `rh-${jobType}`, sourceQueue: 'main', body: { sessionId: 's1', jobType, payload } });
    await worker.activeJobs.get(`rh-${jobType}`);
  };
  return { worker, run, messaging, controller, events, lessonPlan };
}

afterEach(() => jest.resetModules());

it('a lesson plan for a Matrix teacher: typing held from before the job runs until it ends', async () => {
  const { run, messaging, events } = load();
  await run('lesson_plan_generation', { requestId: 'r1', phoneNumber: 'mtx:15550100001', topic: 'fractions' });
  expect(messaging.startContinuousTypingIndicator).toHaveBeenCalledWith('mtx:15550100001');
  expect(events).toEqual(['typing:start', 'job:run', 'typing:stop']);
});

it('the job\'s typing hold and everything the job sends are tagged with the same job', async () => {
  const { run, messaging, lessonPlan } = load();
  // eslint-disable-next-line global-require
  const jobOf = () => require('../../bot/shared/services/messaging/matrix-outbound-relay').currentJob();
  let heldFor;
  let sentFor;
  messaging.startContinuousTypingIndicator.mockImplementation(() => { heldFor = jobOf(); return { stop: jest.fn() }; });
  lessonPlan.process.mockImplementation(async () => { sentFor = jobOf(); });
  await run('lesson_plan_generation', { requestId: 'r1', phoneNumber: 'mtx:15550100001' });
  expect(heldFor).toMatch(/^lesson_plan_generation:/);
  expect(sentFor).toBe(heldFor);
});

it('a job that fails still lets the typing go', async () => {
  const { run, events, lessonPlan, worker } = load();
  lessonPlan.process.mockImplementation(async () => { events.push('job:run'); throw new Error('Gamma 500'); });
  await run('lesson_plan_generation', { requestId: 'r1', phoneNumber: 'matrix:@teacher:example.org' });
  expect(events).toEqual(['typing:start', 'job:run', 'typing:stop']);
  expect(worker.handleJobFailure).toHaveBeenCalled();
});

it('a WhatsApp recipient: no typing call from the worker', async () => {
  const { run, messaging, events } = load();
  await run('lesson_plan_generation', { requestId: 'r1', phoneNumber: '15550100001' });
  expect(messaging.startContinuousTypingIndicator).not.toHaveBeenCalled();
  expect(events).toEqual(['job:run']);
});

it('a typing call that throws never costs the job', async () => {
  const facade = { sendMessage: jest.fn(), startContinuousTypingIndicator: jest.fn(() => { throw new Error('Channel "matrix" is not running'); }) };
  const { run, events } = load({ facade });
  await run('lesson_plan_generation', { requestId: 'r1', phoneNumber: 'mtx:15550100001' });
  expect(events).toEqual(['job:run']);
});

describe('which jobs hold the typing', () => {
  // eslint-disable-next-line global-require
  const typingRecipientForJob = (...args) => require('../../bot/shared/services/messaging/job-typing').typingRecipientForJob(...args);

  it.each([
    ['lesson_plan_generation', { phoneNumber: 'mtx:15550100001' }],
    ['pic_lp_kieai_generation', { from: 'mtx:15550100001' }],
    ['testpaper_generate', { to: 'mtx:15550100001' }],
    ['testpaper_revise', { to: 'mtx:15550100001' }],
    ['quiz_generate', { phone: 'mtx:15550100001' }],
    ['homework_bundle_generation', { phone: 'mtx:15550100001' }],
  ])('%s -> the teacher who asked', (jobType, payload) => {
    expect(typingRecipientForJob(jobType, payload)).toBe('mtx:15550100001');
  });

  it.each(['quiz_nudge', 'quiz_expire', 'quiz_reminder', 'video_generation', 'transcription', 'observe_debrief'])(
    '%s -> nobody (no one is waiting on it right now)', (jobType) => {
      expect(typingRecipientForJob(jobType, { phone: 'mtx:15550100001', from: 'mtx:15550100001' })).toBeNull();
    },
  );

  it('a quiz job reads the v2 envelope\'s payload', () => {
    expect(typingRecipientForJob('quiz_generate', { payload: { phone: 'matrix:@t:example.org' } })).toBe('matrix:@t:example.org');
  });

  it('a non-Matrix recipient -> nobody', () => {
    expect(typingRecipientForJob('lesson_plan_generation', { phoneNumber: '15550100001' })).toBeNull();
    expect(typingRecipientForJob('lesson_plan_generation', { phoneNumber: 'slack:U0123' })).toBeNull();
    expect(typingRecipientForJob('lesson_plan_generation', {})).toBeNull();
  });
});
