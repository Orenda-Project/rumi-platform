'use strict';
/**
 * A URL that R2 can't take a key from must not reach the logs through the
 * error's message.
 *
 * A public r2.dev URL has no `/<bucket>/` in its path, so extractKeyFromUrl
 * throws on it — and the URL opens without a signature (its path is the key).
 * The dashboard's generatePresignedUrl logs that error's message; the bot's
 * channel services log it when an R2 download falls back to fetching. The S3
 * SDK is the root suite's stub (tests/__mocks__/aws-sdk-*).
 */

const PUBLIC_URL = 'https://pub-abc123.r2.dev/videos/u1/v1.mp4';
const KEY_PATH = 'videos/u1/v1.mp4';

describe('extractKeyFromUrl on a public r2.dev URL — the URL stays out of the message', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.resetModules();
    process.env.R2_BUCKET_NAME = 'rumi-bucket';
    process.env.R2_ENDPOINT = 'https://acc123.r2.cloudflarestorage.com';
  });
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  test('dashboard generatePresignedUrl: returns null, and no console line carries the URL or its path', async () => {
    const lines = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      jest.spyOn(console, level).mockImplementation((...args) => { lines.push(args.map(String).join(' ')); });
    }
    const { generatePresignedUrl } = require('../../dashboard/services/r2.service');

    await expect(generatePresignedUrl(PUBLIC_URL)).resolves.toBeNull();

    const text = lines.join('\n');
    expect(text).toContain('Error generating presigned URL');
    expect(text).not.toContain(PUBLIC_URL);
    expect(text).not.toContain(KEY_PATH);
    expect(text).toContain('pub-abc123.r2.dev#sha256:');
  });

  test('bot extractKeyFromUrl: the thrown message names the host, not the URL', () => {
    const { extractKeyFromUrl } = require('../../bot/shared/storage/r2');
    let error;
    try { extractKeyFromUrl(PUBLIC_URL); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/^Could not extract R2 key from URL: pub-abc123\.r2\.dev#sha256:[0-9a-f]{12}\.mp4$/);
    expect(error.message).not.toContain(KEY_PATH);
  });

  test('a URL with the bucket in its path still yields its key', () => {
    const { extractKeyFromUrl } = require('../../bot/shared/storage/r2');
    const dash = require('../../dashboard/services/r2.service');
    const url = `https://acc123.r2.cloudflarestorage.com/rumi-bucket/${KEY_PATH}`;
    expect(extractKeyFromUrl(url)).toBe(KEY_PATH);
    expect(dash.extractKeyFromUrl(url)).toBe(KEY_PATH);
  });
});
