/**
 * A spoken lesson-plan / presentation request on a deployment that cannot make
 * one (no GAMMA_API_KEY): the REAL handleVoiceMessage (voice-message.handler.js)
 * says so plainly after intent detection (lesson-plan-availability.js) — no
 * spoken "I'm preparing it…", no loading sticker, no queued job, no model call.
 *
 * Mocked at the boundary: the messaging facade, the audio service (conversion,
 * ASR, TTS), object storage, the database, the language cache and detector,
 * Redis (absent), the LLM service, the lesson-plan queue, the routing services
 * ahead of Step 5 (observe, registration, attendance, comprehension) and the logger.
 */

const fs = require('fs');
const os = require('os');

const FROM = '15550100061';
const TEACHER = {
  id: '00000000-0000-4000-8000-0000000000e1',
  phone_number: FROM,
  first_name: 'Sam',
  preferred_language: 'en',
  registration_completed: true,
};
const TRANSCRIPTION = 'Please make me a lesson plan on adjectives for grade 3';

const ENV_KEYS = ['GAMMA_API_KEY', 'OPENROUTER_API_KEY', 'OBSERVE_ENABLED', 'COACHING_MIN_AUDIO_SECONDS'];
const saved = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  jest.resetModules();
});

function inert(explicit = {}) {
  return new Proxy(explicit, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then' || prop === '__esModule') return undefined;
      target[prop] = jest.fn().mockResolvedValue(null);
      return target[prop];
    },
  });
}

// A supabase query that finds nothing, whatever the chain.
function emptyQuery() {
  const result = { data: null, error: null };
  const chain = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      if (typeof prop === 'symbol') return undefined;
      return () => chain;
    },
  });
  return chain;
}

