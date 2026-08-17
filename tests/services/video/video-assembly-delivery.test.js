/**
 * video-assembly.service.js#assembleAndDeliver — the video-delivery fix
 * covered here: prefer sendVideoFromUrl(from, finalVideoUrl, ...) whenever
 * the R2 upload succeeded (finalVideoUrl truthy), avoiding a wasted
 * raw-buffer upload and sidestepping every channel's own per-upload size
 * limits (e.g. Discord's ~8MB safe ceiling on a bot DM channel) — falling
 * back to the raw-buffer sendVideo(...) only when R2 upload failed after all
 * retries. This is a real bug found while designing Discord's video
 * delivery: the fix benefits every channel, not just Discord.
 *
 * The FFmpeg/filesystem pipeline (syncAudioVideo/concatenateVideos/
 * concatenateAudio/mergeVideoAudio/generatePDF, all execSync-driven) is
 * mocked wholesale via jest.spyOn on the class's own static methods — this
 * test targets ONLY the delivery-branch logic the fix touches, not the video
 * assembly pipeline itself (which has no dedicated test suite and is out of
 * scope for this change).
 */

// pdfkit is a bot-only dependency (bot/package.json, not the repo root) —
// video-assembly.service.js requires it at module load time regardless of
// whether generatePDF() is ever called, so this must be mocked even though
// this suite never touches PDF generation. Matches the CI-ordering lesson
// already established for other bot-only deps (see jest.config.js's
// moduleNameMapper for @ffmpeg-installer/ffmpeg etc.) — root `npm test` runs
// BEFORE `bot/ npm ci`, so an unmocked require here passes locally (if
// bot/node_modules happens to be installed) but fails in real CI.
jest.mock('pdfkit', () => class FakePDFDocument {}, { virtual: true });

jest.mock('../../../bot/shared/config/supabase', () => ({
  from: jest.fn(() => ({
    update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })),
  })),
}));

jest.mock('../../../bot/shared/storage/r2', () => ({
  uploadVideoAsset: jest.fn(),
}));

jest.mock('../../../bot/shared/services/whatsapp.service', () => ({
  sendVideo: jest.fn().mockResolvedValue(true),
  sendVideoFromUrl: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true),
  sendDocument: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../bot/shared/utils/language-cache', () => ({ getUserLanguage: jest.fn().mockResolvedValue('en') }));
jest.mock('../../../bot/shared/config/branding', () => ({ portalUrl: jest.fn(() => null) }));
jest.mock('../../../bot/shared/services/video/video-session.service', () => ({
  getProgressMessages: jest.fn(() => ({ complete: 'Your video is ready!' })),
}));
jest.mock('../../../bot/shared/services/video/video-watermark.service', () => ({
  addWatermark: jest.fn().mockResolvedValue({ success: true, path: '/tmp/final.mp4', skipped: true }),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  copyFileSync: jest.fn(),
  readFileSync: jest.fn(() => Buffer.from('fake-video-bytes')),
  existsSync: jest.fn(() => true),
  rmSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const VideoAssemblyService = require('../../../bot/shared/services/video/video-assembly.service');
const WhatsAppService = require('../../../bot/shared/services/whatsapp.service');
const { uploadVideoAsset } = require('../../../bot/shared/storage/r2');

const BASE_OPTIONS = {
  from: '923001234567',
  userId: 'u1',
  language: 'en',
  videoPaths: ['/tmp/v1.mp4'],
  audioPaths: ['/tmp/a1.mp3'],
  slideUrls: ['https://example.com/slide1.png'],
};

function stubFfmpegPipeline() {
  jest.spyOn(VideoAssemblyService, 'syncAudioVideo').mockResolvedValue(['/tmp/adjusted1.mp4']);
  jest.spyOn(VideoAssemblyService, 'concatenateVideos').mockResolvedValue(undefined);
  jest.spyOn(VideoAssemblyService, 'concatenateAudio').mockResolvedValue(undefined);
  jest.spyOn(VideoAssemblyService, 'mergeVideoAudio').mockResolvedValue(undefined);
}

afterEach(() => jest.clearAllMocks());

describe('assembleAndDeliver — video delivery branch', () => {
  it('prefers sendVideoFromUrl with the R2 url when upload succeeds — never touches the raw buffer', async () => {
    stubFfmpegPipeline();
    uploadVideoAsset.mockResolvedValue('https://videorequests.r2.cloudflarestorage.com/final.mp4');

    await VideoAssemblyService.assembleAndDeliver('req-1', BASE_OPTIONS);

    expect(WhatsAppService.sendVideoFromUrl).toHaveBeenCalledWith(
      '923001234567', 'https://videorequests.r2.cloudflarestorage.com/final.mp4', 'Your video is ready!',
    );
    expect(WhatsAppService.sendVideo).not.toHaveBeenCalled();
  });

  it('falls back to the raw-buffer sendVideo when R2 upload fails after all retries', async () => {
    stubFfmpegPipeline();
    uploadVideoAsset.mockRejectedValue(new Error('R2 unreachable'));
    jest.useFakeTimers();

    const deliveryPromise = VideoAssemblyService.assembleAndDeliver('req-2', BASE_OPTIONS);
    // 3 retries with a 2000ms*attempt backoff between them — flush each wait
    // without actually sleeping in real time.
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    await deliveryPromise;

    jest.useRealTimers();

    expect(WhatsAppService.sendVideo).toHaveBeenCalledTimes(1);
    const [to, buffer, , caption] = WhatsAppService.sendVideo.mock.calls[0];
    expect(to).toBe('923001234567');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(caption).toBe('Your video is ready!');
    expect(WhatsAppService.sendVideoFromUrl).not.toHaveBeenCalled();
  });
});
