/**
 * Cost Compass command parsing — the pure trigger module.
 *
 * Mirrors the homework/edit-class trigger tests: no handler graph, no mocks,
 * just "what would the bot do with this message".
 */

const path = require('path');
const ExamCostService = require('../../bot/shared/services/exam-cost.service');
const { parseExamCostCommand } = require('../../bot/shared/handlers/exam-cost-trigger');

// The parser resolves board and level names against whichever dataset is
// active, so pin it to the fixture for a deterministic grammar test.
ExamCostService.useDataDir(path.join(__dirname, 'fixtures'));
afterAll(() => ExamCostService.resetDataDir());

describe('parseExamCostCommand — the documented cost command', () => {
  it('parses the canonical example', () => {
    expect(parseExamCostCommand('cost "O Level" 6 cambridge,aku-eb Karachi')).toEqual({
      match: true,
      type: 'cost',
      level: 'O Level',
      subjects: 6,
      boardIds: ['cambridge', 'aku-eb'],
      city: 'Karachi',
      includeLate: false,
    });
  });

  it('accepts an unquoted level', () => {
    const d = parseExamCostCommand('cost O Level 6 cambridge Karachi');
    expect(d).toMatchObject({ type: 'cost', level: 'O Level', subjects: 6, city: 'Karachi' });
  });

  it('accepts a leading slash and mixed case', () => {
    expect(parseExamCostCommand('/COST IGCSE 5')).toMatchObject({
      type: 'cost', level: 'IGCSE', subjects: 5,
    });
  });

  it('accepts the "fee"/"fees" verb as well as "cost"', () => {
    expect(parseExamCostCommand('fees a-level 3 cambridge')).toMatchObject({
      type: 'cost', level: 'A Level', subjects: 3, boardIds: ['cambridge'],
    });
  });

  it('accepts "6 subjects" spelled out', () => {
    expect(parseExamCostCommand('cost o-level 6 subjects cambridge')).toMatchObject({
      type: 'cost', subjects: 6, boardIds: ['cambridge'],
    });
  });

  it('defaults to every board when none is named, and treats the rest as the city', () => {
    expect(parseExamCostCommand('cost "A Level" 4 Islamabad')).toMatchObject({
      type: 'cost', boardIds: [], city: 'Islamabad',
    });
  });

  it('never swallows a city name as a board', () => {
    expect(parseExamCostCommand('cost "O Level" 6 Lahore')).toMatchObject({
      boardIds: [], city: 'Lahore',
    });
  });

  it('picks up the late-entry flag anywhere in the message', () => {
    expect(parseExamCostCommand('cost o-level 8 late')).toMatchObject({
      type: 'cost', subjects: 8, includeLate: true,
    });
    expect(parseExamCostCommand('cost o-level 8')).toMatchObject({ includeLate: false });
  });

  it('never matches "as" inside "as level"', () => {
    expect(parseExamCostCommand('cost as level 2')).toMatchObject({ level: 'AS', subjects: 2 });
  });

  it('falls back to help when the level or subject count is missing', () => {
    expect(parseExamCostCommand('cost')).toEqual({ match: true, type: 'help' });
    expect(parseExamCostCommand('cost "O Level"')).toEqual({ match: true, type: 'help' });
    expect(parseExamCostCommand('cost 6')).toEqual({ match: true, type: 'help' });
  });
});

describe('parseExamCostCommand — deadlines', () => {
  it('parses the command form with a board', () => {
    expect(parseExamCostCommand('deadlines cambridge')).toEqual({
      match: true, type: 'deadlines', boardId: 'cambridge',
    });
  });

  it('parses the singular and the slash form', () => {
    expect(parseExamCostCommand('/deadline aku-eb')).toMatchObject({
      type: 'deadlines', boardId: 'aku-eb',
    });
  });

  it('returns a null board when none is named (= every board)', () => {
    expect(parseExamCostCommand('deadlines')).toEqual({
      match: true, type: 'deadlines', boardId: null,
    });
  });
});

