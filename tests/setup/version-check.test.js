const { checkForUpdates } = require('../../bot/shared/utils/version-check');

const GITHUB_API_URL =
  'https://api.github.com/repos/hyasin270/rumi-platform/releases/latest';

describe('checkForUpdates', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── Test 1: current version matches latest release ──
  it('returns { upToDate: true } when current version matches latest release', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.9.39',
        html_url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v2.9.39',
      }),
    });

    const result = await checkForUpdates('2.9.39');

    expect(result).toEqual({ upToDate: true });
    // Should NOT log anything when up to date
    expect(console.log).not.toHaveBeenCalled();
  });

  // ── Test 2: newer version exists ──
  it('returns update info when a newer version exists', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v3.0.0',
        html_url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v3.0.0',
      }),
    });

    const result = await checkForUpdates('2.9.39');

    expect(result).toEqual({
      upToDate: false,
      current: '2.9.39',
      latest: '3.0.0',
      url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v3.0.0',
    });
  });

  // ── Test 3: GitHub API is unreachable ──
  it('fails silently when GitHub API is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkForUpdates('2.9.39');

    expect(result).toEqual({ upToDate: true, error: 'Could not check' });
  });

  // ── Test 4: invalid JSON response ──
  it('fails silently when response is invalid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const result = await checkForUpdates('2.9.39');

    expect(result).toEqual({ upToDate: true, error: 'Could not check' });
  });

  // ── Test 5: uses correct GitHub API URL ──
  it('fetches from the correct GitHub API URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.9.39',
        html_url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v2.9.39',
      }),
    });

    await checkForUpdates('2.9.39');

    expect(global.fetch).toHaveBeenCalledWith(
      GITHUB_API_URL,
      expect.any(Object)
    );
  });

  // ── Test 6: passes User-Agent header ──
  it('passes User-Agent: rumi-platform header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.9.39',
        html_url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v2.9.39',
      }),
    });

    await checkForUpdates('2.9.39');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'rumi-platform',
        }),
      })
    );
  });

  // ── Edge cases ──
  it('handles non-ok HTTP response gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const result = await checkForUpdates('2.9.39');

    expect(result).toEqual({ upToDate: true, error: 'Could not check' });
  });

  it('strips leading "v" from tag_name when comparing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.9.39',
        html_url: 'https://github.com/hyasin270/rumi-platform/releases/tag/v2.9.39',
      }),
    });

    const result = await checkForUpdates('2.9.39');

    expect(result.upToDate).toBe(true);
  });
});
