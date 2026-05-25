/**
 * Student Videos flow — endpoint (grade→subject→video browse + deliver) and
 * the feedback service (schedule / button / reason capture). Adapted to the
 * open-source student_videos schema (topic / subtopic / video_url). Bot-only
 * deps mocked for the root-before-bot-ci test ordering.
 */

const fs = require('fs');
const path = require('path');

// A supabase mock that honours .eq() filtering, .single/.maybeSingle, insert,
// and update over in-memory datasets keyed by table name.
function makeSupabase(datasets) {
  const store = JSON.parse(JSON.stringify(datasets));
  function builder(table) {
    let rows = (store[table] || []).slice();
    const filters = [];
    const api = {
      select() { return api; },
      eq(k, v) { filters.push([k, v]); rows = rows.filter(r => String(r[k]) === String(v)); return api; },
      in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return api; },
      not() { return api; },
      gte() { return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'no rows' } }); },
      insert(payload) {
        const row = { id: `gen-${(store[table] || []).length + 1}`, ...payload };
        store[table] = store[table] || [];
        store[table].push(row);
        return {
          select() { return { single: () => Promise.resolve({ data: { id: row.id }, error: null }) }; },
          then: (res) => res({ data: row, error: null }),
        };
      },
      update(patch) {
        return {
          eq(k, v) {
            (store[table] || []).forEach(r => { if (String(r[k]) === String(v)) Object.assign(r, patch); });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      then(resolve) { return resolve({ data: rows, error: null }); },
    };
    return api;
  }
  return { from: jest.fn((t) => builder(t)), __store: store };
}

const VIDEOS = [
  { id: 'v1', grade: '3', subject: 'Maths', topic: 'Numbers', subtopic: 'Even and Odd', video_url: 'https://x/v1.mp4' },
  { id: 'v2', grade: '3', subject: 'Maths', topic: 'Numbers', subtopic: 'Place Value', video_url: 'https://x/v2.mp4' },
  { id: 'v3', grade: '3', subject: 'English', topic: 'Phonics', subtopic: null, video_url: 'https://x/v3.mp4' },
  { id: 'v4', grade: '1', subject: 'Maths', topic: 'Counting', subtopic: null, video_url: null }, // no url → excluded
];

