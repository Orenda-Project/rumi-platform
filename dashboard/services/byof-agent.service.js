/**
 * BYOF Agent Service - The Forge AI Integration
 *
 * Provides Claude AI-powered chat for bug reporting and feature planning.
 * Uses the Anthropic API for intelligent conversations about the codebase.
 *
 * @author Claude Opus 4.5
 * @date December 31, 2025
 */

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs').promises;
const byofService = require('./byof.service');
const redisCache = require('./redis-cache.service');
const githubAPI = require('./github-api.service');

// Initialize Anthropic client
let anthropic = null;
function getAnthropicClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

// Repository mappings (using GitHub API instead of filesystem)
const REPO_MAPPINGS = {
  'main-bot': { key: 'main-bot', branch: 'staging' },
  'observability': { key: 'observability', branch: 'main' },
  'teachers-portal': { key: 'teachers-portal', branch: 'main' },
  'website': { key: 'website', branch: 'main' }
};

// Legacy paths for local development (fallback if GitHub API fails)
const REPO_PATHS = {
  'main-bot': path.resolve(__dirname, '../../02_Main Rumi Bot'),
  'observability': path.resolve(__dirname, '../../04_Observability Portal'),
  'teachers-portal': path.resolve(__dirname, '../../03_Rumi Portal'),
  'website': path.resolve(__dirname, '../../05_Rumi Website')
};

/**
 * Generate system prompt for the AI agent
 */
function generateSystemPrompt(session) {
  const typeDescription = session.type === 'bug'
    ? 'bug report - something is not working as expected'
    : 'feature request - a new capability or improvement';

  return `You are The Forge AI, an intelligent assistant that helps users report bugs and plan features for Rumi, an AI-powered WhatsApp educational bot.

## Current Session
- Session ID: ${session.id}
- Type: ${session.type} (${typeDescription})
- Title: ${session.title || 'Untitled'}

## Available Repositories
You have access to search and read files from these codebases:
1. **main-bot** (02_Main Rumi Bot): The core WhatsApp bot - message handling, AI integrations, features
2. **observability** (04_Observability Portal): Admin dashboard - analytics, user management, this portal
3. **teachers-portal** (03_Rumi Portal): Teacher-facing web app - lesson management, coaching
4. **website** (05_Rumi Website): Public website - landing pages, documentation

## Your Workflow

### Phase 1: UNDERSTAND
Ask clarifying questions to fully understand the issue or feature request.
- What exactly is happening vs. what should happen?
- When did this start? Is it consistent?
- What steps reproduce the issue?
- For features: What problem does this solve? Who benefits?

### Phase 2: INVESTIGATE
Use your tools to search the codebase and understand the relevant code.
- Search for related files and functions
- Read the specific code involved
- Understand the data flow and dependencies
- Look at related tests and documentation

### Phase 3: DIAGNOSE
For bugs: Identify the root cause with evidence from the code.
For features: Identify all files and components that would need changes.

### Phase 4: PLAN
Create a detailed implementation plan in Markdown format.
Include:
- Summary of the issue/feature
- Root cause analysis (for bugs)
- Proposed solution with specific file changes
- Implementation steps in priority order
- Testing recommendations
- Rollback strategy (for bugs)

### Phase 5: CONFIRM
Present your plan and ask for approval before considering the session complete.

## Guidelines
- Be conversational and helpful
- Ask one or two questions at a time, not a long list
- Show your work - quote relevant code when investigating
- Be specific about file paths and line numbers
- When you've completed investigation, explicitly say "I'm ready to create a plan"
- Keep responses concise but informative`;
}

/**
 * Tool definitions for the AI agent
 */
