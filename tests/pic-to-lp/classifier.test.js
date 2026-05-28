/**
 * Pic-LP classifier — defensive defaults: returns OTHER on non-JSON output and
 * on a thrown error. (OpenAI mocked; never hits the network.)
 */

let Classifier;
let createImpl;
const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

function load() {
  jest.resetModules();
  createImpl = jest.fn();
  // The classifier reads OPENAI_API_KEY from process.env via the lazy-client
  // helper; set it here so lazyClient construction succeeds.
  process.env.OPENAI_API_KEY = 'test-openai-key';
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('openai', () => {
    return jest.fn().mockImplementation(() => ({
      chat: { completions: { create: createImpl } },
    }));
  });
  Classifier = require('../../bot/shared/services/pic-to-lp/classifier.service');
}

afterEach(() => {
  jest.resetModules();
  if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
});

const buf = Buffer.from('fake-image-bytes');

describe('classifyImageType', () => {
  it('returns a valid {type, confidence} on a well-formed JSON response', async () => {
    load();
    createImpl.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ type: 'BOOK_PAGE', confidence: 0.9 }) } }],
    });
    const r = await Classifier.classifyImageType(buf, 'image/jpeg', 'class 5 math');
    expect(r.type).toBe('BOOK_PAGE');
    expect(r.confidence).toBeCloseTo(0.9);
  });

  it('returns OTHER with confidence 0 on non-JSON output', async () => {
    load();
    createImpl.mockResolvedValue({
      choices: [{ message: { content: 'this is not json' } }],
    });
    const r = await Classifier.classifyImageType(buf, 'image/jpeg');
    expect(r).toEqual({ type: 'OTHER', confidence: 0 });
  });

  it('coerces an unrecognized type to OTHER', async () => {
    load();
    createImpl.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ type: 'NONSENSE', confidence: 0.5 }) } }],
    });
    const r = await Classifier.classifyImageType(buf, 'image/jpeg');
    expect(r.type).toBe('OTHER');
  });

  it('returns OTHER with confidence 0 when the API call throws', async () => {
    load();
    createImpl.mockRejectedValue(new Error('network down'));
    const r = await Classifier.classifyImageType(buf, 'image/jpeg');
    expect(r).toEqual({ type: 'OTHER', confidence: 0 });
  });

  it('exposes the VALID_TYPES set', () => {
    load();
    expect(Classifier.VALID_TYPES).toEqual(['BOOK_PAGE', 'CLASSROOM', 'STUDENT_WORK', 'EXAM', 'OTHER']);
  });
});