// ── endpoint ──────────────────────────────────────────────────────────────
describe('student-videos-endpoint', () => {
  let ep, scheduleSpy, sendMsgSpy, sendVideoSpy;

  function load(videos = VIDEOS) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
    const supa = makeSupabase({
      student_videos: videos,
      users: [{ id: 'u1', phone_number: '15551230000', preferred_language: 'en' }],
    });
    jest.doMock('../../bot/shared/config/supabase', () => supa);
    sendMsgSpy = jest.fn().mockResolvedValue(true);
    sendVideoSpy = jest.fn().mockResolvedValue(true);
    jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
      sendMessage: sendMsgSpy, sendVideoFromUrl: sendVideoSpy,
    }));
    scheduleSpy = jest.fn();
    jest.doMock('../../bot/shared/services/student-video-feedback.service', () => ({
      scheduleFeedbackPrompt: scheduleSpy,
    }));
    ep = require('../../bot/shared/routes/student-videos-endpoint');
  }

  it('INIT lists grades sorted, excluding rows without a video_url', async () => {
    load();
    const res = await ep.handleStudentVideosInit('u1:student-videos:1');
    expect(res.screen).toBe('SELECT_GRADE');
    // grade 1's only video has no url → grade 1 dropped; only grade 3 remains
    expect(res.data.grades.map(g => g.id)).toEqual(['3']);
  });

  it('INIT with an empty library returns an error message', async () => {
    load([]);
    const res = await ep.handleStudentVideosInit('u1');
    expect(res.data.error).toBeDefined();
  });

  it('SELECT_GRADE → subjects for that grade', async () => {
    load();
    const res = await ep.handleStudentVideosDataExchange('u1', 'SELECT_GRADE', { grade: '3' });
    expect(res.screen).toBe('SELECT_SUBJECT');
    expect(res.data.subjects.map(s => s.id).sort()).toEqual(['English', 'Maths']);
    expect(res.data.grade_display).toBe('Grade 3');
  });

  it('SELECT_SUBJECT → videos, prefixing the topic only when ≥2 share it', async () => {
    load();
    const res = await ep.handleStudentVideosDataExchange('u1', 'SELECT_SUBJECT', { grade: '3', subject: 'Maths' });
    expect(res.screen).toBe('SELECT_TOPIC');
    const titles = res.data.videos.map(v => v.title);
    // both Maths videos share topic "Numbers" (≥2) → prefixed
    expect(titles).toContain('Numbers · Even and Odd');
    expect(titles).toContain('Numbers · Place Value');
  });

  it('SELECT_SUBJECT → singleton topic uses the bare title (subtopic null → topic)', async () => {
    load();
    const res = await ep.handleStudentVideosDataExchange('u1', 'SELECT_SUBJECT', { grade: '3', subject: 'English' });
    expect(res.data.videos[0].title).toBe('Phonics'); // subtopic null → falls back to topic, no prefix
  });

  it('SELECT_TOPIC delivers the video, returns SUCCESS, and schedules feedback', async () => {
    load();
    const res = await ep.handleStudentVideosDataExchange('u1:student-videos:1', 'SELECT_TOPIC', { grade: '3', subject: 'Maths', video: 'v1' });
    expect(res.screen).toBe('SUCCESS');
    expect(res.data.message).toContain('Even and Odd');
    // deliverVideoAsync runs on next tick — flush microtasks
    await new Promise(r => setImmediate(r));
    expect(sendVideoSpy).toHaveBeenCalledWith('15551230000', 'https://x/v1.mp4', expect.stringContaining('Even and Odd'));
    expect(scheduleSpy).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'v1', userId: 'u1' }));
  });

  it('SELECT_TOPIC with an unknown video id errors', async () => {
    load();
    const res = await ep.handleStudentVideosDataExchange('u1', 'SELECT_TOPIC', { grade: '3', subject: 'Maths', video: 'nope' });
    expect(res.data.error).toBeDefined();
  });

  it('gradeTitle / videoTitle helpers', () => {
    load();
    expect(ep.gradeTitle('NURSERY')).toBe('Nursery');
    expect(ep.gradeTitle('4')).toBe('Grade 4');
    expect(ep.videoTitle({ subtopic: 'Sub', topic: 'Top' })).toBe('Sub');
    expect(ep.videoTitle({ subtopic: null, topic: 'Top' })).toBe('Top');
  });
});

