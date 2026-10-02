/**
 * Grandparent Bridge (D3) — the intake state machine, objection matching, the
 * deterministic fallback one-pager, the "only matched evidence reaches the
 * prompt" safety property, and the PDF gate.
 *
 * Bot-only deps (supabase, playwright-core, the WhatsApp channel) are mocked
 * so this runs in the root suite, which CI executes BEFORE `bot/ npm ci`.
 */

const path = require('path');

const EVIDENCE_PATH = '../../bot/shared/data/grandparent-bridge-evidence.json';
const SERVICE_PATH = '../../bot/shared/services/grandparent-bridge.service';
const library = require(EVIDENCE_PATH);

// ── Harness ─────────────────────────────────────────────────────────────────
//
// One loader for every test: a Redis double backed by a Map (so the intake
// really does persist between calls), a WhatsApp double that records sends,
// and a supabase double that records inserts.
function load({ llm, chromium = false, sendDocument } = {}) {
  jest.resetModules();

  const store = new Map();
  const redis = {
    get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k, v) => { store.set(k, v); return true; }),
    delete: jest.fn(async (k) => { store.delete(k); return true; }),
  };
  const sent = [];
  const docs = [];
  const inserted = [];

  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redis);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
    sendMessage: jest.fn(async (to, message) => { sent.push({ to, message }); return true; }),
    sendDocument: sendDocument
      || jest.fn(async (to, filePath, filename, caption) => { docs.push({ to, filePath, filename, caption }); return true; }),
  }));
  jest.doMock('../../bot/shared/config/supabase', () => ({
    from: jest.fn(() => ({
      insert: jest.fn(async (row) => { inserted.push(row); return { data: null, error: null }; }),
    })),
  }));

  const llmCreate = jest.fn(llm || (async () => { throw new Error('no LLM configured in this test'); }));
  jest.doMock('../../bot/shared/services/llm-client', () => ({
    getClient: () => ({ chat: { completions: { create: llmCreate } } }),
    getDefaultModel: () => 'openai/gpt-4o',
  }));

  jest.doMock('../../bot/shared/utils/html-to-pdf', () => ({
    isPdfEngineAvailable: () => chromium,
    htmlToPdf: jest.fn(async () => Buffer.from('%PDF-1.4 fake')),
  }));

  const Service = require(SERVICE_PATH);
  return { Service, redis, sent, docs, inserted, llmCreate, store };
}

afterEach(() => jest.resetModules());

// ── The library itself ──────────────────────────────────────────────────────

