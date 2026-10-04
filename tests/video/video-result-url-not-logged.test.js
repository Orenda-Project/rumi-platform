'use strict';
/**
 * A video task's result URL is stored and used, but never logged.
 *
 * `video_tasks.result_url` holds the generated clip's R2 URL — or, when the
 * R2 upload failed, Kie.ai's public result URL, which opens for anyone. The
 * services run for real; Kie.ai and the file download (fetch), R2 and the
 * database are faked at their boundaries, and every log line is captured.
 */
const fs = require('fs');
const path = require('path');

const KIE_RESULT = 'https://tempfile.example-cdn.com/k/abc123.mp4';
const R2_PUBLIC = 'https://pub-abc123.r2.dev/videos/vr-test-7/slide_1.mp4';

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadVideoAsset: jest.fn(async () => 'https://pub-abc123.r2.dev/videos/vr-test-7/slide_1.mp4'),
  isPermanentR2Url: (u) => Boolean(u) && u.includes('.r2.dev'),
  toPublicUrl: jest.fn(async (u) => u),
}));

const { logToFile } = require('../../bot/shared/utils/logger');
const { uploadVideoAsset } = require('../../bot/shared/storage/r2');
const VideoAnimationService = require('../../bot/shared/services/video/video-animation.service');
const VideoImageService = require('../../bot/shared/services/video/video-image.service');

const logged = () => JSON.stringify(logToFile.mock.calls);

// supabase.from(t).select(…).eq(…).eq(…).single() → { data: task };
// .update(patch).eq(…).eq(…) records the patch.
function fakeSupabase(task) {
  const updates = [];
  const chain = (result) => {
    const c = { eq: () => c, single: async () => result, then: (res) => res(result) };
    return c;
  };
  return {
    updates,
    from: () => ({
      select: () => chain({ data: task }),
      update: (patch) => { updates.push(patch); return chain({ error: null }); },
      upsert: async () => ({ error: null }),
    }),
  };
}

const realFetch = global.fetch;
let videoRequestId;
beforeEach(() => {
  jest.clearAllMocks();
  videoRequestId = `vr-test-${process.pid}-${Date.now()}`;
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
});
afterEach(() => {
  global.fetch = realFetch;
  fs.rmSync(path.join('/tmp', 'video-generation', videoRequestId), { recursive: true, force: true });
});

describe('video result_url stays out of the logs', () => {
  test('animation: a stored Kie.ai fallback URL is downloaded and re-uploaded, but never logged', async () => {
    const supabase = fakeSupabase({ task_id: 't1', status: 'completed', result_url: KIE_RESULT });

    const localPath = await VideoAnimationService.generateVideoWithTaskPersistence(
      'https://x.invalid/a.png', 'https://x.invalid/b.png', 'p', 5, videoRequestId, 1, supabase,
    );

    // Behaviour unchanged: the full URL was fetched, the clip re-uploaded and the R2 URL stored.
    expect(global.fetch).toHaveBeenCalledWith(KIE_RESULT);
    expect(uploadVideoAsset).toHaveBeenCalled();
    expect(supabase.updates).toEqual([{ result_url: R2_PUBLIC }]);
    expect(fs.existsSync(localPath)).toBe(true);

    const text = logged();
    expect(text).toContain('Re-uploading ephemeral video URL to R2');
    expect(text).not.toContain(KIE_RESULT);
    expect(text).not.toContain('/k/abc123.mp4');
    expect(text).not.toContain(R2_PUBLIC);
    expect(text).toContain('tempfile.example-cdn.com#sha256:');
  });

  test('animation: a cached permanent R2 URL is used, but never logged', async () => {
    const supabase = fakeSupabase({ task_id: 't1', status: 'completed', result_url: R2_PUBLIC });
    await VideoAnimationService.generateVideoWithTaskPersistence(
      'https://x.invalid/a.png', 'https://x.invalid/b.png', 'p', 5, videoRequestId, 1, supabase,
    );
    expect(global.fetch).toHaveBeenCalledWith(R2_PUBLIC);
    const text = logged();
    expect(text).toContain('Using cached video from R2');
    expect(text).not.toContain(R2_PUBLIC);
    expect(text).not.toContain('videos/vr-test-7/slide_1.mp4');
  });

  test('animation: the Kie.ai success poll returns the URL, and its logged body has it redacted', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ code: 200, data: { taskId: 't9', state: 'success', resultJson: JSON.stringify({ resultUrls: [KIE_RESULT] }) } }),
    }));
    await expect(VideoAnimationService.pollForCompletion('t9', 1, 0)).resolves.toBe(KIE_RESULT);
    const text = logged();
    expect(text).toContain('Kie.ai video poll status');
    expect(text).not.toContain('/k/abc123.mp4');
  });

  test('image: a cached permanent R2 URL is returned whole, but never logged', async () => {
    const supabase = fakeSupabase({ task_id: 't2', status: 'completed', result_url: R2_PUBLIC, ephemeral_url: null });
    const result = await VideoImageService.generateImageWithTaskPersistence('p', videoRequestId, 'slide_1_start', supabase);
    expect(result).toEqual({ r2Url: R2_PUBLIC, ephemeralUrl: R2_PUBLIC });
    const text = logged();
    expect(text).toContain('Using cached image from R2');
    expect(text).not.toContain(R2_PUBLIC);
    expect(text).not.toContain('videos/vr-test-7/slide_1.mp4');
  });

  test('image: the Kie.ai success poll returns the URL, and its logged body has it redacted', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ code: 200, data: { taskId: 't8', state: 'success', resultJson: JSON.stringify({ resultUrls: [KIE_RESULT] }) } }),
    }));
    await expect(VideoImageService.pollForCompletion('t8', 1, 0)).resolves.toBe(KIE_RESULT);
    const text = logged();
    expect(text).toContain('Kie.ai poll status');
    expect(text).not.toContain('/k/abc123.mp4');
  });
});
