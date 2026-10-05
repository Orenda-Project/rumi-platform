/**
 * Inbound audio must never be written to a path another call can share.
 *
 * Every inbound recording (a teacher's voice note, a comprehension answer, an
 * attendance roll call, a student's reading, a classroom recording, a coach's
 * debrief) is written to disk and then — after awaits — uploaded, converted,
 * probed or transcribed, and finally unlinked. When the path is built from the
 * clock alone (`audio_${Date.now()}.ogg`), two recordings that arrive in the
 * same millisecond share it: the second write overwrites the first, so the
 * first sender is transcribed with the second sender's words — or gets ENOENT
 * because the other call already unlinked "its" file. A path keyed by a record
 * id plus the clock is unique across users but not across two recordings for
 * the same record in one millisecond, so those are held to the same rule.
 *
 * This drives the LIVE code: the real handler and services write, convert and
 * read the files. Only the boundaries are faked — the speech-to-text upload
 * (which reads the file it is given only after a delay, like a real upload),
 * ffmpeg/ffprobe (which read the input and write the output over time), object
 * storage, the database and the chat channel. The clock is pinned so every call
 * lands in the same millisecond.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const NOW = 1790000000000;
const DELAY = 150; // how long a "network" read waits before opening the file
const A = '15550100201';
const B = '15550100202';

// Which caller a boundary call belongs to — propagated through every await.
const caller = new AsyncLocalStorage();
const bytesOf = (who) => Buffer.from(`voice note recorded by ${who}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let TEMP;
let received; // [{ who, site, bytes } | { who, site, error }]
let keptDirs = [];

function record(site, read) {
  const who = caller.getStore();
  try {
    received.push({ who, site, bytes: read() });
  } catch (error) {
    received.push({ who, site, error: error.message });
    throw error;
  }
}

beforeEach(() => {
  jest.resetModules();
  TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-inbound-audio-'));
  received = [];
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
  delete process.env.AZURE_SPEECH_KEY;
  fs.rmSync(TEMP, { recursive: true, force: true });
  for (const d of keptDirs) fs.rmSync(d, { recursive: true, force: true });
  keptDirs = [];
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

// A supabase query whose result depends only on the table.
function fakeSupabase(tables = {}) {
  const chain = (data) => {
    const result = { data, error: null };
    const c = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
        if (typeof prop === 'symbol') return undefined;
        return () => c;
      },
    });
    return c;
  };
  return {
    from: jest.fn((t) => chain(t in tables ? tables[t] : null)),
    rpc: jest.fn(() => chain(null)),
  };
}

function commonMocks() {
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), LOGS_DIR: '/tmp' }));
  jest.doMock('../../bot/shared/utils/constants', () => ({
    ...jest.requireActual('../../bot/shared/utils/constants'),
    TEMP_DIR: TEMP,
  }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => inert({
    isAvailable: () => false, get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(false),
  }));
  jest.doMock('../../bot/shared/services/coaching/diarization-health', () => ({ recordDiarization: jest.fn() }));
}

/**
 * The binary + network boundary under the REAL audio.service:
 *  - ffmpeg opens (truncates) its output, then writes the converted input bytes
 *    a little later — so two conversions to one output path interleave;
 *  - ffprobe reads the file after a delay;
 *  - the speech-to-text upload reads the file it was handed after a delay, and
 *    the transcript is whatever bytes it found.
 */
function installAudioBoundary() {
  const ffmpeg = require('fluent-ffmpeg');
  ffmpeg.mockImplementation((input) => {
    const handlers = {};
    const cmd = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        if (prop === 'on') return (event, cb) => { handlers[event] = cb; return cmd; };
        if (prop === 'save') {
          return (output) => {
            (async () => {
              try {
                await sleep(10);
                fs.writeFileSync(output, '');
                await sleep(DELAY);
                fs.appendFileSync(output, fs.readFileSync(input));
                handlers.end();
              } catch (err) {
                handlers.error(err);
              }
            })();
            return cmd;
          };
        }
        return () => cmd;
      },
    });
    return cmd;
  });
  ffmpeg.ffprobe.mockImplementation((file, cb) => {
    setTimeout(() => {
      let bytes;
      try { record('ffprobe', () => fs.readFileSync(file)); bytes = received[received.length - 1].bytes; } catch (err) { cb(err); return; }
      cb(null, { format: { duration: bytes.length } });
    }, DELAY);
  });

  const FormData = require('form-data');
  jest.spyOn(FormData.prototype, 'append').mockImplementation(function append(_k, value) {
    if (value && typeof value.on === 'function') { value.on('error', () => {}); value.destroy(); }
    this.file = value;
  });
  const axios = require('axios');
  const uploads = new Map();
  let n = 0;
  axios.post.mockImplementation(async (url, body) => {
    if (/\/v1\/files$/.test(url)) {
      await sleep(DELAY);
      record('stt', () => fs.readFileSync(body.file.path));
      const id = `file-${++n}`;
      uploads.set(id, received[received.length - 1].bytes);
      return { data: { id } };
    }
    return { data: {} };
  });
  const AudioService = require('../../bot/shared/services/audio.service');
  jest.spyOn(AudioService, '_attemptTranscription').mockImplementation(async (fileId) => ({
    text: `heard: ${uploads.get(fileId)}`, language: 'en', tokens: [],
  }));
  return AudioService;
}

