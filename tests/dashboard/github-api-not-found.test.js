/**
 * A 404 from GitHub's branch lookup must say "Branch not found", whichever
 * branch was asked for. getRepoTree's catch block named the repo's default
 * branch from a `config` declared inside the try, so with no branch passed
 * the 404 became "config is not defined".
 *
 * axios is the mocked boundary (virtual: CI runs this before dashboard deps).
 */

jest.mock('axios', () => ({
  get: jest.fn(async () => {
    const error = new Error('Request failed with status code 404');
    error.response = { status: 404 };
    throw error;
  }),
}), { virtual: true });

const githubAPI = require('../../dashboard/services/github-api.service');

describe('getRepoTree when the branch does not exist', () => {
  test('with no branch passed, names the default branch', async () => {
    const defaultBranch = githubAPI.GITHUB_REPOS['main-bot'].branch;
    await expect(githubAPI.getRepoTree('main-bot', null))
      .rejects.toThrow(`Branch not found: ${defaultBranch} in main-bot`);
  });

  test('with a branch passed, names that branch', async () => {
    await expect(githubAPI.getRepoTree('main-bot', 'feature-x'))
      .rejects.toThrow('Branch not found: feature-x in main-bot');
  });
});
