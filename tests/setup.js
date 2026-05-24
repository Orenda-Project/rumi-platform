/**
 * Global test setup for Rumi Platform
 *
 * Sets up environment variables and mocks for testing.
 * All tests run with NODE_ENV=test.
 */

// Ensure test environment
process.env.NODE_ENV = 'test';

// Default test environment variables (safe dummy values)
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-test-key';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.PORT = process.env.PORT || '3000';
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openrouter';

// Console suppression is done in jest.config.js via silent option if needed
