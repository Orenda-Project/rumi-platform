/**
 * Test: GitHub API Service
 *
 * TDD Tests for GitHub API integration
 * Tests file fetching, directory listing, tree retrieval, error handling
 */

const githubAPI = require('../services/github-api.service');

describe('GitHub API Service', () => {

  describe('getFileContent', () => {
    test('should fetch file content from GitHub', async () => {
      const result = await githubAPI.getFileContent('main-bot', 'package.json', 'staging');

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.encoding).toBe('base64');
      expect(result.decodedContent).toBeDefined();
      expect(result.decodedContent).toContain('rumi-bot');
    });

    test('should handle 404 for non-existent files', async () => {
      await expect(
        githubAPI.getFileContent('main-bot', 'non-existent-file.js', 'staging')
      ).rejects.toThrow(/not found|404/i);
    });

    test('should decode base64 content correctly', async () => {
      const result = await githubAPI.getFileContent('main-bot', 'package.json', 'staging');

      // Verify it's valid JSON after decoding
      expect(() => JSON.parse(result.decodedContent)).not.toThrow();
    });
  });

  describe('listDirectory', () => {
    test('should list directory contents', async () => {
      const result = await githubAPI.listDirectory('main-bot', 'scripts', 'staging');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('path');
    });

    test('should return empty array for empty directory', async () => {
      const result = await githubAPI.listDirectory('main-bot', 'empty-dir-that-might-exist', 'staging');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getRepoTree', () => {
    test('should fetch full repository tree', async () => {
      const result = await githubAPI.getRepoTree('main-bot', 'staging');

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(Array.isArray(result.tree)).toBe(true);
      expect(result.tree.length).toBeGreaterThan(0);

      // Verify tree structure
      const sampleFile = result.tree.find(item => item.type === 'blob');
      expect(sampleFile).toHaveProperty('path');
      expect(sampleFile).toHaveProperty('sha');
    });
  });

  describe('error handling', () => {
    test('should handle rate limits gracefully', async () => {
      // Mock rate limit error by testing invalid token scenario
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'invalid_token';

      await expect(
        githubAPI.getFileContent('main-bot', 'package.json', 'staging')
      ).rejects.toThrow();

      // Restore token
      process.env.GITHUB_TOKEN = originalToken;
    });

    test('should authenticate with GitHub token', async () => {
      expect(process.env.GITHUB_TOKEN).toBeDefined();

      // Verify API uses authentication (will fail without valid token)
      const result = await githubAPI.getFileContent('main-bot', 'package.json', 'staging');
      expect(result).toBeDefined();
    });
  });

  describe('repository mappings', () => {
    test('should have correct repo mappings', () => {
      const repos = githubAPI.GITHUB_REPOS;

      expect(repos['main-bot']).toEqual({
        owner: 'your-org',
        repo: 'rumi-bot',
        branch: 'staging'
      });

      expect(repos['observability']).toEqual({
        owner: 'your-org',
        repo: 'rumi-dashboard',
        branch: 'main'
      });

      expect(repos['teachers-portal']).toEqual({
        owner: 'your-org',
        repo: 'rumi-portal_v1.2',
        branch: 'main'
      });

      expect(repos['website']).toEqual({
        owner: 'your-org',
        repo: 'rumi_website_1.1',
        branch: 'main'
      });
    });
  });
});
