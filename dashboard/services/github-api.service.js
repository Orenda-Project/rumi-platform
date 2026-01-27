/**
 * GitHub API Service
 *
 * Fetches files, directories, and repository trees from GitHub
 * Used by BYOF agent to access codebase without local filesystem
 */

const axios = require('axios');

// Repository mappings — update these with your GitHub org/repo names
const GITHUB_ORG = process.env.GITHUB_ORG || 'your-github-org';
const GITHUB_REPOS = {
  'main-bot': {
    owner: GITHUB_ORG,
    repo: process.env.GITHUB_REPO_BOT || 'rumi-platform',
    branch: process.env.GITHUB_BRANCH_BOT || 'main'
  },
  'observability': {
    owner: GITHUB_ORG,
    repo: process.env.GITHUB_REPO_DASHBOARD || 'rumi-platform',
    branch: 'main'
  },
  'teachers-portal': {
    owner: GITHUB_ORG,
    repo: process.env.GITHUB_REPO_PORTAL || 'rumi-platform',
    branch: 'main'
  },
  'website': {
    owner: GITHUB_ORG,
    repo: process.env.GITHUB_REPO_WEBSITE || 'rumi-platform',
    branch: 'main'
  }
};

/**
 * Get GitHub API headers with authentication
 */
function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Rumi-Dashboard'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

/**
 * Get repository config by key
 */
function getRepoConfig(repoKey) {
  const config = GITHUB_REPOS[repoKey];
  if (!config) {
    throw new Error(`Unknown repository: ${repoKey}. Valid keys: ${Object.keys(GITHUB_REPOS).join(', ')}`);
  }
  return config;
}

/**
 * Fetch file content from GitHub
 *
 * @param {string} repoKey - Repository key (e.g., 'main-bot')
 * @param {string} filePath - Path to file in repository
 * @param {string} branch - Branch name (optional, defaults to repo's default branch)
 * @returns {Promise<Object>} File metadata and decoded content
 */
async function getFileContent(repoKey, filePath, branch = null) {
  try {
    const config = getRepoConfig(repoKey);
    const branchToUse = branch || config.branch;

    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${branchToUse}`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    // Decode base64 content
    let decodedContent = '';
    if (response.data.encoding === 'base64' && response.data.content) {
      decodedContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
    }

    return {
      name: response.data.name,
      path: response.data.path,
      sha: response.data.sha,
      size: response.data.size,
      url: response.data.url,
      html_url: response.data.html_url,
      git_url: response.data.git_url,
      download_url: response.data.download_url,
      type: response.data.type,
      content: response.data.content,
      encoding: response.data.encoding,
      decodedContent
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`File not found: ${filePath} in ${repoKey}`);
    }
    if (error.response && error.response.status === 403) {
      throw new Error(`GitHub API rate limit exceeded or authentication failed`);
    }
    if (error.response && error.response.status === 401) {
      throw new Error(`GitHub authentication failed. Check GITHUB_TOKEN`);
    }
    throw new Error(`GitHub API error: ${error.message}`);
  }
}

/**
 * List directory contents
 *
 * @param {string} repoKey - Repository key
 * @param {string} dirPath - Path to directory
 * @param {string} branch - Branch name (optional)
 * @returns {Promise<Array>} Array of file/directory objects
 */
async function listDirectory(repoKey, dirPath, branch = null) {
  try {
    const config = getRepoConfig(repoKey);
    const branchToUse = branch || config.branch;

    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${dirPath}?ref=${branchToUse}`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    // If it's a single file, return empty array
    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data.map(item => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      size: item.size,
      url: item.url,
      html_url: item.html_url,
      git_url: item.git_url,
      download_url: item.download_url,
      type: item.type
    }));
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // Directory doesn't exist or is empty
      return [];
    }
    if (error.response && error.response.status === 403) {
      throw new Error(`GitHub API rate limit exceeded or authentication failed`);
    }
    throw new Error(`GitHub API error: ${error.message}`);
  }
}

/**
 * Get full repository tree (recursive)
 *
 * @param {string} repoKey - Repository key
 * @param {string} branch - Branch name (optional)
 * @returns {Promise<Object>} Repository tree object
 */
async function getRepoTree(repoKey, branch = null) {
  try {
    const config = getRepoConfig(repoKey);
    const branchToUse = branch || config.branch;

    // First, get the branch to get the commit SHA
    const branchUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/branches/${branchToUse}`;
    const branchResponse = await axios.get(branchUrl, {
      headers: getHeaders(),
      timeout: 10000
    });

    const commitSha = branchResponse.data.commit.sha;

    // Get the tree recursively
    const treeUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${commitSha}?recursive=1`;
    const treeResponse = await axios.get(treeUrl, {
      headers: getHeaders(),
      timeout: 30000 // Longer timeout for tree requests
    });

    return {
      sha: treeResponse.data.sha,
      url: treeResponse.data.url,
      tree: treeResponse.data.tree.map(item => ({
        path: item.path,
        mode: item.mode,
        type: item.type,
        sha: item.sha,
        size: item.size,
        url: item.url
      })),
      truncated: treeResponse.data.truncated
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`Branch not found: ${branch || config.branch} in ${repoKey}`);
    }
    if (error.response && error.response.status === 403) {
      throw new Error(`GitHub API rate limit exceeded or authentication failed`);
    }
    throw new Error(`GitHub API error: ${error.message}`);
  }
}

module.exports = {
  GITHUB_REPOS,
  getFileContent,
  listDirectory,
  getRepoTree
};