describe('evidence library', () => {
  it('is flagged as not-yet-Urdu-reviewed, so nobody ships it as final', () => {
    expect(library.ur_reviewed).toBe(false);
    expect(typeof library.ur_review_note).toBe('string');
    expect(library.ur_review_note.length).toBeGreaterThan(30);
  });

  it('carries eight objection types, each with both languages and an invitation', () => {
    expect(library.objections).toHaveLength(8);
    for (const o of library.objections) {
      for (const field of [
        'id', 'objection_en', 'objection_ur', 'reassurance_en', 'reassurance_ur',
        'invitation_en', 'invitation_ur', 'evidence_summary_en', 'evidence_summary_ur',
      ]) {
        expect(typeof o[field]).toBe('string');
        expect(o[field].trim()).not.toBe('');
      }
      expect(Array.isArray(o.aliases)).toBe(true);
    }
  });

  it('gives every claim a source and an evidence-quality flag', () => {
    for (const o of library.objections) {
      expect(o.evidence.length).toBeGreaterThan(0);
      for (const e of o.evidence) {
        expect(e.claim.trim()).not.toBe('');
        expect(e.source.trim()).not.toBe('');
        expect(e.lean_flag.trim()).not.toBe('');
      }
    }
  });

  it('has Urdu (not transliterated English) in every _ur field', () => {
    const arabicScript = /[؀-ۿ]/;
    for (const o of library.objections) {
      for (const field of ['objection_ur', 'reassurance_ur', 'invitation_ur', 'evidence_summary_ur']) {
        expect(arabicScript.test(o[field])).toBe(true);
      }
    }
  });

  it('uses unique objection ids', () => {
    const ids = library.objections.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Intake state machine ────────────────────────────────────────────────────

describe('intake state machine', () => {
  const USER = 'user-1';

  it('asks the three questions in order and completes with all three answers', async () => {
    const { Service } = load();

    const started = await Service.start(USER);
    expect(started.state).toBe(Service.STATES.ASKING_REASON);
    expect(started.message).toMatch(/1 of 3/);
    expect(await Service.isInIntake(USER)).toBe(true);

    const r1 = await Service.handleReply(USER, 'she was miserable in her old school');
    expect(r1.status).toBe('step');
    expect(r1.state).toBe(Service.STATES.ASKING_AGE);
    expect(r1.message).toMatch(/2 of 3/);

    const r2 = await Service.handleReply(USER, '6');
    expect(r2.status).toBe('step');
    expect(r2.state).toBe(Service.STATES.ASKING_OBJECTION);
    expect(r2.message).toMatch(/3 of 3/);
    // The menu is built from the library, not hardcoded in the prompt.
    expect(r2.message).toContain(library.objections[0].objection_en);

    const r3 = await Service.handleReply(USER, '1');
    expect(r3.status).toBe('complete');
    expect(r3.answers).toEqual({
      reason: 'she was miserable in her old school',
      age: 6,
      objection: library.objections[0].id,
    });

    // Completion clears the session — no zombie intake left behind.
    expect(await Service.isInIntake(USER)).toBe(false);
  });

  it('returns null when no intake is active, so the message is handled normally', async () => {
    const { Service } = load();
    expect(await Service.handleReply('nobody', 'hello')).toBeNull();
  });

  it('re-asks instead of advancing when the age is not an age', async () => {
    const { Service } = load();
    await Service.start(USER);
    await Service.handleReply(USER, 'because we want to');

    const bad = await Service.handleReply(USER, 'not telling you');
    expect(bad.status).toBe('unmatched');
    expect(bad.state).toBe(Service.STATES.ASKING_AGE);

    const good = await Service.handleReply(USER, 'she is 9 years old');
    expect(good.status).toBe('step');
    expect(good.answers.age).toBe(9);
  });

  it('re-asks instead of advancing when the objection cannot be matched', async () => {
    const { Service } = load();
    await Service.start(USER);
    await Service.handleReply(USER, 'reason');
    await Service.handleReply(USER, '7');

    const bad = await Service.handleReply(USER, 'zzzzz qqqq');
    expect(bad.status).toBe('unmatched');
    expect(bad.state).toBe(Service.STATES.ASKING_OBJECTION);
    expect(await Service.isInIntake(USER)).toBe(true);
  });

  it('always lets the parent out with cancel', async () => {
    const { Service } = load();
    await Service.start(USER);
    const cancelled = await Service.handleReply(USER, 'cancel');
    expect(cancelled.status).toBe('cancelled');
    expect(await Service.isInIntake(USER)).toBe(false);
  });

  it('persists state through a process restart (state lives in Redis, not memory)', async () => {
    const { Service, store } = load();
    await Service.start(USER);
    await Service.handleReply(USER, 'our reason');

    // Same Redis contents, brand-new module instance.
    jest.resetModules();
    const redis = {
      get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
      set: jest.fn(async (k, v) => { store.set(k, v); return true; }),
      delete: jest.fn(async (k) => { store.delete(k); return true; }),
    };
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redis);
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: jest.fn(), sendDocument: jest.fn() }));
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: () => ({ insert: async () => ({ error: null }) }) }));
    const Fresh = require(SERVICE_PATH);

    const resumed = await Fresh.handleReply(USER, '5');
    expect(resumed.state).toBe(Fresh.STATES.ASKING_OBJECTION);
    expect(resumed.answers).toEqual({ reason: 'our reason', age: 5 });
  });
});