const BYOF_TOOLS = [
  {
    name: 'search_codebase',
    description: 'Search for files or code patterns across the codebase. Use this to find relevant files, functions, or patterns.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be a filename, function name, or code pattern'
        },
        repo: {
          type: 'string',
          enum: ['main-bot', 'observability', 'teachers-portal', 'website', 'all'],
          description: 'Which repository to search (default: all)'
        },
        file_type: {
          type: 'string',
          description: 'Optional file extension filter (e.g., "js", "ejs", "css")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a specific file. Use this after searching to examine code in detail.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repository root (e.g., "src/handlers/message.js")'
        },
        repo: {
          type: 'string',
          enum: ['main-bot', 'observability', 'teachers-portal', 'website'],
          description: 'Which repository the file is in'
        },
        start_line: {
          type: 'number',
          description: 'Optional: start reading from this line number'
        },
        end_line: {
          type: 'number',
          description: 'Optional: stop reading at this line number'
        }
      },
      required: ['path', 'repo']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory. Use this to understand project structure.',
    input_schema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory path relative to repository root (e.g., "src/services")'
        },
        repo: {
          type: 'string',
          enum: ['main-bot', 'observability', 'teachers-portal', 'website'],
          description: 'Which repository to list files from'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list files recursively (default: false)'
        }
      },
      required: ['directory', 'repo']
    }
  },
  {
    name: 'generate_plan',
    description: 'Generate and save an implementation plan. Use this when you have completed investigation and are ready to propose a solution.',
    input_schema: {
      type: 'object',
      properties: {
        plan_markdown: {
          type: 'string',
          description: 'The full implementation plan in Markdown format'
        },
        summary: {
          type: 'string',
          description: 'A one-line summary of the plan'
        },
        affected_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that will need changes'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Priority level of this fix/feature'
        }
      },
      required: ['plan_markdown', 'summary']
    }
  }
];

/**
 * Execute a tool call
 * @param {string} toolName - Name of the tool to execute
 * @param {object} toolInput - Input parameters for the tool
 * @param {string} sessionId - Session ID for context (needed for generate_plan)
 */