// ── The voice-message handler ─────────────────────────────────────────────

const userFor = (who) => ({
  id: `00000000-0000-4000-8000-${who.slice(-12).padStart(12, '0')}`,
  phone_number: who, first_name: 'Sam', preferred_language: 'en', registration_completed: true,
});
const ONE_TEACHER = { ...userFor('15550100203') };

function loadHandler(route) {
  commonMocks();
  const tables = {};
  if (route === 'coaching') tables.coaching_sessions = { id: 'coaching-1', conversation_state: { current_state: 'q1' } };
  if (route === 'reading') {
    tables.reading_assessments = {
      id: 'assessment-1', status: 'passage_generated', audio_url: null, student_identifier: 'Student 7',
      created_at: new Date(NOW - 60 * 1000).toISOString(), language: 'en', grade_level: 3,
    };
  }
  jest.doMock('../../bot/shared/config/supabase', () => fakeSupabase(tables));
  jest.doMock('../../bot/shared/database/bot-helpers', () => inert({
    getOrCreateSession: jest.fn().mockResolvedValue('session-1'),
  }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    isR2Configured: jest.fn(() => route === 'reading'),
    uploadAudio: jest.fn(async (filePath) => {
      await sleep(DELAY);
      record('upload', () => fs.readFileSync(filePath));
      return 'https://bucket.example.org/audio/note.ogg';
    }),
  }));
  jest.doMock('../../bot/shared/utils/language-cache', () => inert({ getUserLanguage: jest.fn().mockResolvedValue('en') }));
  jest.doMock('../../bot/shared/services/language-detector.service', () => inert({
    getConfirmedLanguage: jest.fn().mockResolvedValue('en'),
  }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => inert({
    startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
    getMediaInfo: jest.fn().mockResolvedValue({ mime_type: 'audio/ogg', voice: { duration: 9 } }),
    downloadMedia: jest.fn(async () => bytesOf(caller.getStore())),
    sendMessage: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../../bot/shared/services/openai.service', () => inert({ detectIntent: jest.fn().mockResolvedValue({ type: 'general' }) }));
  jest.doMock('../../bot/shared/services/lesson-plan-queue.service', () => inert());
  jest.doMock('../../bot/shared/services/queue', () => inert());
  jest.doMock('../../bot/shared/services/observe/observe-audio-router', () => ({ routeLeaderAudio: jest.fn().mockResolvedValue(false) }));
  jest.doMock('../../bot/shared/services/feature-registration.service', () => inert({ isPendingName: jest.fn().mockResolvedValue(false) }));
  jest.doMock('../../bot/shared/services/attendance-conversation.service', () => inert({
    STATES: { AWAITING_VOICE_INPUT: 'AWAITING_VOICE_INPUT' },
    getSessionState: jest.fn().mockResolvedValue(route === 'attendance' ? { state: 'AWAITING_VOICE_INPUT' } : null),
    handleVoiceInput: jest.fn(async (_userId, wavPath) => {
      await sleep(DELAY);
      record('attendance', () => fs.readFileSync(wavPath));
      return { action: 'ERROR', message: 'Please try again.' };
    }),
  }));
  jest.doMock('../../bot/shared/services/redis-comprehension.service', () => inert({
    findActiveFlowByUser: jest.fn().mockResolvedValue(route === 'comprehension' ? {
      assessment_id: 'assessment-9', current_question_index: 0, answers: [],
      questions: [{ id: 'q1', question: 'Who found the kite?' }, { id: 'q2', question: 'Where was it?' }],
    } : null),
    recordAnswer: jest.fn().mockResolvedValue({ current_question_index: 1, answers: [{ correct: true }] }),
    abandonUserFlows: jest.fn().mockResolvedValue(0),
  }));
  jest.doMock('../../bot/shared/services/reading/comprehension.service', () => inert({
    evaluateAnswer: jest.fn(async (_q, audioPath) => {
      await sleep(DELAY);
      record('evaluate', () => fs.readFileSync(audioPath));
      return { correct: true, confidence: 0.9 };
    }),
  }));
  jest.doMock('../../bot/shared/services/reading-assessment.service', () => inert());
  jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => inert());
  jest.doMock('../../bot/shared/services/menu.service', () => inert());
  jest.doMock('../../bot/shared/services/video/video-orchestrator.service', () => inert());
  jest.doMock('../../bot/shared/services/content.service', () => inert());

  installAudioBoundary();
  const { handleVoiceMessage } = require('../../bot/shared/handlers/voice-message.handler');
  return (who, user) => handleVoiceMessage(
    { id: `wamid.${who}`, from: user.phone_number, type: 'audio', audio: { id: `media-${who}`, mime_type: 'audio/ogg; codecs=opus' } },
    user.phone_number,
    user,
  );
}

// ── Services that fetch a stored recording and transcribe it ──────────────

function mockR2Download() {
  jest.doMock('../../bot/shared/storage/r2', () => ({
    isR2Configured: jest.fn(() => false),
    extractKeyFromUrl: jest.fn(() => 'audio/reading.ogg'),
    downloadFromR2: jest.fn(async () => bytesOf(caller.getStore())),
    uploadClassroomAudio: jest.fn(),
  }));
}

function loadReadingTranscription(viaLocalFile) {
  commonMocks();
  jest.doMock('../../bot/shared/config/supabase', () => fakeSupabase());
  mockR2Download();
  installAudioBoundary();
  const service = require('../../bot/shared/services/reading/transcription.service');
  jest.spyOn(service, 'processTranscription').mockImplementation(async (r) => r);
  return async (who) => {
    let url = 'https://bucket.example.org/audio/reading.ogg';
    if (viaLocalFile) {
      // The handler's local fallback: the recording kept on disk, outside TEMP.
      const kept = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-kept-'));
      keptDirs.push(kept);
      fs.writeFileSync(path.join(kept, 'recording.ogg'), bytesOf(who));
      url = `file://${path.join(kept, 'recording.ogg')}`;
    }
    return service.transcribeReading('assessment-1', url, 'en');
  };
}

function loadPronunciation() {
  commonMocks();
  process.env.AZURE_SPEECH_KEY = 'test-azure-key';
  jest.doMock('../../bot/shared/services/llm-client', () => ({ getClient: () => ({}) }));
  mockR2Download();
  const sdk = () => ({
    SpeechConfig: { fromSubscription: () => ({}) },
    AudioConfig: { fromWavFileInput: (buf) => { record('azure', () => Buffer.from(buf)); return {}; } },
    PronunciationAssessmentConfig: function PronunciationAssessmentConfig() { return { applyTo() {} }; },
    PronunciationAssessmentGradingSystem: {},
    PronunciationAssessmentGranularity: {},
    SpeechRecognizer: function SpeechRecognizer() {
      return { recognizeOnceAsync: (ok) => setTimeout(() => ok({ reason: 'NoMatch' }), DELAY), close() {} };
    },
    ResultReason: { RecognizedSpeech: 'RecognizedSpeech' },
  });
  jest.doMock('microsoft-cognitiveservices-speech-sdk', sdk, { virtual: true });
  const botSdk = path.resolve(__dirname, '../../bot/node_modules/microsoft-cognitiveservices-speech-sdk');
  if (fs.existsSync(botSdk)) jest.doMock(botSdk, sdk);
  installAudioBoundary();
  const service = require('../../bot/shared/services/reading/pronunciation.service');
  jest.spyOn(service, 'fallbackPronunciationAssessment').mockReturnValue({ source: 'fallback' });
  return () => service.assessEnglishPronunciation('assessment-1', 'https://bucket.example.org/a.ogg', 'The kite flew.', 'The kite flew.');
}

function coachingProcessorMocks(tables) {
  jest.doMock('../../bot/shared/config/supabase', () => fakeSupabase(tables));
  mockR2Download();
  jest.doMock('../../bot/shared/services/whatsapp.service', () => inert({
    downloadMedia: jest.fn(async () => bytesOf(caller.getStore())),
  }));
  jest.doMock('../../bot/shared/services/coaching/coaching-session.service', () => inert());
  jest.doMock('../../bot/shared/services/coaching/coaching-job-queue.service', () => inert());
  jest.doMock('../../bot/shared/utils/language-cache', () => inert({ getUserLanguage: jest.fn().mockResolvedValue('en') }));
}

function loadClassroomTranscription() {
  commonMocks();
  coachingProcessorMocks({
    coaching_sessions: {
      id: 'session-7', user_id: 'user-7', observation_type: 'leader_observation', audio_duration_seconds: 1200,
      users: { phone_number: '15550100207', first_name: 'Sam' },
    },
  });
  installAudioBoundary();
  const service = require('../../bot/shared/services/coaching/transcription-processor.service');
  jest.spyOn(service, 'handleTranscriptionError').mockResolvedValue(undefined);
  return (who) => service.processTranscription('session-7', { from: '15550100207', audioId: `media-${who}` });
}

function loadObserveDebrief() {
  commonMocks();
  coachingProcessorMocks({
    coaching_sessions: {
      id: 'obs-1', user_id: 'teacher-1', observer_user_id: 'coach-1', observation_type: 'leader_observation',
      debrief_status: 'pending', analysis_data: { observer_debrief: { audio_id: 'media-1', audio_mime: 'audio/ogg', attempts: 0 } },
    },
    users: { id: 'coach-1', name: 'Sam Rivera', preferred_language: 'en', phone_number: '15550100001' },
  });
  jest.doMock('../../bot/shared/services/observe/observe-language', () => ({ languageFor: jest.fn().mockResolvedValue('en') }));
  jest.doMock('../../bot/shared/services/observe/observe-state.service', () => inert());
  // The model client (and its bot-only jsonrepair) is a network boundary this row never reaches.
  jest.doMock('../../bot/shared/services/gpt5-mini.service', () => inert());
  installAudioBoundary();
  const service = require('../../bot/shared/services/observe/observe-debrief.service');
  return (who) => service.processDebriefRecording('obs-1', { from: '15550100001', audioId: `media-${who}` });
}

function loadDurationCheck() {
  commonMocks();
  const AudioService = installAudioBoundary();
  return (who) => AudioService.getAudioDuration(bytesOf(who));
}

// ── The rows ──────────────────────────────────────────────────────────────

const TWO_USERS = [[A, userFor(A)], [B, userFor(B)]];
const SAME_TEACHER_TWICE = [['first-note', ONE_TEACHER], ['second-note', ONE_TEACHER]];

const rows = [
  ['handler: general voice note (ogg upload, WAV, audio.service conversion input)', () => loadHandler('general'), TWO_USERS, ['upload', 'stt']],
  ['handler: reply inside a coaching conversation', () => loadHandler('coaching'), TWO_USERS, ['stt']],
  ['handler: comprehension answer', () => loadHandler('comprehension'), TWO_USERS, ['evaluate']],
  ['handler: attendance roll call', () => loadHandler('attendance'), TWO_USERS, ['attendance']],
  ['handler: attendance roll call, same teacher twice', () => loadHandler('attendance'), SAME_TEACHER_TWICE, ['attendance']],
  ['handler: student reading, same assessment twice', () => loadHandler('reading'), SAME_TEACHER_TWICE, ['upload']],
  ['audio.service: getAudioDuration', loadDurationCheck, TWO_USERS, ['ffprobe']],
  ['transcription.service: reading from object storage, same assessment twice', () => loadReadingTranscription(false), SAME_TEACHER_TWICE, ['stt']],
  ['transcription.service: reading kept on local disk, same assessment twice', () => loadReadingTranscription(true), SAME_TEACHER_TWICE, ['stt']],
  ['pronunciation.service: English assessment, same assessment twice', loadPronunciation, SAME_TEACHER_TWICE, ['azure']],
  ['transcription-processor: classroom recording, same session twice', loadClassroomTranscription, SAME_TEACHER_TWICE, ['stt']],
  ['observe-debrief: debrief recording, same session twice', loadObserveDebrief, SAME_TEACHER_TWICE, ['stt']],
];

describe.each(rows)('%s', (_name, load, callers, sites) => {
  it('each caller\'s audio is read back as their own, and the temp dir is left empty', async () => {
    const call = load();
    await Promise.all(callers.map(([who, user]) => caller.run(who, async () => {
      try { await call(who, user); } catch (_) { /* the boundary recorded what went wrong */ }
    })));

    for (const [who] of callers) {
      const mine = received.filter((r) => r.who === who);
      for (const site of sites) {
        expect({ who, site, reached: mine.some((r) => r.site === site) }).toEqual({ who, site, reached: true });
      }
      for (const r of mine) {
        expect({ who, site: r.site, read: r.error || String(r.bytes) })
          .toEqual({ who, site: r.site, read: String(bytesOf(who)) });
      }
    }
    expect(fs.readdirSync(TEMP)).toEqual([]);
  });
});