// ── Objection matching ──────────────────────────────────────────────────────

describe('objection matching', () => {
  it('matches every menu number to the objection at that position', () => {
    const { Service } = load();
    library.objections.forEach((o, i) => {
      expect(Service.matchObjection(String(i + 1)).id).toBe(o.id);
    });
  });

  it('matches free text the way a parent actually types it', () => {
    const { Service } = load();
    const cases = [
      ['they keep saying she will have no friends', 'no_friends'],
      ['my mother-in-law says this is not a real school', 'not_real_school'],
      ['what about her board exams', 'exams_certificates'],
      ['there is no discipline at home, they say', 'no_discipline'],
      ['they think girls do not need this much study', 'girls_dont_need_this'],
      ['you are not a teacher, she says', 'mother_not_a_teacher'],
      ['they think she will fall behind', 'child_will_fall_behind'],
      ['everyone asks what will people say', 'what_will_people_say'],
    ];
    for (const [text, expected] of cases) {
      expect(Service.matchObjection(text)?.id).toBe(expected);
    }
  });

  it('matches Urdu keywords', () => {
    const { Service } = load();
    expect(Service.matchObjection('اُس کے دوست کہاں بنیں گے')?.id).toBe('no_friends');
    expect(Service.matchObjection('لوگ کیا کہیں گے')?.id).toBe('what_will_people_say');
  });

  it('prefers the longer, more specific alias', () => {
    const { Service } = load();
    // "school" alone would hit not_real_school; "no discipline" must win here.
    expect(Service.matchObjection('no discipline in this school')?.id).toBe('no_discipline');
  });

  it('returns null rather than guessing', () => {
    const { Service } = load();
    expect(Service.matchObjection('')).toBeNull();
    expect(Service.matchObjection('   ')).toBeNull();
    expect(Service.matchObjection('qwertyuiop')).toBeNull();
    expect(Service.matchObjection('99')).toBeNull();
  });
});

// ── The prompt: only the matched objection's evidence may reach the LLM ─────

describe('buildPrompt', () => {
  it('contains the matched objection\'s claims and NO other objection\'s claims', () => {
    const { Service } = load();
    const target = library.objections.find((o) => o.id === 'no_friends');

    const prompt = Service.buildPrompt({ reason: 'she reads better at home', age: 6, objection: 'no_friends' });

    for (const e of target.evidence) {
      expect(prompt).toContain(e.claim);
      expect(prompt).toContain(e.source);
      expect(prompt).toContain(e.lean_flag);
    }
    for (const other of library.objections.filter((o) => o.id !== target.id)) {
      for (const e of other.evidence) {
        expect(prompt).not.toContain(e.claim);
      }
      expect(prompt).not.toContain(other.reassurance_en);
    }
  });

  it('carries the parent\'s answers, the word budget, and the never-argue rules', () => {
    const { Service } = load();
    const prompt = Service.buildPrompt({ reason: 'bullying', age: 8, objection: 'no_discipline' });
    expect(prompt).toContain('bullying');
    expect(prompt).toContain('8');
    expect(prompt).toContain(String(Service.WORD_LIMIT));
    expect(prompt).toMatch(/never argue/i);
    expect(prompt).toMatch(/do not add any other fact/i);
    // The invitation is the required ending, not an optional flourish.
    expect(prompt).toContain(library.objections.find((o) => o.id === 'no_discipline').invitation_en);
  });

  it('refuses an unknown objection instead of composing something ungrounded', () => {
    const { Service } = load();
    expect(() => Service.buildPrompt({ reason: 'x', age: 6, objection: 'made_up' })).toThrow(/unknown objection/);
  });
});

// ── The deterministic fallback ──────────────────────────────────────────────