describe('voice note asking for a lesson plan (handleVoiceMessage)', () => {
  let WA;
  let OpenAI;
  let Audio;
  let LessonPlanQueue;
  let Queue;
  let handleVoiceMessage;

  function load({ intent, gamma }) {
    jest.resetModules();
    process.env.OPENROUTER_API_KEY = 'test-key';
    if (gamma) process.env.GAMMA_API_KEY = 'test-gamma-key';

    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), LOGS_DIR: '/tmp' }));
    jest.doMock('../../bot/shared/utils/constants', () => ({
      ...jest.requireActual('../../bot/shared/utils/constants'),
      TEMP_DIR: os.tmpdir(),
    }));
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => inert({
      isAvailable: () => false, set: jest.fn().mockResolvedValue(false), get: jest.fn().mockResolvedValue(null), delete: jest.fn().mockResolvedValue(true), redis: inert(),
    }));
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn(() => emptyQuery()), rpc: jest.fn(() => emptyQuery()) }));
    jest.doMock('../../bot/shared/database/bot-helpers', () => inert({
      getOrCreateSession: jest.fn().mockResolvedValue('session-1'),
      updateSessionType: jest.fn().mockResolvedValue(true),
      storeConversation: jest.fn().mockResolvedValue(true),
      storeAudioSession: jest.fn().mockResolvedValue(true),
    }));
    jest.doMock('../../bot/shared/storage/r2', () => ({
      uploadAudio: jest.fn().mockResolvedValue(null), isR2Configured: jest.fn(() => false),
    }));
    jest.doMock('../../bot/shared/utils/language-cache', () => inert({
      getUserLanguage: jest.fn().mockResolvedValue('en'), setUserLanguage: jest.fn(), setLanguageLock: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/language-detector.service', () => inert({
      getConfirmedLanguage: jest.fn().mockResolvedValue('en'),
    }));

    WA = inert({
      startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
      getMediaInfo: jest.fn().mockResolvedValue({ mime_type: 'audio/ogg', voice: { duration: 9 } }),
      downloadMedia: jest.fn().mockResolvedValue(Buffer.from('fake-ogg-audio')),
      sendMessage: jest.fn().mockResolvedValue(true),
      sendAudio: jest.fn().mockResolvedValue(true),
      sendSticker: jest.fn().mockResolvedValue(true),
    });
    jest.doMock('../../bot/shared/services/whatsapp.service', () => WA);

    Audio = inert({
      // The handler unlinks the WAV after ASR, so the "conversion" leaves a file.
      convertToWav: jest.fn(async (_buf, wavPath) => { fs.writeFileSync(wavPath, 'wav'); return wavPath; }),
      getASREngine: jest.fn(() => 'soniox'),
      transcribeWithLanguagePreference: jest.fn().mockResolvedValue({ text: TRANSCRIPTION, language: 'en', engine: 'soniox' }),
      generateSpeechForLanguage: jest.fn().mockResolvedValue(Buffer.from('fake-speech')),
      getAudioDuration: jest.fn().mockResolvedValue(9),
    });
    jest.doMock('../../bot/shared/services/audio.service', () => Audio);

    OpenAI = inert({
      detectIntent: jest.fn().mockResolvedValue({ type: intent }),
      getResponseWithFormat: jest.fn().mockResolvedValue("[warm] I'm preparing your lesson plan on adjectives."),
      extractTopic: jest.fn().mockResolvedValue('Adjectives'),
    });
    jest.doMock('../../bot/shared/services/openai.service', () => OpenAI);

    LessonPlanQueue = inert({ createAndQueue: jest.fn().mockResolvedValue('request-1') });
    jest.doMock('../../bot/shared/services/lesson-plan-queue.service', () => LessonPlanQueue);
    Queue = { queueJob: jest.fn().mockResolvedValue('job-1'), queueCoachingJob: jest.fn().mockResolvedValue('job-1') };
    jest.doMock('../../bot/shared/services/queue', () => Queue);

    // Routing ahead of Step 5: nothing pending, so the note falls through to intent detection.
    jest.doMock('../../bot/shared/services/observe/observe-audio-router', () => ({ routeLeaderAudio: jest.fn().mockResolvedValue(false) }));
    jest.doMock('../../bot/shared/services/feature-registration.service', () => inert({ isPendingName: jest.fn().mockResolvedValue(false) }));
    jest.doMock('../../bot/shared/services/attendance-conversation.service', () => inert({
      getSessionState: jest.fn().mockResolvedValue(null), STATES: { AWAITING_VOICE_INPUT: 'AWAITING_VOICE_INPUT' },
    }));
    jest.doMock('../../bot/shared/services/redis-comprehension.service', () => inert({
      findActiveFlowByUser: jest.fn().mockResolvedValue(null), abandonUserFlows: jest.fn().mockResolvedValue(0),
    }));
    jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => inert());
    jest.doMock('../../bot/shared/services/menu.service', () => inert());
    jest.doMock('../../bot/shared/services/video/video-orchestrator.service', () => inert());
    jest.doMock('../../bot/shared/services/content.service', () => inert());

    require('../../bot/shared/config/feature-availability').overrides.load(process.env);
    ({ handleVoiceMessage } = require('../../bot/shared/handlers/voice-message.handler'));
  }

  const speak = () => handleVoiceMessage(
    { id: 'wamid.voice-lp-1', from: FROM, type: 'audio', audio: { id: 'media-voice-1', mime_type: 'audio/ogg; codecs=opus', voice: true } },
    FROM,
    TEACHER,
  );
  const texts = () => WA.sendMessage.mock.calls.map((c) => c[1]);
  const queuedAnything = () => LessonPlanQueue.createAndQueue.mock.calls.length
    + Queue.queueJob.mock.calls.length + Queue.queueCoachingJob.mock.calls.length;

  function expectExplainedAndStopped() {
    expect(OpenAI.detectIntent).toHaveBeenCalledWith(TRANSCRIPTION);
    expect(texts()).toEqual([expect.stringMatching(/aren.t available on this service yet/)]);
    expect(WA.sendSticker).not.toHaveBeenCalled();
    expect(WA.sendAudio).not.toHaveBeenCalled();
    expect(OpenAI.getResponseWithFormat).not.toHaveBeenCalled();
    expect(OpenAI.extractTopic).not.toHaveBeenCalled();
    expect(queuedAnything()).toBe(0);
  }

  it('without GAMMA_API_KEY, a lesson-plan request is told plans are not available, and nothing else happens', async () => {
    load({ intent: 'lesson_plan', gamma: false });
    await speak();
    expectExplainedAndStopped();
  });

  it('without GAMMA_API_KEY, a presentation request is told the same', async () => {
    load({ intent: 'presentation', gamma: false });
    await speak();
    expectExplainedAndStopped();
  });

  it('with GAMMA_API_KEY, the request goes ahead: spoken reply, sticker, plan queued, no refusal', async () => {
    load({ intent: 'lesson_plan', gamma: true });
    await speak();
    expect(OpenAI.getResponseWithFormat).toHaveBeenCalledTimes(1);
    expect(WA.sendAudio).toHaveBeenCalledTimes(1);
    expect(WA.sendSticker).toHaveBeenCalledTimes(1);
    expect(LessonPlanQueue.createAndQueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: TEACHER.id, phoneNumber: FROM, topic: 'Adjectives', contentType: 'lesson_plan',
    }));
    expect(texts().some((t) => /aren.t available on this service yet/.test(t))).toBe(false);
  });
});
