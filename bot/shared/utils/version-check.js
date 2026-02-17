const GITHUB_API_URL =
  'https://api.github.com/repos/Orenda-Project/rumi-platform/releases/latest';

/**
 * Checks GitHub releases API for a newer version of rumi-platform.
 * Never throws - all errors are caught and returned as a silent failure.
 *
 * @param {string} currentVersion - The current semver version (e.g. "2.9.39")
 * @returns {Promise<Object>} Result object:
 *   - { upToDate: true } when current version matches latest
 *   - { upToDate: false, current, latest, url } when update available
 *   - { upToDate: true, error: 'Could not check' } on any failure
 */
async function checkForUpdates(currentVersion) {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'User-Agent': 'rumi-platform',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return { upToDate: true, error: 'Could not check' };
    }

    const release = await response.json();
    const tagName = release.tag_name || '';
    const latestVersion = tagName.replace(/^v/, '');

    if (latestVersion === currentVersion) {
      return { upToDate: true };
    }

    // A different version exists on GitHub - report it as an available update
    console.log(
      `[version-check] Update available: ${currentVersion} -> ${latestVersion}`
    );
    console.log(`[version-check] Download: ${release.html_url}`);

    return {
      upToDate: false,
      current: currentVersion,
      latest: latestVersion,
      url: release.html_url,
    };
  } catch (err) {
    // Network errors, JSON parse errors, etc. - fail silently
    return { upToDate: true, error: 'Could not check' };
  }
}

module.exports = { checkForUpdates };