describe('fallback one-pager', () => {
  it('produces both languages for every objection, inside the word budget', () => {
    const { Service } = load();
    for (const o of library.objections) {
      const page = Service.fallbackOnePager({ reason: 'she learns better with us', age: 7, objection: o.id });
      expect(Service.countWords(page.en)).toBeLessThanOrEqual(Service.WORD_LIMIT);
      expect(Service.countWords(page.ur)).toBeLessThanOrEqual(Service.WORD_LIMIT);
      expect(page.source).toBe('fallback');
    }
  });

  it('opens by honouring the concern and ends with the one concrete invitation', () => {
    const { Service } = load();
    const o = library.objections.find((x) => x.id === 'no_friends');
    const page = Service.fallbackOnePager({ reason: 'she was bullied', age: 6, objection: 'no_friends' });

    expect(page.en.indexOf(o.objection_en)).toBeLessThan(page.en.indexOf(o.reassurance_en));
    expect(page.en.trim().endsWith(o.invitation_en)).toBe(true);
    expect(page.ur.trim().endsWith(o.invitation_ur)).toBe(true);
    // Exactly one invitation — never a list of ways to get involved.
    expect(page.en.split(o.invitation_en).length - 1).toBe(1);
  });

  it('uses only the matched objection\'s evidence — never another\'s', () => {
    const { Service } = load();
    const mine = library.objections.find((o) => o.id === 'exams_certificates');
    const page = Service.fallbackOnePager({ reason: 'r', age: 6, objection: 'exams_certificates' });

    // At least the first evidence line always survives the budget.
    const firstLine = (s) => String(s).split('\n')[0].trim();
    expect(page.en).toContain(firstLine(mine.evidence_summary_en));
    expect(page.ur).toContain(firstLine(mine.evidence_summary_ur));

    for (const other of library.objections.filter((o) => o.id !== mine.id)) {
      for (const line of String(other.evidence_summary_en).split('\n')) {
        expect(page.en).not.toContain(line.trim());
      }
      for (const line of String(other.evidence_summary_ur).split('\n')) {
        expect(page.ur).not.toContain(line.trim());
      }
    }
  });

  it('clips a rambling reason rather than blowing the budget', () => {
    const { Service } = load();
    const rambling = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const page = Service.fallbackOnePager({ reason: rambling, age: 6, objection: 'no_friends' });
    expect(Service.countWords(page.en)).toBeLessThanOrEqual(Service.WORD_LIMIT);
    expect(page.en).not.toContain('word30');
  });
});

// ── compose(): LLM when it works, fallback when it does not ────────────────