describe('parseExamCostCommand — reminder opt-in / opt-out', () => {
  it('parses "remind me <board>"', () => {
    expect(parseExamCostCommand('remind me cambridge')).toEqual({
      match: true, type: 'remind', boardId: 'cambridge',
    });
  });

  it('parses "remind <board>" without "me", via an alias', () => {
    expect(parseExamCostCommand('remind akueb')).toMatchObject({
      type: 'remind', boardId: 'aku-eb',
    });
  });

  it('returns a null board when the board is missing, so the handler can ask', () => {
    expect(parseExamCostCommand('remind me')).toEqual({
      match: true, type: 'remind', boardId: null,
    });
  });

  it('parses "stop reminders" (and the singular) as a full-stop opt-out', () => {
    expect(parseExamCostCommand('stop reminders')).toEqual({ match: true, type: 'stop_reminders' });
    expect(parseExamCostCommand('  Stop Reminder ')).toEqual({ match: true, type: 'stop_reminders' });
  });

  it('opt-out wins over the reminder opt-in regex', () => {
    expect(parseExamCostCommand('stop reminders').type).not.toBe('remind');
  });
});

describe('parseExamCostCommand — natural language', () => {
  it('treats an exam-fee question as a help request rather than guessing', () => {
    for (const q of [
      'cambridge fee',
      'what are the exam fees now?',
      'how much does o level cost in Pakistan',
      'AKU-EB charges?',
      'cost of igcse these days',
    ]) {
      expect(parseExamCostCommand(q)).toEqual({ match: true, type: 'help' });
    }
  });

  it('routes a deadline question straight to deadlines', () => {
    expect(parseExamCostCommand("what's the deadline for aku-eb")).toMatchObject({
      type: 'deadlines', boardId: 'aku-eb',
    });
    expect(parseExamCostCommand('last date for cambridge entry')).toMatchObject({
      type: 'deadlines', boardId: 'cambridge',
    });
  });

  it('ignores everything unrelated — the handler must fall through', () => {
    for (const q of [
      '',
      'hello',
      '/menu',
      'lesson plan for fractions grade 5',
      'homework',
      'the cost of living is high',
      'reading test',
    ]) {
      expect(parseExamCostCommand(q)).toEqual({ match: false });
    }
  });

  it('does not hijack a lesson-plan request that happens to mention cost', () => {
    expect(parseExamCostCommand('make a lesson plan about opportunity cost').match).toBe(false);
  });
});

describe('route contract — the handler actually dispatches every parsed type', () => {
  // Mock-free source assertion, per pre-merge-checklist Class A: a service-layer
  // unit test mocks the handler and cannot catch a parsed command that nothing
  // routes. Every `type` parseExamCostCommand can return must appear in the
  // handler's dispatch, or the parse is an orphan.
  const fs = require('fs');
  const path = require('path');
  const handlerSrc = fs.readFileSync(
    path.resolve(__dirname, '../../bot/shared/handlers/text-message.handler.js'), 'utf8',
  );

  it('imports the trigger module', () => {
    expect(handlerSrc).toContain("require('./exam-cost-trigger')");
    expect(handlerSrc).toContain('parseExamCostCommand(messageBody)');
  });

  it('routes cost, deadlines, remind and stop_reminders', () => {
    for (const type of ['cost', 'deadlines', 'remind', 'stop_reminders']) {
      expect(handlerSrc).toContain(`examCost.type === '${type}'`);
    }
  });

  it('reaches the cost and deadline services', () => {
    expect(handlerSrc).toContain("require('../services/exam-cost.service')");
    expect(handlerSrc).toContain("require('../services/deadline-reminder.service')");
    expect(handlerSrc).toContain('formatEstimateReply');
    expect(handlerSrc).toContain('formatDeadlinesReply');
    expect(handlerSrc).toContain('formatUsage');
  });

  it('stops the typing indicator and returns rather than falling through to AI chat', () => {
    const block = handlerSrc.slice(
      handlerSrc.indexOf('const examCost = parseExamCostCommand'),
      handlerSrc.indexOf('HOMEWORK hot trigger'),
    );
    expect(block).toContain('typingController.stop()');
    expect(block).toMatch(/\breturn;/);
  });
});