async function executeTool(toolName, toolInput, sessionId = null) {
  switch (toolName) {
    case 'search_codebase':
      return await searchCodebase(toolInput);
    case 'read_file':
      return await readFile(toolInput);
    case 'list_files':
      return await listFiles(toolInput);
    case 'generate_plan':
      return await generatePlan(toolInput, sessionId);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * Search codebase for files or patterns (using GitHub API)
 */
async function searchCodebase({ query, repo = 'all', file_type }) {
  const results = [];
  const repos = repo === 'all' ? Object.keys(REPO_MAPPINGS) : [repo];

  for (const repoName of repos) {
    const repoMapping = REPO_MAPPINGS[repoName];
    if (!repoMapping) continue;

    try {
      // Get repository tree from GitHub
      const tree = await githubAPI.getRepoTree(repoMapping.key, repoMapping.branch);

      // Filter tree based on query and file type
      const matchingFiles = tree.tree
        .filter(item => {
          if (item.type !== 'blob') return false; // Only files, not directories

          const fileName = item.path.split('/').pop();
          const matchesQuery = item.path.toLowerCase().includes(query.toLowerCase()) ||
                             fileName.toLowerCase().includes(query.toLowerCase());
          const matchesType = !file_type || item.path.endsWith(`.${file_type}`);

          return matchesQuery && matchesType;
        })
        .map(item => ({
          repo: repoName,
          path: item.path,
          size: item.size
        }));

      results.push(...matchingFiles);
    } catch (error) {
      console.error(`[BYOF Agent] Failed to search ${repoName}:`, error.message);
      // Try fallback to local filesystem if available
      try {
        const repoPath = REPO_PATHS[repoName];
        if (repoPath) {
          const files = await findFiles(repoPath, query, file_type);
          results.push(...files.map(f => ({
            repo: repoName,
            path: path.relative(repoPath, f),
            source: 'local'
          })));
        }
      } catch (fallbackError) {
        // Both GitHub and local failed
      }
    }
  }

  return JSON.stringify({
    success: true,
    query,
    results: results.slice(0, 20), // Limit to 20 results
    total_found: results.length
  });
}

/**
 * Find files matching a query
 */
async function findFiles(dir, query, fileType, results = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .git, etc.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        await findFiles(fullPath, query, fileType, results);
      } else {
        // Check if file matches query
        const matchesQuery = entry.name.toLowerCase().includes(query.toLowerCase());
        const matchesType = !fileType || entry.name.endsWith(`.${fileType}`);

        if (matchesQuery && matchesType) {
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory might not exist
  }

  return results;
}

/**
 * Read a specific file (using GitHub API + Redis cache)
 */
async function readFile({ path: filePath, repo, start_line, end_line }) {
  const repoMapping = REPO_MAPPINGS[repo];
  if (!repoMapping) {
    return JSON.stringify({ error: `Unknown repository: ${repo}` });
  }

  try {
    // Fetch file content from GitHub (with Redis caching)
    const fileData = await redisCache.getFileContent(
      repoMapping.key,
      filePath,
      repoMapping.branch
    );

    const content = fileData.decodedContent;
    const lines = content.split('\n');

    // Apply line range if specified
    const startIdx = start_line ? Math.max(0, start_line - 1) : 0;
    const endIdx = end_line ? Math.min(lines.length, end_line) : lines.length;
    const selectedLines = lines.slice(startIdx, endIdx);

    // Add line numbers
    const numberedContent = selectedLines.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n');

    return JSON.stringify({
      success: true,
      path: filePath,
      repo,
      total_lines: lines.length,
      showing_lines: `${startIdx + 1}-${endIdx}`,
      content: numberedContent.slice(0, 10000) // Limit content size
    });
  } catch (error) {
    console.error(`[BYOF Agent] Failed to read file from GitHub:`, error.message);

    // Fallback to local filesystem if available
    try {
      const repoPath = REPO_PATHS[repo];
      if (repoPath) {
        const fullPath = path.join(repoPath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        const startIdx = start_line ? Math.max(0, start_line - 1) : 0;
        const endIdx = end_line ? Math.min(lines.length, end_line) : lines.length;
        const selectedLines = lines.slice(startIdx, endIdx);
        const numberedContent = selectedLines.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n');

        return JSON.stringify({
          success: true,
          path: filePath,
          repo,
          total_lines: lines.length,
          showing_lines: `${startIdx + 1}-${endIdx}`,
          content: numberedContent.slice(0, 10000),
          source: 'local'
        });
      }
    } catch (fallbackError) {
      // Both GitHub and local failed
    }

    return JSON.stringify({
      success: false,
      error: `Failed to read file: ${error.message}`,
      path: filePath,
      repo
    });
  }
}

/**
 * List files in a directory (using GitHub API)
 */
async function listFiles({ directory, repo, recursive = false }) {
  const repoMapping = REPO_MAPPINGS[repo];
  if (!repoMapping) {
    return JSON.stringify({ error: `Unknown repository: ${repo}` });
  }

  try {
    if (recursive) {
      // For recursive, use repository tree
      const tree = await githubAPI.getRepoTree(repoMapping.key, repoMapping.branch);

      // Filter tree to only items in the specified directory
      const dirPrefix = directory === '' || directory === '.' ? '' : directory + '/';
      const files = tree.tree
        .filter(item => {
          if (!dirPrefix) return true; // Root directory, include everything
          return item.path.startsWith(dirPrefix);
        })
        .map(item => ({
          name: item.path.split('/').pop(),
          type: item.type === 'blob' ? 'file' : 'directory',
          path: item.path,
          size: item.size
        }))
        .slice(0, 50); // Limit to 50 files

      return JSON.stringify({
        success: true,
        directory,
        repo,
        files
      });
    } else {
      // For non-recursive, use listDirectory
      const contents = await githubAPI.listDirectory(repoMapping.key, directory, repoMapping.branch);

      const files = contents.map(item => ({
        name: item.name,
        type: item.type === 'file' ? 'file' : 'directory',
        path: item.path,
        size: item.size
      }));

      return JSON.stringify({
        success: true,
        directory,
        repo,
        files
      });
    }
  } catch (error) {
    console.error(`[BYOF Agent] Failed to list directory from GitHub:`, error.message);

    // Fallback to local filesystem if available
    try {
      const repoPath = REPO_PATHS[repo];
      if (repoPath) {
        const fullPath = path.join(repoPath, directory);
        const files = [];
        await listFilesRecursive(fullPath, files, recursive, repoPath);

        return JSON.stringify({
          success: true,
          directory,
          repo,
          files: files.slice(0, 50),
          source: 'local'
        });
      }
    } catch (fallbackError) {
      // Both GitHub and local failed
    }

    return JSON.stringify({
      success: false,
      error: `Failed to list directory: ${error.message}`,
      directory,
      repo
    });
  }
}

async function listFilesRecursive(dir, results, recursive, baseDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      results.push({ name: entry.name, type: 'directory', path: relativePath });
      if (recursive) {
        await listFilesRecursive(fullPath, results, recursive, baseDir);
      }
    } else {
      results.push({ name: entry.name, type: 'file', path: relativePath });
    }
  }
}

/**
 * Generate an implementation plan and save to database
 * @param {object} planData - Plan data from AI
 * @param {string} sessionId - Session ID to associate plan with
 */
async function generatePlan({ plan_markdown, summary, affected_files = [], priority = 'medium' }, sessionId) {
  // If no sessionId, just return the plan without saving
  if (!sessionId) {
    return JSON.stringify({
      success: true,
      plan_generated: true,
      summary,
      affected_files,
      priority,
      plan_markdown,
      message: 'Plan generated successfully. Present this to the user for approval.',
      warning: 'Plan not saved to database - no session ID provided'
    });
  }

  // Save plan to database
  try {
    const result = await byofService.createPlan(sessionId, {
      summary,
      plan_markdown,
      affected_files,
      priority
    });

    if (!result.success) {
      return JSON.stringify({
        success: false,
        error: result.error,
        plan_markdown,
        summary
      });
    }

    // Update session status to plan_ready
    await byofService.updateSessionStatus(sessionId, 'plan_ready');

    return JSON.stringify({
      success: true,
      plan_generated: true,
      plan_id: result.plan.id,
      summary,
      affected_files,
      priority,
      plan_markdown,
      message: 'Plan generated and saved successfully. The user can now review and approve it.'
    });
  } catch (error) {
    console.error('[BYOF Agent] Error saving plan:', error.message);
    return JSON.stringify({
      success: false,
      error: `Failed to save plan: ${error.message}`,
      plan_markdown,
      summary
    });
  }
}

/**
 * Process a user message and get AI response
 */
async function processUserMessage(session, userMessage, conversationHistory = []) {
  if (!userMessage || userMessage.trim() === '') {
    throw new Error('Message content is required and cannot be empty');
  }

  const client = getAnthropicClient();
  const systemPrompt = generateSystemPrompt(session);

  // Build messages array
  const messages = [
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    // Initial API call
    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: BYOF_TOOLS,
      messages
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input, session.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          });
        }
      }

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: BYOF_TOOLS,
        messages
      });
    }

    // Extract text response
    const textContent = response.content.find(c => c.type === 'text');

    return {
      content: textContent?.text || 'I apologize, but I was unable to generate a response.',
      role: 'assistant',
      tool_calls: response.content.filter(c => c.type === 'tool_use'),
      stop_reason: response.stop_reason
    };

  } catch (error) {
    console.error('[BYOF Agent] Error:', error.message);
    throw error;
  }
}

/**
 * Create a Forge agent instance for managing state
 */
function createForgeAgent(session) {
  const history = [];
  let state = {
    phase: 'investigating',
    planGenerated: false,
    planApproved: false
  };

  return {
    /**
     * Send a message to the agent and get a response
     */
    async chat(message) {
      const response = await processUserMessage(session, message, history);

      // Update history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: response.content });

      // Update state based on response
      if (response.content.toLowerCase().includes('ready to create a plan')) {
        state.phase = 'planning';
      }
      if (response.tool_calls?.some(t => t.name === 'generate_plan')) {
        state.planGenerated = true;
        state.phase = 'plan_ready';
      }

      return response;
    },

    /**
     * Get conversation history
     */
    getHistory() {
      return [...history];
    },

    /**
     * Get current agent state
     */
    getState() {
      return { ...state };
    },

    /**
     * Approve the generated plan
     */
    approvePlan() {
      if (!state.planGenerated) {
        throw new Error('No plan has been generated yet');
      }
      state.planApproved = true;
      state.phase = 'approved';
      return true;
    }
  };
}

module.exports = {
  createForgeAgent,
  processUserMessage,
  generateSystemPrompt,
  executeTool,
  BYOF_TOOLS,
  REPO_PATHS
};
