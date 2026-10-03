/**
 * The worker side of the teacher's report: preview → deliver → teacher tap.
 *
 *  - preview renders the SCORELESS hero report from a teacher-safe copy of the
 *    analysis, plus the companion note, and shows the coach exactly that;
 *  - the trust firewall runs over everything teacher-bound, at preview and
 *    again right before delivery — tested here with an adversarial analysis
 *    whose model output tries to leak scores and coach-the-coach material;
 *  - delivery branches on the RECIPIENT IDENTITY: a prefixed identity
 *    (mtx:, slack:, …) is sent directly even on a Meta deployment; only a bare
 *    number on Meta meets the 24-hour window and the invite template;
 *  - every outcome is told to the coach, failures included.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createFakeSupabase } = require('./_helpers/fake-supabase');

const mockTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'observe-send-'));
const mockDb = createFakeSupabase({
  users: [
    { id: 'coach-1', role: 'coach', name: 'Robin Coach', phone_number: 'mtx:15550100001', preferred_language: 'en' },
    { id: 't-1', role: 'teacher', name: 'Sam Taylor', phone_number: 'mtx:15554000002' },
  ],
  coaching_sessions: [],
});
jest.mock('../../bot/shared/config/supabase', () => mockDb.client);
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/constants', () => ({ TEMP_DIR: mockTmp }));
jest.mock('../../bot/shared/storage/r2', () => ({
  isR2Configured: () => false, uploadImageBuffer: jest.fn(), downloadFromR2: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true),
  sendImage: jest.fn(async () => true),
  sendTemplate: jest.fn(async () => true),
  sendInteractiveButtons: jest.fn(async () => true),
}));
const mockWindowOpen = jest.fn(async () => true);
jest.mock('../../bot/shared/services/quiz/quiz-delivery.service', () => ({
  _hasOpenMessageWindow: (...a) => mockWindowOpen(...a),
}));
jest.mock('../../bot/shared/services/coaching/coaching-job-queue.service', () => ({
  queueObserveTeacherReport: jest.fn(async () => 'msg-1'),
}));
const mockNotes = jest.fn();
jest.mock('../../bot/shared/services/gpt5-mini.service', () => ({
  completeJson: (...a) => mockNotes(...a),
}));
// The hero renderer is the image boundary (headless browser). The fake runs
// the caller's beforeRender over a model-written narrative exactly as the real
// service does, and records what it was given.
const mockHero = { calls: [], narrative: null, throws: null };
jest.mock('../../bot/shared/services/coaching/report-v2/hero-report.service', () => ({
  generateHeroReport: async (session, analysis, opts) => {
    if (mockHero.throws) throw mockHero.throws;
    const vm = { teacherName: opts.teacherName, tryNext: opts.commitmentAction, narrative: { ...mockHero.narrative }, groups: [] };
    if (opts.beforeRender) await opts.beforeRender(vm);
    mockHero.calls.push({ analysis, opts, vm });
    return { png: Buffer.from('PNG'), caption: 'x' };
  },
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const ObserveSend = require('../../bot/shared/services/observe/observe-send.service');
const TR = require('../../bot/shared/services/observe/observe-teacher-report');

const COACH_TO = 'mtx:15550100001';
const PID = 'a1b2c3d4e5f6';   // the current preview's id (set when the recipient was chosen)
const FEEDBACK = {
  wins: ['You opened with specific praise about the counting sticks game'],
  try: 'Next time wait longer after asking your reflective question before speaking again',
  rubric: { disparaged_teacher: false, moves_not_teacher: true },
};
const TRANSCRIPT = 'Coach: Thank you for having me today, I loved the counting sticks. Teacher: Thank you. '
  + 'Coach: What would you try tomorrow? Teacher: I will ask how they know after each answer, starting in maths.';

function seed(delivery = {}, extra = {}) {
  mockDb.tables.coaching_sessions.length = 0;
  mockDb.tables.coaching_sessions.push({
    id: 'obs-1', user_id: 't-1', observer_user_id: 'coach-1', observation_type: 'leader_observation',
    status: 'observer_review_complete', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T10:00:00Z',
    analysis_data: {
      framework: 'teach',
      scores: { overall_percentage: 62 },
      strengths: [{ title: 'Warm, clear explanations' }],
      observer_notes: 'Honestly the pacing was poor and half the class was lost by minute ten',
      observer_debrief: { transcript: TRANSCRIPT, feedback: FEEDBACK },
      teacher_delivery: { teacher_name: 'Sam Taylor', teacher_phone: 'mtx:15554000002', status: 'previewing', preview_id: PID, ...delivery },
      ...extra,
    },
  });
}
const row = () => mockDb.tables.coaching_sessions[0];
const delivery = () => row().analysis_data.teacher_delivery;
const textsTo = (to) => WhatsAppService.sendMessage.mock.calls.filter((c) => c[0] === to).map((c) => c[1]);
const imagesTo = (to) => WhatsAppService.sendImage.mock.calls.filter((c) => c[0] === to);
const material = () => TR.coachOnlyMaterial(row().analysis_data);

beforeEach(() => {
  jest.clearAllMocks();
  mockHero.calls = [];
  mockHero.throws = null;
  mockHero.narrative = { affirmation: 'You made every child feel heard.' };
  mockNotes.mockResolvedValue({ result: { discussed: 'You talked about giving children time to explain.', commitment: 'I will ask how they know after each answer.' } });
  mockWindowOpen.mockResolvedValue(true);
  delete process.env.OBSERVE_REVIEW_MODE;
  delete process.env.OBSERVE_REVIEW_NUMBER;
  delete process.env.OBSERVE_REPORT_TEMPLATE;
  process.env.CHANNEL_DRIVER = 'meta';
});
afterAll(() => { delete process.env.CHANNEL_DRIVER; fs.rmSync(mockTmp, { recursive: true, force: true }); });

describe('preview', () => {
  test('the coach sees the exact package: scoreless image, caption, companion — then three buttons', async () => {
    seed();
    const out = await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(out.status).toBe('previewed');

    const hero = mockHero.calls[0];
    expect(hero.opts.scoreless).toBe(true);
    expect(hero.analysis.observer_debrief).toBeUndefined();   // the renderer never saw coach material
    expect(hero.analysis.observer_notes).toBeUndefined();
    expect(hero.opts.commitmentAction).toBe('I will ask how they know after each answer.');

    const [img] = imagesTo(COACH_TO);
    expect(fs.existsSync(img[1])).toBe(true);
    expect(img[2]).toMatch(/Robin Coach/);
    expect(textsTo(COACH_TO).join('\n')).toMatch(/I will ask how they know/);
    const buttons = WhatsAppService.sendInteractiveButtons.mock.calls[0][1].buttons.map((b) => b.id);
    expect(buttons).toEqual([`observe_send_confirm_obs-1.${PID}`, `observe_send_other_obs-1.${PID}`, `observe_send_cancel_obs-1.${PID}`]);
    expect(delivery()).toMatchObject({ status: 'awaiting_confirm', report_kind: 'image' });
    // nothing reached the teacher yet
    expect(WhatsAppService.sendMessage.mock.calls.some((c) => c[0] === 'mtx:15554000002')).toBe(false);
  });

  test('ADVERSARIAL: model output that leaks scores and coach-the-coach material never reaches the package', async () => {
    seed();
    mockHero.narrative = {
      affirmation: 'You made every child feel heard.',
      score_framing: 'Your 62% is a stage, not a verdict.',
      strength_note: 'Next time wait longer after asking your reflective question before speaking again',
      moments: [{ title: 'Tally', quote: 'We got 3 of 5 right', why: 'Counting.' }],
    };
    mockNotes.mockResolvedValue({ result: {
      discussed: 'Your coach noted the pacing was poor and half the class was lost by minute ten.',
      commitment: 'I will get 40/50 next time.',
    } });

    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });

    const vm = mockHero.calls[0].vm;
    expect(vm.narrative.score_framing).toBeUndefined();
    expect(vm.narrative.strength_note).toBeUndefined();
    expect(vm.narrative.moments).toEqual([]);
    expect(vm.narrative.affirmation).toBe('You made every child feel heard.');
    expect(vm.tryNext).toBe('');                    // the leaky commitment was dropped with the notes
    expect(delivery().companion_text).toBeNull();

    const everything = [...textsTo(COACH_TO), ...imagesTo(COACH_TO).map((c) => c[2]), ...TR.viewModelTexts(vm)];
    expect(() => TR.assertTeacherSafe(everything, { material: material() })).not.toThrow();
    expect(everything.join(' ')).not.toMatch(/62%|3 of 5|40\/50|pacing was poor|wait longer after asking/);
  });

  test('a harmful debrief gets no teacher notes at all (and the model is not even asked)', async () => {
    seed({}, { observer_debrief: { transcript: TRANSCRIPT, feedback: { ...FEEDBACK, rubric: { disparaged_teacher: true } } } });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(mockNotes).not.toHaveBeenCalled();
    expect(delivery().companion_text).toBeNull();
  });

  test('no image renderer → the text report, firewall-checked', async () => {
    seed();
    mockHero.throws = new Error('no browser');
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(delivery()).toMatchObject({ status: 'awaiting_confirm', report_kind: 'text' });
    expect(textsTo(COACH_TO)[0]).toMatch(/What went well[\s\S]*Warm, clear explanations/);
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
  });

  test('a preview that cannot reach the coach is recorded and said — once', async () => {
    seed();
    WhatsAppService.sendImage.mockResolvedValueOnce(false);
    const out = await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(out.status).toBe('failed');
    expect(delivery().status).toBe('preview_failed');
    expect(textsTo(COACH_TO).pop()).toMatch(/couldn't prepare the report preview/);
  });
});

async function previewed(delivery = {}) {
  seed(delivery);
  await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
  jest.clearAllMocks();
}

describe('deliver — branches on the recipient identity', () => {
  test('CHANNEL_DRIVER=meta and a Matrix teacher (mtx:15554000002): straight out, no window check, no template', async () => {
    await previewed();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(imagesTo('mtx:15554000002')).toHaveLength(1);
    expect(textsTo('mtx:15554000002').join('\n')).toMatch(/I will ask how they know/);
    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(WhatsAppService.sendTemplate).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ status: 'sent' });
    expect(textsTo(COACH_TO).pop()).toMatch(/reached the teacher/);
  });

  test('a bare number on Meta with the window open: direct', async () => {
    await previewed({ teacher_phone: '15554000002' });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(mockWindowOpen).toHaveBeenCalledWith('15554000002');
    expect(imagesTo('15554000002')).toHaveLength(1);
    expect(delivery().status).toBe('sent');
  });

  test('a bare number on Meta, window closed: the invite template, payload routed back to this report', async () => {
    process.env.OBSERVE_REPORT_TEMPLATE = 'observation_report';
    await previewed({ teacher_phone: '15554000002' });
    mockWindowOpen.mockResolvedValue(false);
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    const [to, name, lang, components] = WhatsAppService.sendTemplate.mock.calls[0];
    expect([to, name, lang]).toEqual(['15554000002', 'observation_report', 'en']);
    expect(JSON.stringify(components)).toContain('observe_report_obs-1');
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ status: 'awaiting_teacher_tap' });
    expect(delivery().template_sent_at).toBeTruthy();
    expect(textsTo(COACH_TO).pop()).toMatch(/sent them an invitation/);
  });

  test('window closed and the template refused (false): the coach is told honestly, nothing claims "sent"', async () => {
    process.env.OBSERVE_REPORT_TEMPLATE = 'observation_report';
    await previewed({ teacher_phone: '15554000002' });
    mockWindowOpen.mockResolvedValue(false);
    WhatsAppService.sendTemplate.mockResolvedValueOnce(false);
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(delivery().status).toBe('send_failed');
    expect(textsTo(COACH_TO).pop()).toMatch(/couldn't be sent/);
  });

  test('window closed and no template configured: told why, never a silent drop', async () => {
    await previewed({ teacher_phone: '15554000002' });
    mockWindowOpen.mockResolvedValue(false);
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(WhatsAppService.sendTemplate).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ status: 'send_failed', last_error: 'window_closed_no_template' });
    expect(textsTo(COACH_TO).pop()).toMatch(/hasn't messaged me recently/);
  });

  test('a failed direct send is recorded and told', async () => {
    await previewed();
    WhatsAppService.sendImage.mockResolvedValueOnce(false);
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(delivery().status).toBe('send_failed');
    expect(textsTo(COACH_TO).pop()).toMatch(/couldn't be sent/);
  });

  test('the firewall runs again at delivery: a tampered package never leaves', async () => {
    await previewed();
    row().analysis_data.teacher_delivery.companion_text = 'You scored 34/50.';
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
    expect(textsTo('mtx:15554000002')).toEqual([]);
    expect(delivery()).toMatchObject({ status: 'send_failed', last_error: 'trust_firewall' });
  });

  test('an already-sent report is a no-op', async () => {
    await previewed();
    row().analysis_data.teacher_delivery.status = 'sent';
    expect((await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID })).status).toBe('noop');
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
  });
});

describe('review gate', () => {
  test('operator mode reroutes to OBSERVE_REVIEW_NUMBER; the teacher receives nothing', async () => {
    process.env.OBSERVE_REVIEW_MODE = 'operator';
    process.env.OBSERVE_REVIEW_NUMBER = 'mtx:15550100999';
    await previewed();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(textsTo('mtx:15550100999')[0]).toMatch(/For review — to: Sam Taylor \(\+15554000002\) · from: Robin Coach/);
    expect(imagesTo('mtx:15550100999')).toHaveLength(1);
    expect(imagesTo('mtx:15554000002')).toHaveLength(0);
    expect(delivery().status).toBe('operator_review');
    expect(textsTo(COACH_TO).pop()).toMatch(/programme team/);
  });

  test('operator mode with no review number configured fails loudly — there is no default number', async () => {
    process.env.OBSERVE_REVIEW_MODE = 'operator';
    await previewed();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ status: 'send_failed', last_error: 'review_number_missing' });
  });
});

describe('teacher tap on the invite', () => {
  test('from the named number: delivered, tapped_at stamped, the coach told by name', async () => {
    await previewed({ teacher_phone: '15554000002' });
    row().analysis_data.teacher_delivery.status = 'awaiting_teacher_tap';
    expect(await ObserveSend.handleReportTap('15554000002', 'observe_report_obs-1')).toBe(true);
    await ObserveSend.processTeacherReport('obs-1', { phase: 'teacher_tap', from: '15554000002' });
    expect(imagesTo('15554000002')).toHaveLength(1);
    expect(delivery().status).toBe('sent');
    expect(delivery().tapped_at).toBeTruthy();
    expect(textsTo(COACH_TO).pop()).toMatch(/Sam Taylor has opened the report/);
  });

  test('from any other number: refused, nothing sent', async () => {
    await previewed({ teacher_phone: '15554000002' });
    row().analysis_data.teacher_delivery.status = 'awaiting_teacher_tap';
    const out = await ObserveSend.processTeacherReport('obs-1', { phase: 'teacher_tap', from: '15550100777' });
    expect(out.status).toBe('refused');
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
  });

  test('handleReportTap ignores payloads that are not ours', async () => {
    expect(await ObserveSend.handleReportTap('15554000002', 'menu_x')).toBe(false);
  });
});

describe('Section B — the teacher\'s plan note', () => {
  const move = (n, phase, text, verdict) => ({
    move_id: `m${n}`, phase, bucket: 'must_happen', selection: 'none', text, verdict,
    evidence: verdict === 'not_done' ? '' : `[0${n}:10] "quote ${n}"`, rationale: `why ${n}`,
    counted: verdict !== 'not_adjudicable', credit: null,
  });
  // The coach's reviewed measurement — it carries a percentage and a band.
  const LP = {
    status: 'ok', source: 'linked', lesson_plan_id: 'lp-1', fidelity_pct: 70, band: 'partial', prescribed_count: 4,
    moderators: null, unusable_guard: null, not_assessed: [], observer_edited: true,
    moves: [
      move(1, 'warm_up', 'Greet the class and recall halves', 'executed'),
      move(2, 'guided', 'Students compare fractions with strips', 'substituted_better'),
      move(3, 'exit', 'Exit question on the board', 'not_done'),
    ],
  };
  const SECTION_B = { status: 'assessed', reason: null, mismatch: false };
  const TEACHER = 'mtx:15554000002';
  const orderOf = (mockFn, pred) => mockFn.mock.invocationCallOrder[mockFn.mock.calls.findIndex(pred)];

  test('preview: the coach sees the note the teacher will get — after the report, before the companion, no number', async () => {
    seed({}, { lp_fidelity: LP, section_b: SECTION_B });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });

    expect(mockHero.calls[0].analysis.lp_fidelity).toBeUndefined();   // the renderer never saw the measurement
    expect(mockHero.calls[0].analysis.section_b).toBeUndefined();
    const note = delivery().plan_text;
    expect(note).toMatch(/Your lesson and its plan/);
    expect(note).toMatch(/Greet the class and recall halves/);
    expect(note).toMatch(/Exit question on the board/);

    const texts = textsTo(COACH_TO);
    expect(texts).toContain(note);
    const noteAt = orderOf(WhatsAppService.sendMessage, (c) => c[1] === note);
    expect(orderOf(WhatsAppService.sendImage, (c) => c[0] === COACH_TO)).toBeLessThan(noteAt);
    expect(orderOf(WhatsAppService.sendMessage, (c) => /I will ask how they know/.test(c[1]))).toBeGreaterThan(noteAt);
    for (const t of [...texts, ...imagesTo(COACH_TO).map((c) => c[2])]) expect(TR.findScoreLeak(t)).toBeNull();
    expect(texts.join(' ')).not.toMatch(/70|partial/);
  });

  test('deliver: the teacher gets the same note, in the same place', async () => {
    seed({}, { lp_fidelity: LP, section_b: SECTION_B });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    const note = delivery().plan_text;
    jest.clearAllMocks();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    const texts = textsTo(TEACHER);
    expect(texts.indexOf(note)).toBeGreaterThan(-1);
    expect(texts.indexOf(note)).toBeLessThan(texts.findIndex((t) => /I will ask how they know/.test(t)));
    expect(delivery().status).toBe('sent');
  });

  test('a failed note send fails the delivery like any other part', async () => {
    seed({}, { lp_fidelity: LP, section_b: SECTION_B });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    const note = delivery().plan_text;
    jest.clearAllMocks();
    WhatsAppService.sendMessage.mockImplementation(async (to, text) => !(to === TEACHER && text === note));
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(delivery()).toMatchObject({ status: 'send_failed', last_error: 'observe send: plan note send failed' });
    WhatsAppService.sendMessage.mockImplementation(async () => true);
  });

  test('the firewall runs over the note again at delivery: a tampered note never leaves', async () => {
    seed({}, { lp_fidelity: LP, section_b: SECTION_B });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    row().analysis_data.teacher_delivery.plan_text = 'You followed 70% of your plan.';
    jest.clearAllMocks();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'deliver', from: COACH_TO, previewId: PID });
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ status: 'send_failed', last_error: 'trust_firewall' });
  });

  test('a note the firewall refuses is dropped and logged — the report still goes', async () => {
    // Each line is clean on its own; read together they quote the coach's
    // private note, so the whole-note check refuses it.
    seed({}, {
      lp_fidelity: { ...LP, moves: [move(1, 'warm_up', 'Greet the class warmly', 'executed'), move(2, 'recall', 'then recall the halves', 'executed')] },
      section_b: SECTION_B,
      observer_notes: 'greet the class warmly then recall the halves',
    });
    const out = await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(out.status).toBe('previewed');
    expect(delivery().plan_text).toBeNull();
    expect(textsTo(COACH_TO).join('\n')).not.toMatch(/Your lesson and its plan/);
    const { logToFile } = require('../../bot/shared/utils/logger');
    expect(logToFile).toHaveBeenCalledWith(expect.stringMatching(/plan note dropped/), expect.anything());
  });

  test('not assessed, or no Section B: no note', async () => {
    seed({}, { lp_fidelity: { status: 'lp_absent' }, section_b: { status: 'not_assessed', reason: 'no_plan' } });
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(delivery().plan_text).toBeNull();
    seed();
    await ObserveSend.processTeacherReport('obs-1', { phase: 'preview', from: COACH_TO, previewId: PID });
    expect(delivery().plan_text).toBeNull();
  });
});
