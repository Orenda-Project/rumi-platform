/**
 * Cost Compass reply formatting — what actually lands in the parent's chat.
 *
 * The contract: plain text, under the 1500-char budget, PKR with thousands
 * separators, one block per board, and the `as_of` / "estimated" flags always
 * visible while the dataset is a fixture.
 */

const path = require('path');
const ExamCostService = require('../../bot/shared/services/exam-cost.service');

// Frozen fixture, same rationale as exam-cost-service.test.js: these assert the
// SHAPE of a reply (separators, budget, block order), not today's real fees.
ExamCostService.useDataDir(path.join(__dirname, 'fixtures'));
afterAll(() => ExamCostService.resetDataDir());

const estimateFor = (opts) => ExamCostService.estimate({ level: 'O Level', subjects: 6, ...opts });

describe('formatEstimateReply', () => {
  const reply = ExamCostService.formatEstimateReply(
    estimateFor({ boardIds: ['cambridge', 'aku-eb'], city: 'Karachi' }),
    'en',
  );

  it('stays inside the WhatsApp reply budget', () => {
    expect(reply.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });

  it('formats PKR with thousands separators', () => {
    expect(reply).toContain('PKR 252,000');
    expect(reply).toContain('PKR 538,000');
    expect(reply).not.toMatch(/PKR \d{4,}(?!,)/);
  });

  it('names the level, subject count and city in the heading', () => {
    expect(reply.split('\n')[0]).toContain('O Level');
    expect(reply.split('\n')[0]).toContain('6 subjects');
    expect(reply.split('\n')[0]).toContain('Karachi');
  });

  it('renders one block per board, cheapest 2-year total first', () => {
    expect(reply).toContain('*Cambridge (CAIE, via British Council)*');
    expect(reply).toContain('*Aga Khan University Examination Board*');
    expect(reply.indexOf('Aga Khan')).toBeLessThan(reply.indexOf('Cambridge (CAIE'));
  });

  it('shows both the this-session and the 2-year total for each board', () => {
    expect(reply.match(/This session:/g)).toHaveLength(2);
    expect(reply.match(/2-year total:/g)).toHaveLength(2);
  });

  it('labels one-off registration fees so they are not read as recurring', () => {
    expect(reply).toContain('Private candidate registration: PKR 10,000 (one-off)');
  });

  it('always carries the as_of value and the estimate warning', () => {
    expect(reply).toContain('as_of FIXTURE');
    expect(reply).toMatch(/Estimate only/);
    // The footer is reserved out of the char budget, so it is never the first
    // thing a clamp drops.
    expect(reply.trimEnd().endsWith('(FIXTURE data)')).toBe(true);
  });

  it('uses no markdown a WhatsApp body cannot render', () => {
    expect(reply).not.toMatch(/^#|\[[^\]]+\]\(/m);
  });

  it('warns when the chosen city has no listed centre for a board', () => {
    const out = ExamCostService.formatEstimateReply(
      estimateFor({ boardIds: ['bise-lahore'], city: 'Karachi' }), 'en',
    );
    expect(out).toMatch(/No listed centre in Karachi/);
  });

  it('says a board does not offer the level instead of pricing it at zero', () => {
    const out = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: 'IGCSE', subjects: 4 }), 'en',
    );
    expect(out).toMatch(/IGCSE not listed/);
    expect(out).toMatch(/Offers: O Level, A Level/);
    expect(out).not.toMatch(/PKR 0\b/);
  });

  it('shows the late surcharge as its own line when requested', () => {
    const out = ExamCostService.formatEstimateReply(
      estimateFor({ boardIds: ['cambridge'], includeLate: true }), 'en',
    );
    expect(out).toContain('Late Stage 1 surcharge: PKR 108,000');
  });

  it('falls back to usage rather than a broken reply on bad input', () => {
    const out = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: 'Z Level', subjects: 2 }), 'en',
    );
    expect(out).toContain('cost "O Level" 6 cambridge,aku-eb Karachi');
  });

  it('stays inside the budget for the widest possible query', () => {
    const out = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: 'O Level', subjects: 12, includeLate: true, city: 'Quetta' }),
      'en',
    );
    expect(out.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });
});

