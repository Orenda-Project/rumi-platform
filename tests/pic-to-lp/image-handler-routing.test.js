/**
 * Pic-to-LP routing inside image-message.handler.js.
 *
 * Covers tryPicLpRoute (active-session append, fresh-image enqueue, in-flight
 * skip) and handleCoalescedBatch (BOOK_PAGE → session + intent prompt;
 * NOT_BOOK_PAGE → generic vision fallback). All external deps are mocked.
 */

let mocks;

function load() {
  jest.resetModules();
  mocks = {
    whatsapp: {
      startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
      sendMessage: jest.fn().mockResolvedValue({}),
      sendInteractiveButtons: jest.fn().mockResolvedValue({}),
      downloadMedia: jest.fn().mockResolvedValue(Buffer.from('img')),
    },
    vision: { analyzeWithRetry: jest.fn().mockResolvedValue({ success: true, analysis: 'ok' }) },
    redis: { setNX: jest.fn().mockResolvedValue(true), get: jest.fn(), set: jest.fn().mockResolvedValue('OK') },
    r2: { uploadImageWithRetry: jest.fn().mockResolvedValue('https://r2/x.jpg') },
    session: {
      getActiveSession: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      appendPage: jest.fn().mockResolvedValue({}),
      cancelActiveForUser: jest.fn().mockResolvedValue(),
      updateStatus: jest.fn().mockResolvedValue({}),
    },
    collector: {
      appendPageAndPrompt: jest.fn().mockResolvedValue({ autoComplete: false, pageCount: 2 }),
      onComplete: jest.fn().mockResolvedValue(),
      promptIntent: jest.fn().mockResolvedValue(),
      startCollectingFromIntent: jest.fn().mockResolvedValue(),
    },
    coalescer: { enqueue: jest.fn() },
    classifier: { classifyImageType: jest.fn().mockResolvedValue({ type: 'BOOK_PAGE', confidence: 0.9 }) },
  };

  jest.doMock('../../bot/shared/services/whatsapp.service', () => mocks.whatsapp);
  jest.doMock('../../bot/shared/services/vision.service', () => mocks.vision);
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => mocks.redis);
  // Chainable supabase stub: every builder method returns the same object,
  // and it is thenable so `await ...insert().select().single()` resolves to
  // { data, error }. Enough for the image_analysis_requests insert/update path.
  const supaChain = {
    insert: () => supaChain,
    update: () => supaChain,
    select: () => supaChain,
    eq: () => supaChain,
    single: () => Promise.resolve({ data: { id: 'req-1' }, error: null }),
    then: (resolve) => resolve({ data: null, error: null }),
  };
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn(() => supaChain) }));
  jest.doMock('../../bot/shared/storage/r2', () => mocks.r2);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({
    logEvent: jest.fn(),
    runWithCorrelation: (id, fn) => fn(),
    generateCorrelationId: () => 'corr-1',
  }));
  jest.doMock('../../bot/shared/utils/language-cache', () => ({ getUserLanguage: jest.fn().mockResolvedValue('en') }));
  jest.doMock('../../bot/shared/database/bot-helpers', () => ({
    storeConversation: jest.fn().mockResolvedValue(),
    getOrCreateSession: jest.fn().mockResolvedValue('conv-1'),
  }));
  jest.doMock('../../bot/shared/services/pic-to-lp/pic-lp-session.service', () => mocks.session);
  jest.doMock('../../bot/shared/services/pic-to-lp/page-collector.service', () => mocks.collector);
  jest.doMock('../../bot/shared/services/pic-to-lp/image-batch-coalescer.service', () => mocks.coalescer);
  jest.doMock('../../bot/shared/services/pic-to-lp/classifier.service', () => mocks.classifier);

  return require('../../bot/shared/handlers/image-message.handler');
}

const user = { id: 'user-1', preferred_language: 'en' };
const typing = { stop: jest.fn() };

afterEach(() => jest.resetModules());

describe('tryPicLpRoute', () => {
  it('appends a page when a collecting_pages session is active', async () => {
    const h = load();
    mocks.session.getActiveSession.mockResolvedValue({ id: 'sess-1', status: 'collecting_pages' });
    const handled = await h.__test_only_tryPicLpRoute({
      user, from: '123', imageId: 'img-1', mimeType: 'image/jpeg', caption: '', typingController: typing,
    });
    expect(handled).toBe(true);
    expect(mocks.collector.appendPageAndPrompt).toHaveBeenCalledTimes(1);
    expect(mocks.coalescer.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues to the batch coalescer for a fresh image (no active session)', async () => {
    const h = load();
    mocks.session.getActiveSession.mockResolvedValue(null);
    const handled = await h.__test_only_tryPicLpRoute({
      user, from: '123', imageId: 'img-1', mimeType: 'image/jpeg', caption: '', typingController: typing,
    });
    expect(handled).toBe(true);
    expect(mocks.coalescer.enqueue).toHaveBeenCalledTimes(1);
  });

  it('skips (returns false) when a recent generating session is in flight', async () => {
    const h = load();
    mocks.session.getActiveSession.mockResolvedValue({
      id: 'sess-1', status: 'generating', created_at: new Date().toISOString(),
    });
    const handled = await h.__test_only_tryPicLpRoute({
      user, from: '123', imageId: 'img-1', mimeType: 'image/jpeg', caption: '', typingController: typing,
    });
    expect(handled).toBe(false);
    expect(mocks.coalescer.enqueue).not.toHaveBeenCalled();
  });
});

describe('handleCoalescedBatch', () => {
  const batch = {
    images: [{ mediaId: 'img-1', mimeType: 'image/jpeg', typingController: typing }],
    primary: { mediaId: 'img-1', mimeType: 'image/jpeg', typingController: typing },
    caption: '',
  };

  it('BOOK_PAGE → creates a session and prompts for intent', async () => {
    const h = load();
    mocks.classifier.classifyImageType.mockResolvedValue({ type: 'BOOK_PAGE', confidence: 0.9 });
    await h.handleCoalescedBatch({ user, from: '123', batch });
    expect(mocks.session.create).toHaveBeenCalledTimes(1);
    expect(mocks.collector.promptIntent).toHaveBeenCalledTimes(1);
  });

  it('NOT_BOOK_PAGE → falls through to generic vision analysis (no LP session)', async () => {
    const h = load();
    mocks.classifier.classifyImageType.mockResolvedValue({ type: 'CLASSROOM', confidence: 0.95 });
    await h.handleCoalescedBatch({ user, from: '123', batch });
    expect(mocks.session.create).not.toHaveBeenCalled();
    // generic vision path runs: idempotency lock + vision analysis
    expect(mocks.vision.analyzeWithRetry).toHaveBeenCalledTimes(1);
  });

  it('low-confidence BOOK_PAGE (<0.5) is treated as NOT_BOOK_PAGE', async () => {
    const h = load();
    mocks.classifier.classifyImageType.mockResolvedValue({ type: 'BOOK_PAGE', confidence: 0.4 });
    await h.handleCoalescedBatch({ user, from: '123', batch });
    expect(mocks.session.create).not.toHaveBeenCalled();
    expect(mocks.vision.analyzeWithRetry).toHaveBeenCalledTimes(1);
  });
});
