/**
 * The exam checker on a deployment with no object storage.
 *
 * Every photo used to go to R2 before anything else happened, so with no R2_*
 * set the upload failed three times and the teacher got "trouble processing
 * that image" — the exam checker could not run at all on a sandbox. It now
 * keeps its files on local disk instead, as voice notes, reading reports and
 * lesson-quiz pictures already do: written under TEMP_DIR and passed around as
 * file:// URLs, which the Baileys, Slack, Matrix and Discord drivers send
 * straight off disk.
 *
 * Two bugs on the way out are fixed with it, because the local path runs
 * through them:
 *   - the annotator fetched the original photo with a plain HTTP GET, which a
 *     private bucket refuses and a file:// URL cannot do;
 *   - delivery sent each marked page with sendImage(), which expects a local
 *     path or a media id, not a URL — so no marked page ever arrived.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('pdfkit', () => ({}), { virtual: true });

let tmpDir;
let mockR2;
let mockAxiosGet;
let mockLog;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-no-r2-'));
  mockR2 = {
    isR2Configured: jest.fn(() => false),
    uploadImageWithRetry: jest.fn(async () => 'https://acct.r2.cloudflarestorage.com/bucket/images/u/p.jpg'),
    uploadBuffer: jest.fn(async (buf, key) => `https://acct.r2.cloudflarestorage.com/bucket/${key}`),
    downloadFromR2: jest.fn(async () => Buffer.from('from-r2')),
    extractKeyFromUrl: jest.fn((url) => url.split('/bucket/')[1]),
  };
  mockAxiosGet = jest.fn(async () => ({ data: Buffer.from('from-http') }));
  mockLog = jest.fn();
  jest.doMock('../../bot/shared/storage/r2', () => mockR2);
  jest.doMock('axios', () => ({ get: mockAxiosGet }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: mockLog }));
  jest.doMock('../../bot/shared/utils/constants', () => ({
    ...jest.requireActual('../../bot/shared/utils/constants'),
    TEMP_DIR: tmpDir,
  }));
  delete process.env.CHANNEL_DRIVER;
  delete process.env.R2_ENDPOINT;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const storage = () => require('../../bot/shared/services/exam-checker/exam-storage');
const localPath = (url) => url.slice('file://'.length);

describe('exam-storage — where the exam checker keeps its files', () => {
  it('keeps a teacher photo on local disk when R2 is not configured', async () => {
    const url = await storage().storeExamImage({
      buffer: Buffer.from('photo-bytes'), userId: 'user-1', imageId: 'media-1', mimeType: 'image/jpeg',
    });

    expect(url).toMatch(/^file:\/\//);
    expect(localPath(url).startsWith(path.join(tmpDir, 'exam_checker') + path.sep)).toBe(true);
    expect(localPath(url)).toMatch(/\.jpg$/);
    expect(fs.readFileSync(localPath(url), 'utf8')).toBe('photo-bytes');
    expect(mockR2.uploadImageWithRetry).not.toHaveBeenCalled();
  });

  it('uploads the photo to R2, with its retries, when R2 is configured', async () => {
    mockR2.isR2Configured.mockReturnValue(true);
    const url = await storage().storeExamImage({
      buffer: Buffer.from('photo-bytes'), userId: 'user-1', imageId: 'media-1', mimeType: 'image/png',
    });

    expect(mockR2.uploadImageWithRetry).toHaveBeenCalledWith(Buffer.from('photo-bytes'), 'user-1', 'media-1', 'image/png');
    expect(url).toMatch(/^https:\/\//);
  });

  it('keeps a generated file (a marked page, a PDF) on disk without R2 and uploads it with R2', async () => {
    const local = await storage().storeExamFile({
      buffer: Buffer.from('png'), key: 'exams/s1/annotated_Ayesha_p1.png', contentType: 'image/png',
    });
    expect(fs.readFileSync(localPath(local), 'utf8')).toBe('png');
    expect(localPath(local)).toBe(path.join(tmpDir, 'exam_checker', 'exams', 's1', 'annotated_Ayesha_p1.png'));

    mockR2.isR2Configured.mockReturnValue(true);
    const remote = await storage().storeExamFile({
      buffer: Buffer.from('png'), key: 'exams/s1/annotated_Ayesha_p1.png', contentType: 'image/png',
    });
    expect(mockR2.uploadBuffer).toHaveBeenCalledWith(Buffer.from('png'), 'exams/s1/annotated_Ayesha_p1.png', 'image/png');
    expect(remote).toMatch(/^https:\/\//);
  });

  it('never writes outside its own folder, whatever the key or ids say', async () => {
    const file = await storage().storeExamFile({ buffer: Buffer.from('x'), key: '../../../etc/evil.png', contentType: 'image/png' });
    const photo = await storage().storeExamImage({ buffer: Buffer.from('x'), userId: '../..', imageId: '../../x', mimeType: 'image/jpeg' });

    const root = path.join(tmpDir, 'exam_checker') + path.sep;
    expect(localPath(file).startsWith(root)).toBe(true);
    expect(localPath(photo).startsWith(root)).toBe(true);
  });

  it('warns that the Meta driver cannot send a file kept on local disk', async () => {
    process.env.CHANNEL_DRIVER = 'meta';
    await storage().storeExamFile({ buffer: Buffer.from('x'), key: 'exams/s1/p.png', contentType: 'image/png' });
    expect(mockLog).toHaveBeenCalledWith(expect.stringMatching(/Meta driver cannot send/), expect.any(Object), 'warn');
  });

  it('reads a file back from local disk, from R2 with credentials, or over plain HTTP', async () => {
    const local = await storage().storeExamFile({ buffer: Buffer.from('on-disk'), key: 'exams/s1/a.png', contentType: 'image/png' });
    expect((await storage().readExamFile(local)).toString()).toBe('on-disk');

    mockR2.isR2Configured.mockReturnValue(true);
    expect((await storage().readExamFile('https://acct.r2.cloudflarestorage.com/bucket/images/u/p.jpg')).toString()).toBe('from-r2');
    expect(mockR2.downloadFromR2).toHaveBeenCalledWith('images/u/p.jpg');

    expect((await storage().readExamFile('https://cdn.example.org/page.jpg')).toString()).toBe('from-http');
    expect(mockAxiosGet).toHaveBeenCalledWith('https://cdn.example.org/page.jpg', expect.objectContaining({ responseType: 'arraybuffer' }));
  });

  it('refuses to read a file:// URL outside its own folder', async () => {
    await expect(storage().readExamFile('file:///etc/passwd')).rejects.toThrow(/outside the exam checker's folder/);
  });
});

describe('the photo the teacher sends', () => {
  it('opens a session and keeps the photo on disk when there is no R2', async () => {
    const added = [];
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
    jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
      startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
      sendMessage: jest.fn(async () => {}),
      sendInteractiveMessage: jest.fn(async () => {}),
      downloadMedia: jest.fn(async () => Buffer.from('teacher-photo')),
    }));
    jest.doMock('../../bot/shared/services/exam-checker/exam-session.service', () => {
      const session = { id: 'exam-1', user_id: 'user-1', status: 'collecting_images', original_images: [] };
      return {
        getActive: jest.fn(async () => null),
        getOrCreate: jest.fn(async () => session),
        getById: jest.fn(async () => session),
        addImage: jest.fn(async (id, url) => { added.push(url); session.original_images.push({ url, pageNumber: 1 }); }),
        updateStatus: jest.fn(async () => session),
        update: jest.fn(async () => session),
      };
    });

    const { handleExamImage } = require('../../bot/shared/handlers/exam-checker.handler');
    const result = await handleExamImage(
      { id: 'wamid.img', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'check exams' } },
      '15550001111',
      { id: 'user-1' },
    );

    expect(result).toEqual({ handled: true });
    expect(mockR2.uploadImageWithRetry).not.toHaveBeenCalled();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^file:\/\//);
    expect(fs.readFileSync(localPath(added[0]), 'utf8')).toBe('teacher-photo');
  });
});

describe('reading a photo kept on disk', () => {
  it('sends the model the photo bytes inline, since it cannot open a local file', async () => {
    const seen = [];
    jest.doMock('../../bot/shared/services/exam-checker/exam-vision.service', () => ({
      ...jest.requireActual('../../bot/shared/services/exam-checker/exam-vision.service'),
      readPageWithEscalation: jest.fn(async (url) => { seen.push(url); return { page_meta: {}, items: [], _model: 'google/gemini-3.5-flash' }; }),
    }));
    const url = await storage().storeExamImage({ buffer: Buffer.from('jpeg-bytes'), userId: 'u', imageId: 'm', mimeType: 'image/jpeg' });

    const OCRService = require('../../bot/shared/services/exam-checker/ocr.service');
    await OCRService.extractSingle(url);

    expect(seen[0]).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`);
  });
});

describe('drawing the marks', () => {
  function mockCanvas() {
    const ctx = new Proxy({}, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: (target, prop, value) => { target[prop] = value; return true; },
    });
    jest.doMock('canvas', () => ({
      registerFont: () => {},
      loadImage: jest.fn(async () => ({ width: 1000, height: 1400 })),
      createCanvas: () => ({ getContext: () => ctx, toBuffer: () => Buffer.from('annotated-png') }),
    }), { virtual: true });
    return require('canvas');
  }

  it('loads the original from disk and keeps the marked page on disk when there is no R2', async () => {
    const canvas = mockCanvas();
    const source = await storage().storeExamImage({ buffer: Buffer.from('original'), userId: 'u', imageId: 'm', mimeType: 'image/jpeg' });

    const AnnotationService = require('../../bot/shared/services/exam-checker/annotation.service');
    const out = await AnnotationService.annotateImage(source, {
      pageNumber: 1, studentName: 'Ayesha', grade: 'B', percentage: 60, totalMarks: 5, marksAwarded: 3,
      questionResults: [{ marksAwarded: 1, maxMarks: 1, feedback: 'ok', bbox: { x: 0.5, y: 0.2 } }],
      isFirstPage: true, language: 'en',
    }, 'exam-1');

    expect(canvas.loadImage).toHaveBeenCalledWith(Buffer.from('original'));
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(out).toMatch(/^file:\/\//);
    expect(fs.readFileSync(localPath(out), 'utf8')).toBe('annotated-png');
  });

  it('reads a private R2 original through the R2 client, not a plain HTTP GET the bucket would refuse', async () => {
    const canvas = mockCanvas();
    mockR2.isR2Configured.mockReturnValue(true);

    const AnnotationService = require('../../bot/shared/services/exam-checker/annotation.service');
    const out = await AnnotationService.annotateImage('https://acct.r2.cloudflarestorage.com/bucket/images/u/p.jpg', {
      pageNumber: 1, studentName: 'Ayesha', questionResults: [], isFirstPage: false, language: 'en',
    }, 'exam-1');

    expect(mockR2.downloadFromR2).toHaveBeenCalledWith('images/u/p.jpg');
    expect(canvas.loadImage).toHaveBeenCalledWith(Buffer.from('from-r2'));
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockR2.uploadBuffer).toHaveBeenCalledWith(Buffer.from('annotated-png'), 'exams/exam-1/annotated_Ayesha_p1.png', 'image/png');
    expect(out).toMatch(/^https:\/\//);
  });
});

describe('sending the marked pages back', () => {
  it('sends each marked page as a URL the channel driver resolves, local or remote', async () => {
    const whatsapp = {
      sendMessage: jest.fn(async () => true),
      sendImage: jest.fn(async () => true),
      sendImageFromUrl: jest.fn(async () => true),
    };
    jest.doMock('../../bot/shared/services/whatsapp.service', () => whatsapp);
    jest.doMock('../../bot/shared/config/branding', () => ({ portalUrl: () => null }));
    const DeliveryService = require('../../bot/shared/services/exam-checker/delivery.service');
    DeliveryService._delay = async () => {};

    await DeliveryService._sendAnnotatedImages('15550001111', [
      { student: 'Ayesha', images: ['file:///tmp/exam_checker/exams/s1/a.png', 'https://acct.r2.cloudflarestorage.com/bucket/exams/s1/b.png'] },
    ]);

    expect(whatsapp.sendImageFromUrl).toHaveBeenCalledTimes(2);
    expect(whatsapp.sendImageFromUrl).toHaveBeenCalledWith('15550001111', 'file:///tmp/exam_checker/exams/s1/a.png', "Ayesha's graded exam");
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
  });
});
