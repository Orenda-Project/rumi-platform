/**
 * quiz-session.service — Redis state read/recover, session-end state
 * transitions, and post-quiz chat lifecycle. All top-level deps mocked.
 */

let QuizSessionService;
let redisMock;
let supabaseFrom;
let whatsappSend;
let mockChatCreate;

function makeSupabaseChain(result = { data: null, error: null }) {
  // Generic chainable builder where every terminal returns `result`.
  const chain = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'lt', 'gt', 'not', 'order', 'limit'];
  for (const m of methods) chain[m] = jest.fn(() => chain);
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  // make the chain itself awaitable (resolves to result)
  chain.then = (resolve) => resolve(result);
  return chain;
}

beforeEach(() => {
  jest.resetModules();
  process.env.OPENAI_API_KEY = 'sk-test';

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  redisMock = {
    redis: { get: jest.fn(), del: jest.fn().mockResolvedValue(1), set: jest.fn() },
    setexWithCeiling: jest.fn().mockResolvedValue('OK'),
  };
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redisMock);

  supabaseFrom = jest.fn(() => makeSupabaseChain());
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: supabaseFrom, rpc: jest.fn().mockResolvedValue({ error: null }) }));

  whatsappSend = jest.fn().mockResolvedValue(true);
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
    sendMessage: whatsappSend,
    sendInteractiveButtons: jest.fn().mockResolvedValue(true),
    sendButtons: jest.fn().mockResolvedValue(true),
  }));

  // SQS queue — present but not exercised; mock so module loads.
  jest.doMock('../../bot/shared/services/queue/sqs-queue.service', () => ({
    sendMessage: jest.fn(),
    enqueueQuizJob: jest.fn(),
  }));

  // constants pulls dotenv → mock to avoid loading the real one
  jest.doMock('../../bot/shared/utils/constants', () => ({ OPENAI_API_KEY: 'sk-test' }));

  mockChatCreate = jest.fn();
  jest.doMock(
    'openai',
    () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockChatCreate } } })),
    { virtual: true }
  );

  QuizSessionService = require('../../bot/shared/services/quiz/quiz-session.service');
});

afterEach(() => jest.resetModules());

describe('getActiveState', () => {
  it('parses and returns the Redis state on a hit', async () => {
    const state = { sessionId: 's1', quizId: 'q1', studentId: 'st1', currentDifficulty: 3 };
    redisMock.redis.get.mockResolvedValue(JSON.stringify(state));
    const out = await QuizSessionService.getActiveState('923001234567');
    expect(out).toEqual(state);
  });

  it('falls back to DB recovery on a Redis miss', async () => {
    redisMock.redis.get.mockResolvedValue(null);
    // _recoverFromDB queries supabase; with null rows it should return null.
    const out = await QuizSessionService.getActiveState('923001234567');
    expect(out).toBeNull();
    expect(supabaseFrom).toHaveBeenCalled();
  });

  it('returns null and does not throw if Redis errors', async () => {
    redisMock.redis.get.mockRejectedValue(new Error('redis down'));
    const out = await QuizSessionService.getActiveState('923001234567');
    expect(out).toBeNull();
  });
});

describe('endSession — status transitions', () => {
  it('writes status=incomplete and sends the "Quiz ended" message on STOP', async () => {
    const updateChain = makeSupabaseChain({ data: {}, error: null });
    supabaseFrom.mockReturnValue(updateChain);

    await QuizSessionService.endSession('923001234567', { sessionId: 's1' }, 'incomplete');

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'incomplete' })
    );
    expect(redisMock.redis.del).toHaveBeenCalled();
    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('writes status=cancelled WITHOUT a message (handleAnswer already messaged)', async () => {
    const updateChain = makeSupabaseChain({ data: {}, error: null });
    supabaseFrom.mockReturnValue(updateChain);

    await QuizSessionService.endSession('923001234567', { sessionId: 's1' }, 'cancelled');

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('defaults unknown reasons to completed', async () => {
    const updateChain = makeSupabaseChain({ data: {}, error: null });
    supabaseFrom.mockReturnValue(updateChain);

    await QuizSessionService.endSession('923001234567', { sessionId: 's1' }, 'weird');

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('post-quiz chat lifecycle', () => {
  it('getPostQuizState parses Redis JSON or returns null on miss', async () => {
    redisMock.redis.get.mockResolvedValueOnce(JSON.stringify({ _msgCount: 2 }));
    expect(await QuizSessionService.getPostQuizState('923001234567')).toEqual({ _msgCount: 2 });

    redisMock.redis.get.mockResolvedValueOnce(null);
    expect(await QuizSessionService.getPostQuizState('923001234567')).toBeNull();
  });

  it('endPostQuizChat clears Redis and sends a goodbye', async () => {
    await QuizSessionService.endPostQuizChat('923001234567');
    expect(redisMock.redis.del).toHaveBeenCalled();
    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('handlePostQuizChat ends the chat once the 20-message cap is exceeded', async () => {
    await QuizSessionService.handlePostQuizChat('923001234567', 'hi', { _msgCount: 20 });
    // ends chat → goodbye message, no LLM call
    expect(mockChatCreate).not.toHaveBeenCalled();
    expect(redisMock.redis.del).toHaveBeenCalled();
  });

  it('handlePostQuizChat silently ignores rapid-fire messages (< 3s apart)', async () => {
    await QuizSessionService.handlePostQuizChat('923001234567', 'hi', {
      _msgCount: 1,
      _lastMsgAt: Date.now(),
    });
    expect(mockChatCreate).not.toHaveBeenCalled();
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('handlePostQuizChat calls the LLM and replies on a normal turn', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Great question!' } }] });
    await QuizSessionService.handlePostQuizChat('923001234567', 'why is the sky blue?', {
      _msgCount: 1,
      _lastMsgAt: 0,
      messages: [],
    });
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    expect(whatsappSend).toHaveBeenCalledWith('923001234567', 'Great question!');
    expect(redisMock.setexWithCeiling).toHaveBeenCalled();
  });
});
