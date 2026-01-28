/**
 * Sprint 1 TDD: OpenRouter LLM Provider Tests (bd-273)
 *
 * Tests define the API contract for the LLM client factory
 * that routes through OpenRouter by default, with direct OpenAI fallback.
 *
 * Key requirements:
 * - Default: OpenRouter (LLM_PROVIDER=openrouter)
 * - Override: Direct OpenAI (LLM_PROVIDER=openai)
 * - Uses OpenAI SDK with swapped baseURL and headers
 * - Exposes createChatCompletion() method
 */

const path = require('path');

const llmClientPath = path.resolve(
  __dirname,
  '../../../bot/shared/services/llm-client.js'
);

// Mock the OpenAI SDK — constructor captures config for assertion
jest.mock('openai', () => {
  const mockCreate = jest.fn(async () => ({
    id: 'gen-test',
    model: 'openai/gpt-4o',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Test response' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));

  return jest.fn((config) => ({
    _config: config,
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    audio: {
      transcriptions: {
        create: jest.fn(async () => ({ text: 'transcribed text' })),
      },
    },
  }));
});

describe('LLM Client (OpenRouter Integration)', () => {
  let llmClient;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('default configuration (OpenRouter)', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
      process.env.APP_URL = 'https://test.railway.app';
      llmClient = require(llmClientPath);
    });

    test('exports createLLMClient function', () => {
      expect(typeof llmClient.createLLMClient).toBe('function');
    });

    test('exports getClient function for singleton access', () => {
      expect(typeof llmClient.getClient).toBe('function');
    });

    test('createLLMClient() configures OpenAI SDK with OpenRouter baseURL', () => {
      const client = llmClient.createLLMClient();
      expect(client._config.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    test('uses OPENROUTER_API_KEY for authentication', () => {
      const client = llmClient.createLLMClient();
      expect(client._config.apiKey).toBe('sk-or-test-key');
    });

    test('sets OpenRouter-specific default headers', () => {
      const client = llmClient.createLLMClient();
      expect(client._config.defaultHeaders).toBeDefined();
      expect(client._config.defaultHeaders['X-Title']).toBeDefined();
      expect(typeof client._config.defaultHeaders['X-Title']).toBe('string');
    });
  });

  describe('direct OpenAI configuration', () => {
    test('LLM_PROVIDER=openai uses direct OpenAI baseURL', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      llmClient = require(llmClientPath);
      const client = llmClient.createLLMClient();
      expect(client._config.apiKey).toBe('sk-openai-test');
      expect(client._config.baseURL).toBeUndefined();
    });
  });

  describe('getDefaultModel()', () => {
    test('returns configured model from LLM_MODEL env var', () => {
      process.env.LLM_MODEL = 'anthropic/claude-sonnet-4';
      llmClient = require(llmClientPath);
      expect(llmClient.getDefaultModel()).toBe('anthropic/claude-sonnet-4');
    });

    test('defaults to openai/gpt-4o when not set', () => {
      delete process.env.LLM_MODEL;
      llmClient = require(llmClientPath);
      expect(llmClient.getDefaultModel()).toBe('openai/gpt-4o');
    });
  });

  describe('getProviderInfo()', () => {
    test('returns current provider info', () => {
      process.env.LLM_PROVIDER = 'openrouter';
      llmClient = require(llmClientPath);
      const info = llmClient.getProviderInfo();
      expect(info.provider).toBe('openrouter');
      expect(info.baseURL).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('chat completion wrapper', () => {
    test('createChatCompletion() forwards to OpenAI SDK', async () => {
      process.env.LLM_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'sk-or-test';
      llmClient = require(llmClientPath);
      const client = llmClient.getClient();
      const result = await client.chat.completions.create({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.choices[0].message.content).toBe('Test response');
    });
  });
});