describe('compose', () => {
  const answers = { reason: 'she reads better at home', age: 6, objection: 'no_friends' };

  it('uses the LLM output when it parses and fits', async () => {
    const { Service, llmCreate } = load({
      llm: async () => ({
        choices: [{ message: { content: '```json\n{"english":"A warm English note.","urdu":"ایک گرم جوش اردو نوٹ۔"}\n```' } }],
      }),
    });
    const composed = await Service.compose(answers);
    expect(composed.source).toBe('llm');
    expect(composed.en).toBe('A warm English note.');
    expect(composed.ur).toBe('ایک گرم جوش اردو نوٹ۔');
    expect(llmCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the template when the LLM throws', async () => {
    const { Service } = load({ llm: async () => { throw new Error('402 no credits'); } });
    const composed = await Service.compose(answers);
    expect(composed.source).toBe('fallback');
    expect(composed.en).toContain(library.objections[0].reassurance_en);
  });

  it('falls back when the LLM returns something unparseable', async () => {
    const { Service } = load({ llm: async () => ({ choices: [{ message: { content: 'Sure! Here you go:' } }] }) });
    expect((await Service.compose(answers)).source).toBe('fallback');
  });

  it('falls back when the LLM drops one of the two languages', async () => {
    const { Service } = load({ llm: async () => ({ choices: [{ message: { content: '{"english":"only english"}' } }] }) });
    expect((await Service.compose(answers)).source).toBe('fallback');
  });

  it('trims over-long LLM output down to the word budget at a sentence boundary', async () => {
    const { Service } = load({
      llm: async () => {
        const long = `${Array.from({ length: 60 }, () => 'Word word word.').join(' ')}`;
        return { choices: [{ message: { content: JSON.stringify({ english: long, urdu: long }) } }] };
      },
    });
    const composed = await Service.compose(answers);
    expect(Service.countWords(composed.en)).toBeLessThanOrEqual(Service.WORD_LIMIT);
    expect(composed.en.trim().endsWith('.')).toBe(true);
  });
});

// ── The PDF gate ────────────────────────────────────────────────────────────

describe('PDF gating', () => {
  const answers = { userId: 'u1', reason: 'she reads better at home', age: 6, objection: 'no_friends' };

  it('is OFF when no Chromium is present — text still goes out', async () => {
    const { Service, sent, docs, inserted } = load({ chromium: false });
    expect(Service.isPdfAvailable()).toBe(false);

    const result = await Service.deliver('+923001234567', answers);
    expect(result.deliveredPdf).toBe(false);
    expect(docs).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toContain('English');
    expect(sent[0].message).toContain('اردو');
    expect(inserted[0].delivered_pdf).toBe(false);
  });

  it('is ON when Chromium is present, and sends the PDF after the text', async () => {
    const { Service, sent, docs, inserted } = load({ chromium: true });
    expect(Service.isPdfAvailable()).toBe(true);

    const result = await Service.deliver('+923001234567', answers);
    expect(result.deliveredPdf).toBe(true);
    expect(docs).toHaveLength(1);
    expect(docs[0].filename).toBe('Because-you-care.pdf');
    expect(path.isAbsolute(docs[0].filePath)).toBe(true);
    expect(sent).toHaveLength(1); // text first, always
    expect(inserted[0].delivered_pdf).toBe(true);
  });

  it('never records a PDF delivery the channel rejected', async () => {
    const { Service, inserted } = load({
      chromium: true,
      sendDocument: jest.fn(async () => false), // WhatsApp refused it
    });
    const result = await Service.deliver('+923001234567', answers);
    expect(result.deliveredPdf).toBe(false);
    expect(inserted[0].delivered_pdf).toBe(false);
  });

  it('degrades to text when the PDF render throws', async () => {
    jest.resetModules();
    const { Service, sent } = load({ chromium: true });
    jest.spyOn(Service, 'generatePdf').mockRejectedValue(new Error('chromium died'));
    const result = await Service.deliver('+923001234567', answers);
    expect(result.deliveredPdf).toBe(false);
    expect(sent).toHaveLength(1);
  });
});

// ── The analytics row ───────────────────────────────────────────────────────

describe('bridge_onepagers logging', () => {
  it('writes the hashed phone, never the number', async () => {
    const { Service, inserted } = load({ chromium: false });
    await Service.deliver('+923001234567', { userId: 'u1', reason: 'r', age: 6, objection: 'no_friends' });

    const row = inserted[0];
    expect(row.phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('923001234567');
    expect(row.objection_type).toBe('no_friends');
    expect(row.language).toBe('both');
    expect(typeof row.delivered_pdf).toBe('boolean');
  });

  it('hashes deterministically, so one family is one key', () => {
    const { Service } = load();
    expect(Service.hashPhone('+923001234567')).toBe(Service.hashPhone('+923001234567'));
    expect(Service.hashPhone('+923001234567')).not.toBe(Service.hashPhone('+923007654321'));
  });

  it('does not break a delivery that already happened when the insert fails', async () => {
    jest.resetModules();
    const { Service, sent } = load({ chromium: false });
    jest.spyOn(Service, 'logOnePager').mockResolvedValue(false);
    await expect(Service.deliver('+923001234567', { userId: 'u1', reason: 'r', age: 6, objection: 'no_friends' }))
      .resolves.toMatchObject({ objection: 'no_friends' });
    expect(sent).toHaveLength(1);
  });
});