describe('formatEstimateReply — language', () => {
  const result = estimateFor({ boardIds: ['cambridge'] });

  it('translates the labels into Urdu', () => {
    const ur = ExamCostService.formatEstimateReply(result, 'ur');
    expect(ur).toContain(ExamCostService.LABELS.ur.twoYearTotal);
    expect(ur).toContain(ExamCostService.LABELS.ur.heading);
  });

  it('leaves numbers, boards, levels and the currency code untranslated', () => {
    const ur = ExamCostService.formatEstimateReply(result, 'ur');
    expect(ur).toContain('PKR 252,000');
    expect(ur).toContain('O Level');
    expect(ur).toContain('Cambridge (CAIE, via British Council)');
  });

  it('falls back to English for a language with no strings, and for a locale tag', () => {
    const en = ExamCostService.formatEstimateReply(result, 'en');
    expect(ExamCostService.formatEstimateReply(result, 'sw')).toBe(en);
    expect(ExamCostService.formatEstimateReply(result, undefined)).toBe(en);
    expect(ExamCostService.formatEstimateReply(result, 'ur-PK'))
      .toBe(ExamCostService.formatEstimateReply(result, 'ur'));
  });
});

describe('formatDeadlinesReply', () => {
  const list = ExamCostService.nextDeadlines('cambridge', new Date('2027-02-01T00:00:00Z'));
  const reply = ExamCostService.formatDeadlinesReply(list, 'en');

  it('stays inside the reply budget', () => {
    expect(reply.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });

  it('shows the date, the day count and the confidence for each entry', () => {
    expect(reply).toContain('2027-02-12 · 11 days');
    expect(reply).toContain('confidence: estimated');
  });

  it('marks anything inside the urgency window', () => {
    expect(reply).toContain(ExamCostService.LABELS.en.urgent);
  });

  it('shows what a late stage adds per subject', () => {
    expect(reply).toContain('+PKR 18,000/subject');
  });

  it('says so plainly when there is nothing upcoming', () => {
    const empty = ExamCostService.formatDeadlinesReply([], 'en');
    expect(empty).toMatch(/No upcoming dated deadlines/);
    expect(empty).toContain('FIXTURE');
  });

  it('clamps a very long list on a line boundary', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      board: 'cambridge',
      session: `Session ${i}`,
      stage: 'Normal',
      date: '2030-01-01',
      fee_impact: 18000,
      confidence: 'estimated',
      daysUntil: 100 + i,
      urgent: false,
    }));
    const out = ExamCostService.formatDeadlinesReply(many, 'en');
    expect(out.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
    expect(out).toContain('…');
    // The as_of footer survives the clamp — it is reserved out of the budget.
    expect(out.trimEnd().endsWith('FIXTURE data)')).toBe(true);
  });
});

describe('formatReminderMessage', () => {
  const deadline = ExamCostService.nextDeadlines('cambridge', new Date('2027-01-29T00:00:00Z'))[0];
  const message = ExamCostService.formatReminderMessage(deadline, 'en');

  it('names the board, session, date and days remaining', () => {
    expect(message).toContain('cambridge');
    expect(message).toContain('May/June 2027');
    expect(message).toContain('2027-02-12');
    expect(message).toContain('in 14 days');
  });

  it('always tells the parent how to stop', () => {
    expect(message).toMatch(/stop reminders/i);
  });

  it('quotes the fee consequence when the dataset knows one', () => {
    const late = ExamCostService.nextDeadlines('cambridge', new Date('2027-03-03T00:00:00Z'))[0];
    expect(ExamCostService.formatReminderMessage(late, 'en')).toContain('PKR 18,000/subject');
  });

  it('stays inside the reply budget', () => {
    expect(message.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });
});

describe('formatUsage', () => {
  const usage = ExamCostService.formatUsage('en');

  it('documents all three commands and lists the real board ids', () => {
    expect(usage).toContain('cost "O Level" 6 cambridge,aku-eb Karachi');
    expect(usage).toContain('deadlines cambridge');
    expect(usage).toContain('remind me cambridge');
    for (const id of ExamCostService.boardIds()) expect(usage).toContain(id);
  });

  it('stays inside the reply budget', () => {
    expect(usage.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });
});

describe('formatCurrency', () => {
  it('groups thousands and rounds to whole rupees', () => {
    expect(ExamCostService.formatCurrency(0)).toBe('PKR 0');
    expect(ExamCostService.formatCurrency(999)).toBe('PKR 999');
    expect(ExamCostService.formatCurrency(1000)).toBe('PKR 1,000');
    expect(ExamCostService.formatCurrency(1234567)).toBe('PKR 1,234,567');
    expect(ExamCostService.formatCurrency(1500.6)).toBe('PKR 1,501');
  });
});
