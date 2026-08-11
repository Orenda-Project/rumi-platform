/**
 * The bot must not offer something this deployment cannot deliver.
 *
 * Both cases below were seen live, and both come from the same shape: an asset
 * URL built by interpolating a base that isn't configured, producing a RELATIVE
 * path that nothing can fetch — while the surrounding code treats a non-empty
 * string as "available".
 *
 *  - feature intro videos: the bot asked "Want to see how? 🎥", the teacher
 *    accepted, and nothing arrived ("Could not extract R2 key from URL:
 *    /feature_videos/reading_intro.mp4").
 *  - reading passage backgrounds: a decorative image took the whole passage down
 *    with "TypeError: Invalid URL".
 */

const R2_PUBLIC_URL = 'https://pub-example.r2.dev';

function loadFeatureVideos(baseUrl) {
  jest.resetModules();
  if (baseUrl) process.env.R2_PUBLIC_URL = baseUrl;
  else delete process.env.R2_PUBLIC_URL;
  return require('../../bot/shared/constants/feature-videos');
}

afterEach(() => {
  delete process.env.R2_PUBLIC_URL;
  jest.resetModules();
});

describe('feature intro videos are presence-gated', () => {
  it('are null when no public base URL is configured', () => {
    const { FEATURE_VIDEO_URLS } = loadFeatureVideos(null);
    expect(FEATURE_VIDEO_URLS.lesson_plan).toBeNull();
    expect(FEATURE_VIDEO_URLS.coaching).toBeNull();
    expect(FEATURE_VIDEO_URLS.reading).toBeNull();
  });

  it('never produce a relative path — the bug that made the offer undeliverable', () => {
    const { FEATURE_VIDEO_URLS } = loadFeatureVideos(null);
    for (const url of Object.values(FEATURE_VIDEO_URLS)) {
      if (url !== null) expect(url).toMatch(/^https?:\/\//);
    }
  });

  it('are absolute URLs once a base is configured', () => {
    const { FEATURE_VIDEO_URLS } = loadFeatureVideos(R2_PUBLIC_URL);
    expect(FEATURE_VIDEO_URLS.reading).toBe(`${R2_PUBLIC_URL}/feature_videos/reading_intro.mp4`);
  });

  it('the consent offer is gated on actually having a video', () => {
    // suggestNext() sends the plain text suggestion instead of a "watch this"
    // button when there is no video — asserted against the source, since the
    // function needs Redis, the DB and a live socket to run.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../bot/shared/services/feature-linker.service.js'), 'utf-8'
    );
    expect(src).toMatch(/hasVideoToShow = Boolean\(FEATURE_VIDEO_URLS\[link\.feature\]\)/);
    expect(src).toMatch(/if \(hasSeenVideo \|\| !hasVideoToShow\)/);
  });
});

describe('reading passage backgrounds are presence-gated', () => {
  it('getRandomBackgroundUrl returns null with no base URL, rather than a relative path', () => {
    jest.resetModules();
    delete process.env.R2_PUBLIC_URL;
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }), { virtual: true });
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

    const PassageGeneration = require('../../bot/shared/services/reading/passage-generation.service');
    // Every passage type must be safe, not just the one that happens to be first.
    for (const type of ['letters', 'words', 'sentences', 'paragraph', 'story']) {
      const url = PassageGeneration.getRandomBackgroundUrl(type);
      if (url !== null) expect(url).toMatch(/^https?:\/\//);
    }
  });
});