// ── feedback service ────────────────────────────────────────────────────────
describe('student-video-feedback.service', () => {
  let svc, supa, redisStore, sendMsgSpy, sendBtnSpy;

  function load({ videos, users, feedback = [], redis = {} } = {}) {
    jest.resetModules();
    // The endpoint describe doMock'd this module; make sure we get the REAL one.
    jest.dontMock('../../bot/shared/services/student-video-feedback.service');
    jest.useFakeTimers();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
    supa = makeSupabase({
      student_videos: videos || [{ id: 'v1', grade: '3', subject: 'Maths', topic: 'Numbers', subtopic: 'Even and Odd' }],
      users: users || [{ id: 'u1', phone_number: '15551230000', preferred_language: 'en' }],
      student_video_feedback: feedback,
    });
    jest.doMock('../../bot/shared/config/supabase', () => supa);
    redisStore = { ...redis };
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
      isAvailable: () => true,
      set: jest.fn((k, v) => { redisStore[k] = v; return Promise.resolve(true); }),
      get: jest.fn((k) => Promise.resolve(redisStore[k] || null)),
      delete: jest.fn((k) => { delete redisStore[k]; return Promise.resolve(true); }),
    }));
    sendMsgSpy = jest.fn().mockResolvedValue(true);
    sendBtnSpy = jest.fn().mockResolvedValue(true);
    jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
      sendMessage: sendMsgSpy, sendInteractiveButtons: sendBtnSpy,
    }));
    svc = require('../../bot/shared/services/student-video-feedback.service');
  }
  afterEach(() => { jest.useRealTimers(); });

  it('BUTTON_RX matches yes/no with a uuid', () => {
    load();
    expect(svc.BUTTON_RX.test('student_video_feedback_yes_123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(svc.BUTTON_RX.test('student_video_feedback_maybe_x')).toBe(false);
  });

  it('scheduleFeedbackPrompt fires the 2-button prompt after the delay', async () => {
    load();
    svc.scheduleFeedbackPrompt({ videoId: 'v1', userId: 'u1', phone: '15551230000', context: { language: 'en' } });
    jest.advanceTimersByTime(svc.FEEDBACK_DELAY_MS);
    await Promise.resolve(); await Promise.resolve();
    expect(sendBtnSpy).toHaveBeenCalled();
    const arg = sendBtnSpy.mock.calls[0][1];
    expect(arg.buttons.map(b => b.id)).toEqual(['student_video_feedback_yes_v1', 'student_video_feedback_no_v1']);
  });

  it('scheduleFeedbackPrompt no-ops when a field is missing', () => {
    load();
    svc.scheduleFeedbackPrompt({ videoId: 'v1', userId: 'u1' }); // no phone
    jest.advanceTimersByTime(svc.FEEDBACK_DELAY_MS);
    expect(sendBtnSpy).not.toHaveBeenCalled();
  });

  const VID = '123e4567-e89b-12d3-a456-426614174000'; // 36-char uuid (BUTTON_RX requires it)

  it('handleFeedbackButton "yes" inserts a row and acks', async () => {
    load({ videos: [{ id: VID, grade: '3', subject: 'Maths', topic: 'Numbers', subtopic: 'Even and Odd' }] });
    const ok = await svc.handleFeedbackButton(`student_video_feedback_yes_${VID}`, '15551230000');
    expect(ok).toBe(true);
    expect(supa.__store.student_video_feedback.length).toBe(1);
    expect(supa.__store.student_video_feedback[0].useful).toBe(true);
    expect(sendMsgSpy).toHaveBeenCalled();
  });

  it('handleFeedbackButton "no" sets the reason flag and prompts', async () => {
    load({ videos: [{ id: VID, grade: '3', subject: 'Maths', topic: 'Numbers', subtopic: 'Even and Odd' }] });
    await svc.handleFeedbackButton(`student_video_feedback_no_${VID}`, '15551230000');
    expect(redisStore['student_video_feedback_pending:u1']).toBeDefined();
    expect(sendMsgSpy).toHaveBeenCalled();
  });

  it('handleFeedbackButton returns false for a non-matching id', async () => {
    load();
    expect(await svc.handleFeedbackButton('something_else', '15551230000')).toBe(false);
  });

  it('consumeReasonIfPending captures the reason text and updates the row', async () => {
    load({
      feedback: [{ id: 'f1', user_id: 'u1', video_id: 'v1', useful: false }],
      redis: { 'student_video_feedback_pending:u1': { feedbackId: 'f1', polarity: 'disliked', promptedAt: Date.now() } },
    });
    const consumed = await svc.consumeReasonIfPending('u1', '15551230000', 'audio was muffled');
    expect(consumed).toBe(true);
    const row = supa.__store.student_video_feedback.find(r => r.id === 'f1');
    expect(row.reason_text).toBe('audio was muffled');
    expect(redisStore['student_video_feedback_pending:u1']).toBeUndefined();
  });

  it('consumeReasonIfPending returns false with no pending flag, and skips slash commands', async () => {
    load();
    expect(await svc.consumeReasonIfPending('u1', '15551230000', 'hello')).toBe(false);
    // with a flag but a slash command → not consumed
    redisStore['student_video_feedback_pending:u1'] = { feedbackId: 'f1', polarity: 'disliked' };
    expect(await svc.consumeReasonIfPending('u1', '15551230000', '/menu')).toBe(false);
  });
});

// ── flow JSON + leak gate ─────────────────────────────────────────────────────
describe('student-videos-flow.json', () => {
  const flowPath = path.join(__dirname, '../../docs/flows/student-videos-flow.json');

  it('is valid JSON with grade → subject → topic → success routing', () => {
    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    expect(flow.routing_model.SELECT_GRADE).toEqual(['SELECT_SUBJECT']);
    expect(flow.routing_model.SELECT_TOPIC).toEqual(['SUCCESS']);
  });

  it('is leak-free (no internal phone/name/path/bead tokens)', () => {
    const raw = fs.readFileSync(flowPath, 'utf8');
    const epSrc = fs.readFileSync(path.join(__dirname, '../../bot/shared/routes/student-videos-endpoint.js'), 'utf8');
    const svcSrc = fs.readFileSync(path.join(__dirname, '../../bot/shared/services/student-video-feedback.service.js'), 'utf8');
    for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub', 'bd-', 'PROJ-', 'Silverleaf', 'Sindh broadcast']) {
      expect(raw).not.toContain(banned);
      expect(epSrc).not.toContain(banned);
      expect(svcSrc).not.toContain(banned);
    }
  });
});
